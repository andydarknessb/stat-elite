import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, test, vi } from 'vitest';
import { createAppCore } from './appCore';
import { createStandInServer, createSupabaseServer, InviteRefused, serverFor } from './server';
import { openStore, type Store } from './store';

let stores = 0;

const GAME_SETUP = { opponentName: 'Hawks', gameDate: '2026-10-30' };

function setup(now = new Date('2026-10-30T18:00:00Z')) {
  const name = `test-${++stores}`;
  // one stand-in backend per test, shared by every reopen; `link.up` is the connection
  const link = { up: true };
  const server = createStandInServer(() => link.up);
  const open = () => createAppCore({ clock: () => now, store: openStore(name), server });
  return { core: open(), reopen: open, now, inspect: openStore(name), server, link };
}

// a second phone with its own empty store, signing in to the same server
function phoneOn(server: ReturnType<typeof createStandInServer>) {
  const name = `test-${++stores}`;
  const core = createAppCore({ clock: () => new Date('2026-10-30T18:00:00Z'), store: openStore(name), server });
  return { core, inspect: openStore(name) };
}

async function basketballGame(core: ReturnType<typeof createAppCore>) {
  const athleteId = await core.addAthlete({ name: 'Casey' });
  return core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
}

test('with no earlier Game, Game setup offers basketball in quarters against "Opponent", dated today', async () => {
  // local noon, so the local date is the 30th wherever the tests run
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });

  expect(await core.gameSetup(athleteId)).toEqual({
    sport: 'basketball',
    basketballPeriods: 'quarters',
    opponentName: 'Opponent',
    gameDate: '2026-10-30',
  });
});

test("Game setup is prefilled from the Athlete's newest Game, not another Athlete's", async () => {
  const { core, inspect, server } = setup(new Date(2026, 9, 30, 12));
  const casey = await core.addAthlete({ name: 'Casey' });
  const sam = await core.addAthlete({ name: 'Sam' });
  // inserted newest first, so only the created_at order picks the right Game
  const newer = createAppCore({ clock: () => new Date('2026-10-28T18:00:00Z'), store: inspect, server });
  const older = createAppCore({ clock: () => new Date('2026-10-20T18:00:00Z'), store: inspect, server });
  const later = createAppCore({ clock: () => new Date('2026-10-31T18:00:00Z'), store: inspect, server });
  await newer.startGame({
    athleteId: casey,
    opponentName: 'Hawks',
    gameDate: '2026-10-28',
    sport: 'basketball',
    periodFormat: 'halves',
  });
  await older.startGame({
    athleteId: casey,
    opponentName: 'Rams',
    gameDate: '2026-10-20',
    sport: 'softball',
    periodFormat: 'innings',
  });
  await later.startGame({ athleteId: sam, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });

  expect(await core.gameSetup(casey)).toEqual({
    sport: 'basketball',
    basketballPeriods: 'halves',
    opponentName: 'Hawks',
    gameDate: '2026-10-30',
  });
});

test('a stat tile tap counts on the live Game', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.recordTile(gameId, 'steal');

  const live = await core.liveGame(gameId);
  expect(live?.tiles.steal).toBe(1);
  expect(live?.tiles.assist).toBe(0);
});

test('each tap is an Event with its own ID, the next sequence number in its Game and the clock time', async () => {
  const { core, now } = setup();
  const gameA = await basketballGame(core);
  const gameB = await basketballGame(core);

  const [first, second] = await Promise.all([core.recordTile(gameA, 'steal'), core.recordTile(gameA, 'block')]);
  const other = await core.recordTile(gameB, 'steal');

  expect([first.seq, second.seq, other.seq]).toEqual([1, 2, 1]);
  expect(new Set([first.id, second.id, other.id]).size).toBe(3);
  expect(first.id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
  expect(first.client_ts).toBe(now.toISOString());
});

test('Home goes from no Athlete, to the Athlete, to their Game in progress', async () => {
  const { core } = setup();
  expect(await core.home()).toEqual({});

  const athleteId = await core.addAthlete({ name: 'Casey' });
  expect(await core.home()).toEqual({ athlete: { id: athleteId, name: 'Casey', jerseyNumber: null } });

  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'halves' });
  expect((await core.home()).liveGameId).toBe(gameId);
});

test('a Game takes the Opponent and date it was set up with, the Opponent trimmed, and refuses a blank one', async () => {
  const { core, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });

  const gameId = await core.startGame({
    athleteId,
    opponentName: '  Hawks ',
    gameDate: '2026-10-29',
    sport: 'basketball',
    periodFormat: 'halves',
  });

  expect(await inspect.games.get(gameId)).toMatchObject({ opponent_name: 'Hawks', game_date: '2026-10-29' });
  await expect(
    core.startGame({
      athleteId,
      opponentName: ' ',
      gameDate: '2026-10-29',
      sport: 'basketball',
      periodFormat: 'halves',
    }),
  ).rejects.toThrow();
  await expect(
    core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '', sport: 'basketball', periodFormat: 'halves' }),
  ).rejects.toThrow();
});

test('after a reload the Game in progress shows the same count and keeps counting', async () => {
  const { core, reopen } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal');

  const reloaded = reopen();

  expect((await reloaded.home()).liveGameId).toBe(gameId);
  expect((await reloaded.liveGame(gameId))?.tiles.steal).toBe(1);
  expect((await reloaded.recordTile(gameId, 'steal')).seq).toBe(2);
});

test('Undo appends a Retraction for the newest Event and leaves every Event as it was', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);
  const first = await core.recordTile(gameId, 'steal');
  const second = await core.recordTile(gameId, 'block');

  const retraction = await core.undo(gameId);

  expect(retraction).toMatchObject({ type: 'retraction', retracts_id: second.id, seq: 3, game_id: gameId });
  expect(await inspect.events.get(first.id)).toEqual(first);
  expect(await inspect.events.get(second.id)).toEqual(second);
  expect((await core.liveGame(gameId))?.tiles).toMatchObject({ steal: 1, block: 0 });
});

test('Undo steps back through un-retracted Events, newest first, then has nothing left', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal');
  await core.recordTile(gameId, 'block');
  await core.recordTile(gameId, 'assist');

  expect((await core.liveGame(gameId))?.undoable?.type).toBe('assist');
  await core.undo(gameId);
  expect((await core.liveGame(gameId))?.undoable?.type).toBe('block');
  await core.undo(gameId);
  await core.undo(gameId);

  expect(await core.undo(gameId)).toBeUndefined();
  expect(await core.liveGame(gameId)).toMatchObject({
    tiles: { steal: 0, block: 0, assist: 0 },
    undoable: undefined,
  });
});

test('after a reload Undo still steps back from the same Event', async () => {
  const { core, reopen } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal');
  await core.recordTile(gameId, 'block');
  await core.undo(gameId);

  const reloaded = reopen();

  expect((await reloaded.liveGame(gameId))?.tiles).toMatchObject({ steal: 1, block: 0 });
  expect((await reloaded.liveGame(gameId))?.undoable?.type).toBe('steal');
  expect(await reloaded.undo(gameId)).toMatchObject({ type: 'retraction', seq: 4 });
  expect((await reloaded.recordTile(gameId, 'steal')).seq).toBe(5);
});

test('an Athlete row holds only its synced columns; the photo is stored apart from it and never uploaded', async () => {
  const { core, inspect } = setup();
  const photo = new Blob(['jpeg bytes'], { type: 'image/jpeg' });

  const athleteId = await core.addAthlete({ name: 'Casey', jerseyNumber: '12', photo });

  const row = await inspect.athletes.get(athleteId);
  expect(Object.keys(row ?? {}).sort()).toEqual(['created_at', 'id', 'jersey_number', 'name', 'updated_at']);
  expect(row).toMatchObject({ name: 'Casey', jersey_number: '12' });
  expect((await inspect.athletePhotos.get(athleteId))?.photo.size).toBe(photo.size);
});

test('editing an Athlete changes its name and number and stamps updated_at with the edit time', async () => {
  const { core, inspect, now, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey', jerseyNumber: '12' });
  const later = new Date('2026-10-30T19:00:00Z');

  await createAppCore({ clock: () => later, store: inspect, server }).editAthlete({
    id: athleteId,
    name: 'Casey Jones',
    jerseyNumber: '7',
  });

  expect(await inspect.athletes.get(athleteId)).toEqual({
    id: athleteId,
    name: 'Casey Jones',
    jersey_number: '7',
    created_at: now.toISOString(),
    updated_at: later.toISOString(),
  });
});

test('switching Athletes changes whose Games Home shows and whom Start Game records; the choice survives a reload', async () => {
  const { core, inspect, reopen } = setup();
  const firstId = await core.addAthlete({ name: 'Casey' });
  const secondId = await core.addAthlete({ name: 'Sam' });
  const shownAtStart = (await core.home()).athlete?.id;
  const other = shownAtStart === firstId ? secondId : firstId;

  await core.switchAthlete(other);
  const home = await core.home();
  expect(home.athlete?.id).toBe(other);
  expect(home.next?.id).toBe(shownAtStart);
  const gameId = await core.startGame({
    athleteId: home.athlete!.id,
    ...GAME_SETUP,
    sport: 'basketball',
    periodFormat: 'quarters',
  });

  expect((await inspect.games.get(gameId))?.athlete_id).toBe(other);
  expect(await reopen().home()).toMatchObject({ athlete: { id: other }, liveGameId: gameId });

  await core.switchAthlete(shownAtStart!);
  expect((await core.home()).liveGameId).toBeUndefined();
});

test('adjusting the strip records a score Event holding absolute Team and Opponent scores', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);

  await core.adjustScore(gameId, 'team', 1);
  const opponent = await core.adjustScore(gameId, 'opponent', 1);
  const team = await core.adjustScore(gameId, 'team', 1);

  expect(opponent).toMatchObject({ type: 'score', seq: 2, team_score: 1, opponent_score: 1 });
  expect(await inspect.events.get(team?.id ?? '')).toMatchObject({ type: 'score', team_score: 2, opponent_score: 1 });
});

test('the strip never goes below zero, and a refused adjustment writes no Event', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  expect(await core.adjustScore(gameId, 'team', -1)).toBeUndefined();
  expect((await core.liveGame(gameId))?.score).toEqual({ team: 0, opponent: 0 });
  expect(await core.undo(gameId)).toBeUndefined();
});

test('after a reload the strip shows the latest Score Snapshot', async () => {
  const { core, reopen } = setup();
  const gameId = await basketballGame(core);
  await core.adjustScore(gameId, 'team', 1);
  await core.adjustScore(gameId, 'team', 1);
  await core.adjustScore(gameId, 'opponent', 1);

  expect((await reopen().liveGame(gameId))?.score).toEqual({ team: 2, opponent: 1 });
});

test('Undo of a score Event takes the strip back to the Snapshot before it', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  await core.adjustScore(gameId, 'team', 1);
  await core.adjustScore(gameId, 'team', 1);

  await core.undo(gameId);

  expect((await core.liveGame(gameId))?.score).toEqual({ team: 1, opponent: 0 });
});

test('End Game records a game_end Event with the Final Score, and is refused without one', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);
  await core.adjustScore(gameId, 'team', 1);

  await expect(core.endGame(gameId, { teamScore: 1 } as never)).rejects.toThrow();
  await expect(core.endGame(gameId, { teamScore: -1, opponentScore: 0 })).rejects.toThrow();
  expect((await core.liveGame(gameId))?.final).toBeUndefined();

  const end = await core.endGame(gameId, { teamScore: 9, opponentScore: 7 });
  expect(await inspect.events.get(end.id)).toMatchObject({ type: 'game_end', team_score: 9, opponent_score: 7 });
  expect((await core.liveGame(gameId))?.final).toEqual({ team: 9, opponent: 7 });
});

test('a finished Game accepts no new Events, and Home stops showing it as the Game in progress', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal');
  await core.endGame(gameId, { teamScore: 5, opponentScore: 3 });

  await expect(core.recordTile(gameId, 'block')).rejects.toThrow();
  await expect(core.adjustScore(gameId, 'team', 1)).rejects.toThrow();
  await expect(core.undo(gameId)).rejects.toThrow();
  await expect(core.endGame(gameId, { teamScore: 6, opponentScore: 3 })).rejects.toThrow();
  expect(await core.liveGame(gameId)).toMatchObject({ final: { team: 5, opponent: 3 }, tiles: { steal: 1 } });
  expect((await core.home()).liveGameId).toBeUndefined();

  const athleteId = (await core.home()).athlete!.id;
  const nextGame = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  expect((await core.home()).liveGameId).toBe(nextGame);
});

test('a softball Game takes the same strip and End Game as basketball', async () => {
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });

  await core.adjustScore(gameId, 'opponent', 1);
  expect((await core.liveGame(gameId))?.score).toEqual({ team: 0, opponent: 1 });

  await core.endGame(gameId, { teamScore: 4, opponentScore: 1 });
  expect((await core.liveGame(gameId))?.final).toEqual({ team: 4, opponent: 1 });
});

test('with no account, writes stay on the phone, and the badge counts each row not yet uploaded', async () => {
  const { core, server } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal');

  expect(await core.sync()).toEqual({ signedIn: false, notSynced: 3 });
  expect(server.uploads).toEqual([]);
});

test("signing in makes the account the Owner of the phone's Athletes and uploads everything recorded so far, in order", async () => {
  const { core, server, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  const end = await core.endGame(gameId, { teamScore: 5, opponentScore: 3 });

  await core.signIn('casey@example.com');

  const owner = await server.session();
  expect(owner).toEqual(expect.any(String));
  expect(await inspect.athletes.get(athleteId)).toMatchObject({ owner_id: owner });
  expect(server.uploads).toEqual([`athletes:${athleteId}`, `games:${gameId}`, `events:${steal.id}`, `events:${end.id}`]);
  expect(server.rows.athletes.get(athleteId)).toMatchObject({ owner_id: owner });
  expect(server.rows.games.get(gameId)).toMatchObject({ owner_id: owner, athlete_id: athleteId });
  expect(server.rows.events.get(steal.id)).toMatchObject({ owner_id: owner, game_id: gameId });
  expect(await core.sync()).toEqual({ signedIn: true, notSynced: 0 });
});

test('signing in while the server is unreachable fails and leaves the Recorder signed out', async () => {
  const { core, link } = setup();
  link.up = false;

  await expect(core.signIn('casey@example.com')).rejects.toThrow();
  expect((await core.sync()).signedIn).toBe(false);
});

test('a write made while the server is unreachable waits on the phone, then uploads on the next flush', async () => {
  const { core, server, link } = setup();
  await core.signIn('casey@example.com');
  link.up = false;

  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.flush();
  expect(await core.sync()).toEqual({ signedIn: true, notSynced: 1 });
  expect(server.rows.athletes.has(athleteId)).toBe(false);

  link.up = true;
  await core.flush();
  expect(await core.sync()).toEqual({ signedIn: true, notSynced: 0 });
  expect(server.rows.athletes.has(athleteId)).toBe(true);
});

test('the Supabase upload ignores an Event already on the server, and replaces an Athlete or Game only with a copy at least as new', async () => {
  const calls: unknown[][] = [];
  const client = {
    from: (table: string) => ({
      upsert: async (_row: unknown, options: unknown) => {
        calls.push(['upsert', table, options]);
        return { error: null };
      },
      update: () => ({
        eq: (column: string, id: string) => ({
          lte: async (column2: string, value: string) => {
            calls.push(['update', table, column, id, column2, value]);
            return { error: null };
          },
        }),
      }),
    }),
  };
  const server = createSupabaseServer(client as never);

  await server.upload('events', { id: 'e1' });
  await server.upload('athletes', { id: 'a1', updated_at: '2026-10-30T18:00:00.000Z' });

  expect(calls).toEqual([
    ['upsert', 'events', { ignoreDuplicates: true }],
    ['upsert', 'athletes', { ignoreDuplicates: true }],
    ['update', 'athletes', 'id', 'a1', 'updated_at', '2026-10-30T18:00:00.000Z'],
  ]);
});

test('the Supabase download reads every page of rows the account can see, with timestamps as the phone writes them', async () => {
  const rows = Array.from({ length: 1001 }, (_, i) => ({
    id: `a${String(i).padStart(4, '0')}`,
    name: 'Casey',
    jersey_number: null,
    created_at: '2026-10-30T18:00:00.123456+00:00',
    updated_at: '2026-10-30T18:00:00+00:00',
  }));
  const pages: [number, number][] = [];
  const client = {
    from: () => ({
      select: () => ({
        order: () => ({
          range: async (from: number, to: number) => {
            pages.push([from, to]);
            return { data: rows.slice(from, to + 1), error: null };
          },
        }),
      }),
    }),
  };
  const server = createSupabaseServer(client as never);

  const downloaded = await server.download('athletes');

  expect(downloaded).toHaveLength(1001);
  expect(pages).toEqual([
    [0, 999],
    [1000, 1999],
    [2000, 2999],
  ]);
  expect(downloaded[0]).toMatchObject({
    created_at: '2026-10-30T18:00:00.123Z',
    updated_at: '2026-10-30T18:00:00.000Z',
  });
});

test('a deployed build with no Supabase config refuses to sign in, rather than pretend to upload', async () => {
  const server = serverFor({ host: 'stat-elite.netlify.app' });

  await expect(server.signIn('casey@example.com')).rejects.toThrow('not set up');
  expect(await server.session()).toBeUndefined();
});

test('the server keeps the newer copy of an Athlete when an older one arrives after it', async () => {
  const { server } = setup();
  const newer = { id: 'a1', name: 'Casey Jones', updated_at: '2026-10-30T19:00:00.000Z' };
  const older = { id: 'a1', name: 'Casey', updated_at: '2026-10-30T18:00:00.000Z' };

  await server.upload('athletes', newer);
  await server.upload('athletes', older);

  expect(server.rows.athletes.get('a1')).toEqual(newer);
});

test('rows recorded before the outbox existed are queued when it is first opened: Athletes, then Games, then Events in order', async () => {
  const name = `test-${++stores}`;
  // the phone's database as the build before the outbox left it
  const before = new Dexie(name);
  before.version(1).stores({ athletes: 'id, created_at', games: 'id, athlete_id', events: 'id, &[game_id+seq]' });
  before.version(2).stores({ athletePhotos: 'athlete_id', settings: 'key' });
  await before.open();
  await before.table('athletes').add({
    id: 'a1',
    name: 'Casey',
    jersey_number: null,
    created_at: '2026-10-30T18:00:00.000Z',
    updated_at: '2026-10-30T18:00:00.000Z',
  });
  await before.table('games').add({
    id: 'g1',
    athlete_id: 'a1',
    sport: 'basketball',
    period_format: 'quarters',
    opponent_name: 'Hawks',
    game_date: '2026-10-30',
    created_at: '2026-10-30T18:00:00.000Z',
    updated_at: '2026-10-30T18:00:00.000Z',
  });
  // e2 holds sequence 1, so a read in primary-key order would queue e1 first
  await before.table('events').bulkAdd([
    { id: 'e2', game_id: 'g1', seq: 1, client_ts: '2026-10-30T18:01:00.000Z', period: 1, type: 'steal', retracts_id: null, team_score: null, opponent_score: null },
    { id: 'e1', game_id: 'g1', seq: 2, client_ts: '2026-10-30T18:02:00.000Z', period: 1, type: 'steal', retracts_id: null, team_score: null, opponent_score: null },
  ]);
  before.close();

  expect(await openStore(name).outbox.toArray()).toEqual([
    { seq: 1, table: 'athletes', id: 'a1' },
    { seq: 2, table: 'games', id: 'g1' },
    { seq: 3, table: 'events', id: 'e2' },
    { seq: 4, table: 'events', id: 'e1' },
  ]);
});

test("signing in on an empty phone brings down the account's Athletes, Games and Events", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey', jerseyNumber: '12' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  const end = await core.endGame(gameId, { teamScore: 5, opponentScore: 3 });
  await core.signIn('casey@example.com');

  const second = phoneOn(server);
  await second.core.signIn('casey@example.com');

  expect(await second.inspect.athletes.get(athleteId)).toMatchObject({
    name: 'Casey',
    jersey_number: '12',
    owner_id: await server.session(),
  });
  expect(await second.inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId, opponent_name: 'Hawks' });
  expect(await second.inspect.events.get(steal.id)).toEqual(steal);
  expect(await second.inspect.events.get(end.id)).toEqual(end);
  expect(await second.core.sync()).toEqual({ signedIn: true, notSynced: 0 });
});

test('a Game edited elsewhere replaces the phone copy at its next sign-in, when the edit is later', async () => {
  const { core, server, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.signIn('casey@example.com');
  const game = await inspect.games.get(gameId);
  // another phone's later edit, already on the server
  const edited = { ...game!, owner_id: await server.session(), opponent_name: 'Rams', updated_at: '2026-10-30T20:00:00.000Z' };
  await server.upload('games', edited);

  await core.signIn('casey@example.com');

  expect(await inspect.games.get(gameId)).toMatchObject({ opponent_name: 'Rams', updated_at: '2026-10-30T20:00:00.000Z' });
});

test('a sign-in brings no photo down, and adds only the Events the phone lacks, never overwriting one it holds', async () => {
  const { core, server } = setup();
  const photo = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
  const athleteId = await core.addAthlete({ name: 'Casey', photo });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  await core.signIn('casey@example.com');
  const second = phoneOn(server);

  await second.core.signIn('casey@example.com');
  expect(await second.inspect.athletePhotos.get(athleteId)).toBeUndefined();
  expect((await second.core.home()).athlete).toEqual({ id: athleteId, name: 'Casey', jerseyNumber: null });

  // the first phone adds an Event the second lacks; the server then holds a differing copy of one the second has
  const block = await core.recordTile(gameId, 'block');
  await core.flush();
  const differing = { ...steal, owner_id: await server.session(), client_ts: '2026-10-30T19:59:00.000Z' };
  server.rows.events.set(steal.id, differing);

  await second.core.signIn('casey@example.com');
  expect(await second.inspect.events.where('game_id').equals(gameId).sortBy('seq')).toEqual([steal, block]);
  expect(await second.inspect.settings.get('downloadedFor')).toEqual({
    key: 'downloadedFor',
    value: await server.session(),
  });
});

test('a download that fails for another reason does not stop uploads, and the next flush tries it again', async () => {
  const { core, server, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const download = server.download;
  server.download = async () => {
    throw new Error('select refused');
  };

  await core.signIn('casey@example.com');

  expect(server.uploads).toEqual([`athletes:${athleteId}`]);
  expect(await core.sync()).toEqual({ signedIn: true, notSynced: 0 });
  expect(await inspect.settings.get('downloadedFor')).toBeUndefined();

  server.download = download;
  await core.flush();
  expect(await inspect.settings.get('downloadedFor')).toEqual({
    key: 'downloadedFor',
    value: await server.session(),
  });
});

test('an Athlete edited on one phone reaches the other at its next sign-in, and the later edit wins on both', async () => {
  const { core, server, inspect, link } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.signIn('casey@example.com');
  const second = phoneOn(server);
  await second.core.signIn('casey@example.com');
  // an edit made at `at` on the phone holding `store`, uploaded before the call returns
  const editAt = async (store: Store, at: string, name: string) => {
    const phone = createAppCore({ clock: () => new Date(at), store, server });
    await phone.editAthlete({ id: athleteId, name, jerseyNumber: '12' });
    await phone.flush();
  };

  await editAt(second.inspect, '2026-10-30T19:00:00Z', 'Casey Jones');
  await editAt(inspect, '2026-10-30T20:00:00Z', 'Casey Smith');
  await second.core.signIn('casey@example.com');

  expect((await second.inspect.athletes.get(athleteId))?.name).toBe('Casey Smith');
  expect((await inspect.athletes.get(athleteId))?.name).toBe('Casey Smith');

  // an edit still waiting on the second phone is newer than the server's copy, so it stays and uploads
  link.up = false;
  await editAt(second.inspect, '2026-10-30T21:00:00Z', 'Casey Lee');
  link.up = true;
  await second.core.signIn('casey@example.com');

  expect((await second.inspect.athletes.get(athleteId))?.name).toBe('Casey Lee');
  expect(server.rows.athletes.get(athleteId)).toMatchObject({ name: 'Casey Lee' });
});

// a phone with its own session on the same backend: a different account from the Owner's
function otherAccount(server: ReturnType<typeof createStandInServer>) {
  const name = `test-${++stores}`;
  const phoneServer = server.phone();
  const core = createAppCore({ clock: () => new Date('2026-10-30T18:00:00Z'), store: openStore(name), server: phoneServer });
  return { core, inspect: openStore(name), server: phoneServer };
}

test('only the Owner can make an Invite, and it names one Athlete', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.signIn('casey@example.com');

  const token = await core.createInvite(athleteId);

  expect(server.invites.get(token)).toMatchObject({ athlete_id: athleteId });
  const stranger = otherAccount(server);
  await stranger.core.signIn('sam@example.com');
  await expect(stranger.core.createInvite(athleteId)).rejects.toThrow();
});

test('an Invite expires 7 days after it is made', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.signIn('casey@example.com');
  const before = Date.now();

  const token = await core.createInvite(athleteId);

  const expires = server.invites.get(token)!.expires;
  expect(expires).toBeGreaterThanOrEqual(before + 7 * 24 * 60 * 60_000);
  expect(expires).toBeLessThanOrEqual(Date.now() + 7 * 24 * 60 * 60_000);
});

test('accepting an Invite makes the account a Member, and brings its Athlete and Games down to the phone', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  await core.signIn('casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await member.core.signIn('sam@example.com');

  await member.core.acceptInvite(token);

  expect(await member.inspect.athletes.get(athleteId)).toMatchObject({ name: 'Casey', owner_id: await server.session() });
  expect(await member.inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId, opponent_name: 'Hawks' });
  expect(await member.inspect.events.get(steal.id)).toEqual(steal);
  expect((await member.core.home()).athlete?.id).toBe(athleteId);
});

test('an Invite works once: another account is refused, and the account that accepted it may accept again', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.signIn('casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await member.core.signIn('sam@example.com');
  await member.core.acceptInvite(token);

  // a retry after a failed download is the same account, not a second use
  await member.core.acceptInvite(token);
  const other = otherAccount(server);
  await other.core.signIn('lee@example.com');
  await expect(other.core.acceptInvite(token)).rejects.toMatchObject({ reason: 'used' });
});

test('an expired Invite is refused and makes no Member', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.signIn('casey@example.com');
  const token = await core.createInvite(athleteId);
  server.invites.get(token)!.expires = Date.now() - 1;
  const member = otherAccount(server);
  await member.core.signIn('sam@example.com');

  await expect(member.core.acceptInvite(token)).rejects.toMatchObject({ reason: 'expired' });
  expect(await member.inspect.athletes.count()).toBe(0);
});

test("a stranger signing in downloads none of an Athlete's rows", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.recordTile(gameId, 'steal');
  await core.signIn('casey@example.com');

  const stranger = otherAccount(server);
  await stranger.core.signIn('lee@example.com');

  expect(await stranger.inspect.athletes.count()).toBe(0);
  expect(await stranger.inspect.games.count()).toBe(0);
  expect(await stranger.inspect.events.count()).toBe(0);
});

test('Invite co-parent is offered only by the Owner of a signed-in Athlete', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  expect(await core.canInvite(athleteId)).toBe(false);
  await core.signIn('casey@example.com');
  expect(await core.canInvite(athleteId)).toBe(true);
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await member.core.signIn('sam@example.com');
  await member.core.acceptInvite(token);

  expect(await member.core.canInvite(athleteId)).toBe(false);
});

test('the Supabase server makes an Invite as its Owner, sends it with the sign-in link, and names why an Invite was refused', async () => {
  vi.stubGlobal('location', { origin: 'https://stat-elite.netlify.app' });
  const calls: unknown[][] = [];
  const client = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } } }),
      signInWithOtp: async (args: unknown) => {
        calls.push(['signInWithOtp', args]);
        return { error: null };
      },
    },
    from: (table: string) => ({
      insert: (row: unknown) => ({
        select: () => ({
          single: async () => {
            calls.push(['insert', table, row]);
            return { data: { token: 't1' }, error: null };
          },
        }),
      }),
    }),
    rpc: async (name: string, args: unknown) => {
      calls.push(['rpc', name, args]);
      return { error: { message: 'invite_used' } };
    },
  };
  const server = createSupabaseServer(client as never);

  expect(await server.createInvite('a1')).toBe('t1');
  await expect(server.acceptInvite('t1')).rejects.toBeInstanceOf(InviteRefused);
  await server.signIn('casey@example.com', 't1');

  vi.unstubAllGlobals();
  expect(calls).toEqual([
    ['insert', 'invites', { athlete_id: 'a1', owner_id: 'owner-1' }],
    ['rpc', 'accept_invite', { invite_token: 't1' }],
    [
      'signInWithOtp',
      { email: 'casey@example.com', options: { emailRedirectTo: 'https://stat-elite.netlify.app/?invite=t1' } },
    ],
  ]);
});

test("the Owner opening its own Invite is refused, and the link still works for a co-parent", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.signIn('casey@example.com');
  const token = await core.createInvite(athleteId);

  await expect(core.acceptInvite(token)).rejects.toMatchObject({ reason: 'own' });
  const member = otherAccount(server);
  await member.core.signIn('sam@example.com');
  await member.core.acceptInvite(token);

  expect((await member.core.home()).athlete?.id).toBe(athleteId);
});

test("a Member's phone is not the Owner, and offers no Game in progress to record on", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.signIn('casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await member.core.signIn('sam@example.com');
  await member.core.acceptInvite(token);

  expect(await member.core.isOwner(athleteId)).toBe(false);
  expect(await core.isOwner(athleteId)).toBe(true);
  expect((await member.core.home()).liveGameId).toBeUndefined();
  expect((await core.home()).liveGameId).toBe(gameId);
});

test('a Member whose download fails on accepting has the Athlete and its Games at the next flush', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.signIn('casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  // this sign-in downloads too, and marks the download done for the account
  await member.core.signIn('sam@example.com');
  const download = member.server.download;
  member.server.download = async () => {
    throw new Error('select refused');
  };

  await expect(member.core.acceptInvite(token)).rejects.toThrow('select refused');
  member.server.download = download;
  await member.core.flush();

  expect(await member.inspect.athletes.get(athleteId)).toMatchObject({ name: 'Casey' });
  expect(await member.inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId });
});
