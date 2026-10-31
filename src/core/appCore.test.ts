import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { createAppCore } from './appCore';
import { openStore } from './store';

let stores = 0;

function setup() {
  const name = `test-${++stores}`;
  const now = new Date('2026-10-30T18:00:00Z');
  const open = () => createAppCore({ clock: () => now, store: openStore(name), server: {} });
  return { core: open(), reopen: open, now, inspect: openStore(name) };
}

async function basketballGame(core: ReturnType<typeof createAppCore>) {
  const athleteId = await core.addAthlete({ name: 'Casey' });
  return core.startGame({ athleteId, sport: 'basketball', periodFormat: 'quarters' });
}

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
  expect(await core.home()).toEqual({ athlete: { id: athleteId, name: 'Casey' } });

  const gameId = await core.startGame({ athleteId, sport: 'basketball', periodFormat: 'halves' });
  expect((await core.home()).liveGameId).toBe(gameId);
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
