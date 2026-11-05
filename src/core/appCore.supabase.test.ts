import 'fake-indexeddb/auto';
import type { PGlite } from '@electric-sql/pglite';
import { expect, test } from 'vitest';
import { createAppCore, type AppCore } from './appCore';
import { createSupabaseServer } from './server';
import { openStore } from './store';
import { schemaDatabase, supabaseDouble } from './supabaseDouble';

const CODE = '123456';
let stores = 0;

// a phone: its own store, and its own Supabase client over the same database, as a second device would have
function phone(db: PGlite) {
  const name = `supabase-scenario-${++stores}`;
  const server = createSupabaseServer(supabaseDouble(db));
  const core = createAppCore({ clock: () => new Date('2026-10-30T18:00:00Z'), store: openStore(name), server });
  return { core, inspect: openStore(name) };
}
type Phone = ReturnType<typeof phone>;

async function signIn(core: AppCore, email: string) {
  await core.signIn(email);
  await core.verifyCode(email, CODE);
}

// after a command, the queue has uploaded: nothing is left unsynced on any of the phones
async function settled(...phones: Phone[]) {
  for (const { core } of phones) {
    await core.flush();
    expect((await core.sync()).notSynced).toBe(0);
  }
}

const TOTALS = {
  team: 40,
  opponent: 30,
  shots: { 2: { made: 1, attempted: 2 }, 3: { made: 0, attempted: 0 } },
  freeThrows: { made: 2, attempted: 3 },
  tiles: { reb_off: 0, reb_def: 1, assist: 2, steal: 0, block: 0, turnover: 1, foul: 0 },
};

test('an Owner and a Member record through the real adapter over the double: nothing is left unsynced, and a second Owner phone downloads the same Games', async () => {
  const db = await schemaDatabase();
  const owner = phone(db);
  const member = phone(db);
  const secondOwnerPhone = phone(db);

  await signIn(owner.core, 'casey@example.com');
  const athleteId = await owner.core.addAthlete({ name: 'Casey' });
  await settled(owner);
  const token = await owner.core.createInvite(athleteId);

  await signIn(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);
  await member.core.refresh();
  await settled(member);

  const basketball = await owner.core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-30', sport: 'basketball', periodFormat: 'quarters' });
  await settled(owner, member);
  await owner.core.recordShot(basketball, { x: 42.5, y: 18, value: 2, made: true });
  await settled(owner, member);
  await owner.core.recordFreeThrow(basketball, false);
  await settled(owner, member);
  await owner.core.recordTile(basketball, 'steal');
  await settled(owner, member);
  await owner.core.nextPeriod(basketball);
  await settled(owner, member);
  await owner.core.adjustScore(basketball, 'team', 1);
  await settled(owner, member);
  await owner.core.toggleSub(basketball);
  await settled(owner, member);
  await owner.core.endGame(basketball, { teamScore: 41, opponentScore: 37 });
  await settled(owner, member);

  const softball = await member.core.startGame({ athleteId, opponentName: 'Rams', gameDate: '2026-10-31', sport: 'softball', periodFormat: 'innings' });
  await settled(owner, member);
  await member.core.recordPitch(softball, 'ball');
  await settled(owner, member);
  await member.core.recordPitch(softball, 'called_strike');
  await settled(owner, member);
  await member.core.recordPlateAppearance(softball, { outcome: 'single', rbi: 1 });
  await settled(owner, member);
  await member.core.recordBaserunning(softball, { base: 'second', stolen: true });
  await settled(owner, member);
  await member.core.undo(softball);
  await settled(owner, member);
  await member.core.endGame(softball, { teamScore: 5, opponentScore: 4 });
  await settled(owner, member);

  await member.core.editAthlete({ id: athleteId, name: 'Casey J', jerseyNumber: '7' });
  await settled(owner, member);
  const backlog = await owner.core.backlogGame({ athleteId, sport: 'basketball', opponentName: 'Bulls', gameDate: '2026-10-29', totals: TOTALS });
  await settled(owner, member);
  await owner.core.editBacklog(backlog, { opponentName: 'Bulls', gameDate: '2026-10-29', totals: TOTALS });
  await settled(owner, member);
  await owner.core.removeGame(backlog);
  await settled(owner, member);

  await signIn(secondOwnerPhone.core, 'casey@example.com');
  await secondOwnerPhone.core.refresh();
  await settled(secondOwnerPhone);

  // launch and reconnect bring the account's rows down, so each phone reads the Games the others wrote
  await owner.core.refresh();
  await member.core.refresh();
  await settled(owner, member);
  const gameIds = async (core: AppCore) => (await core.gameFeed(athleteId)).games.map((g) => g.id).sort();
  const ownerGames = await gameIds(owner.core);
  expect(ownerGames).toEqual([basketball, softball].sort());
  expect(await gameIds(secondOwnerPhone.core)).toEqual(ownerGames);
  expect(await gameIds(member.core)).toEqual(ownerGames);
});

test('an Event the per-type CHECK refuses stays queued after a drain, and the phone counts it as not synced', async () => {
  const db = await schemaDatabase();
  const owner = phone(db);
  await signIn(owner.core, 'casey@example.com');
  const athleteId = await owner.core.addAthlete({ name: 'Casey' });
  const gameId = await owner.core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-30', sport: 'basketball', periodFormat: 'quarters' });
  await settled(owner);

  // a Shot with no spot: the schema's per-type CHECK refuses it on upload
  const refused = {
    id: '30000000-0000-0000-0000-0000000000bb',
    game_id: gameId,
    seq: 1,
    client_ts: '2026-10-30T18:00:00.000Z',
    period: 1,
    type: 'shot' as const,
    retracts_id: null,
    court_x: null,
    court_y: null,
    shot_value: null,
    made: null,
    team_score: null,
    opponent_score: null,
    outcome: null,
    rbi: null,
    pitch: null,
    base: null,
    stolen: null,
  };
  await owner.inspect.events.add(refused);
  await owner.inspect.outbox.add({ table: 'events', id: refused.id });

  await owner.core.flush();
  await owner.core.flush();

  expect((await owner.core.sync()).notSynced).toBe(1);
  expect(await owner.inspect.outbox.toArray()).toEqual([expect.objectContaining({ table: 'events', id: refused.id })]);
});

test('a second Phone on the Account does not open on a Game another Phone started: home has no live Game, and recording on it writes nothing', async () => {
  const db = await schemaDatabase();
  const first = phone(db);
  const second = phone(db);

  await signIn(first.core, 'casey@example.com');
  const athleteId = await first.core.addAthlete({ name: 'Casey' });
  const gameId = await first.core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-30', sport: 'basketball', periodFormat: 'quarters' });
  await first.core.recordTile(gameId, 'steal');
  await settled(first);

  await signIn(second.core, 'casey@example.com');
  await second.core.refresh();
  await settled(second);
  expect((await second.core.home()).liveGameId).toBeUndefined();

  const before = { events: await second.inspect.events.count(), outbox: await second.inspect.outbox.count() };
  await expect(second.core.recordTile(gameId, 'steal')).rejects.toThrow();
  expect({ events: await second.inspect.events.count(), outbox: await second.inspect.outbox.count() }).toEqual(before);
});

test('the Recording Phone ends a Game and uploads it: a second Phone on the Account lists it as finished after refresh', async () => {
  const db = await schemaDatabase();
  const first = phone(db);
  const second = phone(db);

  await signIn(first.core, 'casey@example.com');
  const athleteId = await first.core.addAthlete({ name: 'Casey' });
  const gameId = await first.core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-30', sport: 'basketball', periodFormat: 'quarters' });
  await first.core.recordTile(gameId, 'steal');
  await settled(first);

  await signIn(second.core, 'casey@example.com');
  await second.core.refresh();
  await settled(second);

  await first.core.endGame(gameId, { teamScore: 41, opponentScore: 37 });
  await settled(first, second);
  await second.core.refresh();
  await settled(second);
  expect((await second.core.gameFeed(athleteId)).games.map((game) => game.id)).toEqual([gameId]);
});
