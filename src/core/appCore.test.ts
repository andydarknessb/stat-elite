import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, test } from 'vitest';
import { createAppCore } from './appCore';
import { createStandInServer, createSupabaseServer, serverFor } from './server';
import { openStore } from './store';

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
  // written out of order, so only the sequence number puts e1 first
  await before.table('events').bulkAdd([
    { id: 'e2', game_id: 'g1', seq: 2, client_ts: '2026-10-30T18:02:00.000Z', period: 1, type: 'steal', retracts_id: null, team_score: null, opponent_score: null },
    { id: 'e1', game_id: 'g1', seq: 1, client_ts: '2026-10-30T18:01:00.000Z', period: 1, type: 'steal', retracts_id: null, team_score: null, opponent_score: null },
  ]);
  before.close();

  expect(await openStore(name).outbox.toArray()).toEqual([
    { seq: 1, table: 'athletes', id: 'a1' },
    { seq: 2, table: 'games', id: 'g1' },
    { seq: 3, table: 'events', id: 'e1' },
    { seq: 4, table: 'events', id: 'e2' },
  ]);
});
