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
  expect(await core.home()).toEqual({ athlete: { id: athleteId, name: 'Casey', jerseyNumber: null } });

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
  const { core, inspect, now } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey', jerseyNumber: '12' });
  const later = new Date('2026-10-30T19:00:00Z');

  await createAppCore({ clock: () => later, store: inspect, server: {} }).editAthlete({
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
  const gameId = await core.startGame({ athleteId: home.athlete!.id, sport: 'basketball', periodFormat: 'quarters' });

  expect((await inspect.games.get(gameId))?.athlete_id).toBe(other);
  expect(await reopen().home()).toMatchObject({ athlete: { id: other }, liveGameId: gameId });

  await core.switchAthlete(shownAtStart!);
  expect((await core.home()).liveGameId).toBeUndefined();
});
