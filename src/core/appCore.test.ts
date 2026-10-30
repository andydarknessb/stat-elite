import 'fake-indexeddb/auto';
import { expect, test } from 'vitest';
import { createAppCore } from './appCore';
import { openStore } from './store';

let stores = 0;

function setup() {
  const name = `test-${++stores}`;
  const now = new Date('2026-10-30T18:00:00Z');
  const open = () => createAppCore({ clock: () => now, store: openStore(name), server: {} });
  return { core: open(), reopen: open, now };
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
