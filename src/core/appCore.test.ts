import 'fake-indexeddb/auto';
import Dexie from 'dexie';
import { expect, test, vi } from 'vitest';
import { arcPreset, createAppCore, periodLabel, type Base, type GameFormat } from './appCore';
import { createStandInServer, createSupabaseServer, InviteRefused, serverFor } from './server';
import { openStore, type Outcome, type Pitch, type Store } from './store';

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

// the six digits the stand-in accepts in place of the emailed code
const CODE = '123456';

// a phone signs in as the Save this game screen does: the link is sent, then the code is entered
async function signInWithCode(core: ReturnType<typeof createAppCore>, email: string) {
  await core.signIn(email);
  await core.verifyCode(email, CODE);
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

test('a Free Throw is an Event with a result and no spot, and the live Game counts made of attempted', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);

  const make = await core.recordFreeThrow(gameId, true);
  const miss = await core.recordFreeThrow(gameId, false);

  expect(await inspect.events.get(make.id)).toMatchObject({ type: 'free_throw', made: true, game_id: gameId });
  expect(await inspect.events.get(miss.id)).toMatchObject({ type: 'free_throw', made: false });
  expect((await core.liveGame(gameId))?.freeThrows).toEqual({ made: 1, attempted: 2 });
  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: miss.id, type: 'free_throw', made: false });
});

test('Undo takes a Free Throw out of the count, as it does a tile', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  await core.recordFreeThrow(gameId, true);
  await core.recordFreeThrow(gameId, false);

  await core.undo(gameId);

  expect((await core.liveGame(gameId))?.freeThrows).toEqual({ made: 1, attempted: 1 });
});

test('a Shot is one Event holding its spot, value and result', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);

  const shot = await core.recordShot(gameId, { x: 40.5, y: 30, value: 2, made: true });

  expect(await inspect.events.get(shot.id)).toMatchObject({
    type: 'shot',
    game_id: gameId,
    court_x: 40.5,
    court_y: 30,
    shot_value: 2,
    made: true,
  });
  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: shot.id, type: 'shot', made: true, value: 2 });
});

test('a Shot is refused without a spot on the court or a value of 2 or 3, and writes nothing', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await expect(core.recordShot(gameId, { x: 101, y: 30, value: 2, made: true })).rejects.toThrow();
  await expect(core.recordShot(gameId, { x: 50, y: NaN, value: 2, made: true })).rejects.toThrow();
  await expect(core.recordShot(gameId, { x: 50, y: 30, value: 4 as never, made: true })).rejects.toThrow();
  expect((await core.liveGame(gameId))?.undoable).toBeUndefined();
});

test('the arc presets a spot beyond it to 3 and a spot inside it to 2, corners included', () => {
  expect(arcPreset(50, 40)).toBe(2); // the key
  expect(arcPreset(50, 60)).toBe(2); // the arc's near edge
  expect(arcPreset(50, 65)).toBe(3); // past the arc
  expect(arcPreset(4, 20)).toBe(3); // corner: inside the arc's radius, but outside the line
  expect(arcPreset(7, 20)).toBe(2); // just past the corner line, on the arc side
  expect(arcPreset(96, 20)).toBe(3); // the other corner
});

test('the Recorder can flip the preset before the result, and the Shot keeps the value chosen', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);

  // beyond the arc, so the preset is 3; the Recorder flips it to 2
  const shot = await core.recordShot(gameId, { x: 50, y: 65, value: 2, made: true });

  expect(await inspect.events.get(shot.id)).toMatchObject({ shot_value: 2 });
  expect((await core.liveGame(gameId))?.score).toEqual({ team: 2, opponent: 0 });
});

test('made Shots and Free Throws add their points to the strip, and a miss adds none', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: true });
  await core.recordShot(gameId, { x: 50, y: 40, value: 2, made: false });
  await core.recordShot(gameId, { x: 50, y: 40, value: 2, made: true });
  await core.recordFreeThrow(gameId, true);
  await core.recordFreeThrow(gameId, false);

  expect((await core.liveGame(gameId))?.score).toEqual({ team: 6, opponent: 0 });
});

test('Shots after a Score Snapshot add to it, and Undo takes their points back out', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: true });
  await core.adjustScore(gameId, 'team', 1);
  await core.recordShot(gameId, { x: 50, y: 40, value: 2, made: true });
  expect((await core.liveGame(gameId))?.score).toEqual({ team: 6, opponent: 0 });

  await core.undo(gameId);
  expect((await core.liveGame(gameId))?.score).toEqual({ team: 4, opponent: 0 });
  await core.undo(gameId);
  expect((await core.liveGame(gameId))?.score).toEqual({ team: 3, opponent: 0 });
});

test("the live Game counts made of attempted Shots by value, and the Athlete's points", async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: true });
  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: false });
  await core.recordShot(gameId, { x: 50, y: 40, value: 2, made: true });
  await core.recordFreeThrow(gameId, true);

  const live = await core.liveGame(gameId);
  expect(live?.shots).toEqual({ 2: { made: 1, attempted: 1 }, 3: { made: 1, attempted: 2 } });
  expect(live?.points).toBe(6);
});

test("a Shot's spot, value and result reach the server and a second phone", async () => {
  const { core, server } = setup();
  const gameId = await basketballGame(core);
  const shot = await core.recordShot(gameId, { x: 12.5, y: 80, value: 3, made: false });
  await signInWithCode(core, 'casey@example.com');

  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');

  expect(await second.inspect.events.get(shot.id)).toEqual(shot);
});

test("a Plate Appearance's Outcome and RBI reach a second phone at sign-in", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
  const hit = await core.recordPlateAppearance(gameId, { outcome: 'triple', rbi: 3 });
  await signInWithCode(core, 'casey@example.com');

  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');

  expect(await second.inspect.events.get(hit.id)).toEqual(hit);
});

test('a Plate Appearance refuses an unknown Outcome or an RBI count outside 0 to 4', async () => {
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });

  await expect(core.recordPlateAppearance(gameId, { outcome: 'bunt' as Outcome, rbi: 0 })).rejects.toThrow();
  await expect(core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 5 })).rejects.toThrow();
  await expect(core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 1.5 })).rejects.toThrow();
  expect((await core.liveGame(gameId))?.batting.atBats).toBe(0);
});

test('a Free Throw keeps its result when a second phone downloads it at sign-in', async () => {
  const { core, server } = setup();
  const gameId = await basketballGame(core);
  const make = await core.recordFreeThrow(gameId, true);
  await signInWithCode(core, 'casey@example.com');

  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');

  expect(await second.inspect.events.get(make.id)).toEqual(make);
});

test('Button Size is Standard until a Recorder picks one, and the pick survives a reload', async () => {
  const { core, reopen } = setup();
  expect(await core.buttonSize()).toBe('standard');

  await core.setButtonSize('bleacher');

  expect(await reopen().buttonSize()).toBe('bleacher');
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

test('an Athlete added last is the one Home shows, with the one before it as Next, also after a reload', async () => {
  const { core, inspect, reopen, server } = setup();
  const caseyId = await core.addAthlete({ name: 'Casey' });
  // a later clock, so Sam is the newest Athlete
  const later = createAppCore({ clock: () => new Date('2026-10-30T18:05:00Z'), store: inspect, server });
  const samId = await later.addAthlete({ name: 'Sam' });

  expect(await core.home()).toMatchObject({ athlete: { id: samId }, next: { id: caseyId } });
  expect(await reopen().home()).toMatchObject({ athlete: { id: samId }, next: { id: caseyId } });
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

// a phone whose clock the test moves on with `tick`, so Shift times are exact
function clocked() {
  const name = `test-${++stores}`;
  const at = { now: new Date('2026-10-30T18:00:00Z') };
  const server = createStandInServer(() => true);
  const open = () => createAppCore({ clock: () => at.now, store: openStore(name), server });
  const tick = (seconds: number) => {
    at.now = new Date(at.now.getTime() + seconds * 1000);
  };
  return { core: open(), reopen: open, tick };
}

test('Sub In and Sub Out Events carry the scores on the strip at that moment', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);

  await core.adjustScore(gameId, 'team', 1);
  const subIn = await core.toggleSub(gameId);
  await core.adjustScore(gameId, 'opponent', 1);
  const subOut = await core.toggleSub(gameId);

  expect(await inspect.events.get(subIn.id)).toMatchObject({ type: 'sub_in', team_score: 1, opponent_score: 0 });
  expect(await inspect.events.get(subOut.id)).toMatchObject({ type: 'sub_out', team_score: 1, opponent_score: 1 });
});

test('Plus/Minus for a Shift is the change in each side between its Sub In and Sub Out, and the Game sums them', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.toggleSub(gameId);
  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: true });
  await core.adjustScore(gameId, 'opponent', 1);
  await core.toggleSub(gameId); // Sub Out at 3–1: +2
  await core.toggleSub(gameId); // Sub In at 3–1
  await core.adjustScore(gameId, 'opponent', 1);
  await core.adjustScore(gameId, 'opponent', 1);
  await core.adjustScore(gameId, 'team', 1);
  await core.toggleSub(gameId); // Sub Out at 4–3: 1 − 2 = −1

  const game = await core.liveGame(gameId);
  expect(game?.shifts.map((s) => s.plusMinus)).toEqual([2, -1]);
  expect(game?.plusMinus).toBe(1);
});

test("Playing Share is total Shift time over the Game's elapsed time, shown with the Shift count", async () => {
  const { core, tick } = clocked();
  const gameId = await basketballGame(core);

  await core.toggleSub(gameId); // on court at 0s
  tick(60);
  await core.toggleSub(gameId); // off at 60s: Shift 1 is 60s
  tick(60);
  await core.recordTile(gameId, 'steal'); // bench, 120s
  tick(60);
  await core.toggleSub(gameId); // on at 180s
  tick(120);
  await core.endGame(gameId, { teamScore: 0, opponentScore: 0 }); // Game ends at 300s, closing Shift 2 at 120s

  const game = await core.liveGame(gameId);
  expect(game?.shifts.map((s) => s.ms)).toEqual([60_000, 120_000]);
  expect(game?.playingShare).toBeCloseTo(180 / 300);
  await expect(core.toggleSub(gameId)).rejects.toThrow();
});

test('a Sub In with no Sub Out survives a restart: the Athlete is still on court and the timer is right', async () => {
  const { core, reopen, tick } = clocked();
  const gameId = await basketballGame(core);

  tick(30); // on the bench first, so the share is not 100%
  await core.toggleSub(gameId);
  tick(90);

  expect(await reopen().liveGame(gameId)).toMatchObject({ onCourt: true, shifts: [{ ms: 90_000 }], playingShare: 0.75 });
});

test('Playing Share counts from the Game start, so a bench Athlete whose first Sub In is late does not read 100%', async () => {
  const { core, tick } = clocked();
  const gameId = await basketballGame(core);

  tick(120); // on the bench from the Game's start
  await core.toggleSub(gameId); // Sub In at 120s
  tick(60);

  expect((await core.liveGame(gameId))?.playingShare).toBeCloseTo(60 / 180);
});

test('Playing Share stays at most 100% when the device clock steps back', async () => {
  const { core, tick } = clocked();
  const gameId = await basketballGame(core);

  tick(60);
  await core.toggleSub(gameId); // Sub In at 60s
  tick(140);
  await core.toggleSub(gameId); // Sub Out at 200s: Shift is 140s
  tick(-100); // the clock reads 100s now, under the 140s Shift

  expect((await core.liveGame(gameId))?.playingShare).toBe(1);
});

test('Next period records a period_start Event, and every Event after it carries the new Period', async () => {
  const { core, inspect } = setup();
  const gameId = await basketballGame(core);
  const before = await core.recordTile(gameId, 'steal');

  const start = await core.nextPeriod(gameId);
  const after = await core.recordTile(gameId, 'assist');

  expect(await inspect.events.get(before.id)).toMatchObject({ period: 1 });
  expect(await inspect.events.get(start.id)).toMatchObject({ type: 'period_start', period: 2, game_id: gameId });
  expect(await inspect.events.get(after.id)).toMatchObject({ type: 'assist', period: 2 });
});

test('Period labels follow the Game format: H1 and H2 for halves, Q1 to Q4 for quarters, then OT1, OT2 past regulation', async () => {
  expect([1, 2, 3, 4, 5, 6].map((p) => periodLabel('quarters', p))).toEqual(['Q1', 'Q2', 'Q3', 'Q4', 'OT1', 'OT2']);
  expect([1, 2, 3, 4].map((p) => periodLabel('halves', p))).toEqual(['H1', 'H2', 'OT1', 'OT2']);

  // the live Game names its Period in its own format, and a reload keeps it
  const { core, reopen } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'halves' });
  await core.nextPeriod(gameId);
  await core.nextPeriod(gameId);

  expect(await reopen().liveGame(gameId)).toMatchObject({ periodLabel: 'OT1' });
});

test('a Shift runs across a Period break: Next period does not end it', async () => {
  const { core, tick } = clocked();
  const gameId = await basketballGame(core);
  await core.toggleSub(gameId); // Sub In at 0s
  tick(60);
  await core.nextPeriod(gameId);
  tick(60);
  await core.toggleSub(gameId); // Sub Out at 120s

  expect(await core.liveGame(gameId)).toMatchObject({ onCourt: false, shifts: [{ ms: 120_000 }] });
});

test('a softball Game names its inning on the live Game, and Next period advances it', async () => {
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
  expect((await core.liveGame(gameId))?.periodLabel).toBe('Inn 1');

  await core.nextPeriod(gameId);

  expect((await core.liveGame(gameId))?.periodLabel).toBe('Inn 2');
});

test('the live Game splits its stats by Period, and the whole Game still sums them', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal'); // Period 1
  await core.nextPeriod(gameId);
  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: true }); // Period 2
  await core.recordFreeThrow(gameId, false); // Period 2

  const game = await core.liveGame(gameId);
  expect(game?.byPeriod[1]).toMatchObject({ tiles: { steal: 1 }, points: 0, freeThrows: { made: 0, attempted: 0 } });
  expect(game?.byPeriod[2]).toMatchObject({
    tiles: { steal: 0 },
    shots: { 3: { made: 1, attempted: 1 } },
    points: 3,
    freeThrows: { made: 0, attempted: 1 },
  });
  expect(game).toMatchObject({ tiles: { steal: 1 }, points: 3, freeThrows: { made: 0, attempted: 1 } });
});

test('Undo of Next period takes the Period back, and the next Event falls in the earlier one', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);
  const start = await core.nextPeriod(gameId);
  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: start.id, type: 'period_start' });

  await core.undo(gameId);

  expect((await core.liveGame(gameId))?.periodLabel).toBe('Q1');
  expect((await core.recordTile(gameId, 'steal')).period).toBe(1);
});

test("the open Shift's Plus/Minus runs to the strip now, Shots included, and Undo moves it", async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.toggleSub(gameId); // Sub In at 0–0
  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: true }); // 3–0
  await core.adjustScore(gameId, 'opponent', 1); // 3–1
  expect(await core.liveGame(gameId)).toMatchObject({ plusMinus: 2, shifts: [{ plusMinus: 2 }] });

  await core.undo(gameId); // retracts the opponent point: 3–0
  expect(await core.liveGame(gameId)).toMatchObject({ plusMinus: 3, shifts: [{ plusMinus: 3 }] });
});

test('a strip correction mid-Shift lands in that Shift once, with the Shot already on the strip', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.toggleSub(gameId); // Sub In at 0–0
  await core.recordShot(gameId, { x: 50, y: 65, value: 2, made: true }); // the strip adds 2: 2–0
  await core.adjustScore(gameId, 'team', -1); // the scoreboard says 1
  await core.toggleSub(gameId); // Sub Out at 1–0

  expect((await core.liveGame(gameId))?.shifts.map((s) => s.plusMinus)).toEqual([1]);
});

test('Undo of a Sub Out puts the Athlete back on court, and Undo of a Sub In takes the Shift away', async () => {
  const { core } = setup();
  const gameId = await basketballGame(core);

  await core.toggleSub(gameId);
  await core.toggleSub(gameId);
  await core.undo(gameId); // retracts the Sub Out
  expect(await core.liveGame(gameId)).toMatchObject({ onCourt: true, shifts: [{}] });

  await core.undo(gameId); // retracts the Sub In
  expect(await core.liveGame(gameId)).toMatchObject({ onCourt: false, shifts: [] });
});

test('with no account, writes stay on the phone, and the badge counts each row not yet uploaded', async () => {
  const { core, server } = setup();
  const gameId = await basketballGame(core);
  await core.recordTile(gameId, 'steal');

  expect(await core.sync()).toEqual({ signedIn: false, notSynced: 3 });
  expect(server.uploads).toEqual([]);
});

test("the link signs nothing in; the emailed code makes the account the Owner of the phone's Athletes and uploads everything recorded so far, in order", async () => {
  const { core, server, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  const end = await core.endGame(gameId, { teamScore: 5, opponentScore: 3 });

  await core.signIn('casey@example.com');
  expect(await core.sync()).toEqual({ signedIn: false, notSynced: 4 });
  expect(server.uploads).toEqual([]);
  await expect(core.verifyCode('casey@example.com', '12345')).rejects.toThrow();
  expect((await core.sync()).signedIn).toBe(false);

  await core.verifyCode('casey@example.com', CODE);

  const owner = await server.session();
  expect(owner).toEqual(expect.any(String));
  expect(await inspect.athletes.get(athleteId)).toMatchObject({ owner_id: owner });
  expect(server.uploads).toEqual([`athletes:${athleteId}`, `games:${gameId}`, `events:${steal.id}`, `events:${end.id}`]);
  expect(server.rows.athletes.get(athleteId)).toMatchObject({ owner_id: owner });
  expect(server.rows.games.get(gameId)).toMatchObject({ owner_id: owner, athlete_id: athleteId, recorded_by: owner });
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
  await signInWithCode(core, 'casey@example.com');
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
  await signInWithCode(core, 'casey@example.com');

  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');

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
  await signInWithCode(core, 'casey@example.com');
  const game = await inspect.games.get(gameId);
  // another phone's later edit, already on the server
  const edited = { ...game!, owner_id: await server.session(), opponent_name: 'Rams', updated_at: '2026-10-30T20:00:00.000Z' };
  await server.upload('games', edited);

  await signInWithCode(core, 'casey@example.com');

  expect(await inspect.games.get(gameId)).toMatchObject({ opponent_name: 'Rams', updated_at: '2026-10-30T20:00:00.000Z' });
});

test('a sign-in brings no photo down, and adds only the Events the phone lacks, never overwriting one it holds', async () => {
  const { core, server } = setup();
  const photo = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
  const athleteId = await core.addAthlete({ name: 'Casey', photo });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  await signInWithCode(core, 'casey@example.com');
  const second = phoneOn(server);

  await signInWithCode(second.core, 'casey@example.com');
  expect(await second.inspect.athletePhotos.get(athleteId)).toBeUndefined();
  expect((await second.core.home()).athlete).toEqual({ id: athleteId, name: 'Casey', jerseyNumber: null });

  // the first phone adds an Event the second lacks; the server then holds a differing copy of one the second has
  const block = await core.recordTile(gameId, 'block');
  await core.flush();
  const differing = { ...steal, owner_id: await server.session(), client_ts: '2026-10-30T19:59:00.000Z' };
  server.rows.events.set(steal.id, differing);

  await signInWithCode(second.core, 'casey@example.com');
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

  await signInWithCode(core, 'casey@example.com');

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
  await signInWithCode(core, 'casey@example.com');
  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');
  // an edit made at `at` on the phone holding `store`, uploaded before the call returns
  const editAt = async (store: Store, at: string, name: string) => {
    const phone = createAppCore({ clock: () => new Date(at), store, server });
    await phone.editAthlete({ id: athleteId, name, jerseyNumber: '12' });
    await phone.flush();
  };

  await editAt(second.inspect, '2026-10-30T19:00:00Z', 'Casey Jones');
  await editAt(inspect, '2026-10-30T20:00:00Z', 'Casey Smith');
  await signInWithCode(second.core, 'casey@example.com');

  expect((await second.inspect.athletes.get(athleteId))?.name).toBe('Casey Smith');
  expect((await inspect.athletes.get(athleteId))?.name).toBe('Casey Smith');

  // an edit still waiting on the second phone is newer than the server's copy, so it stays and uploads
  link.up = false;
  await editAt(second.inspect, '2026-10-30T21:00:00Z', 'Casey Lee');
  link.up = true;
  await signInWithCode(second.core, 'casey@example.com');

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
  await signInWithCode(core, 'casey@example.com');

  const token = await core.createInvite(athleteId);

  expect(server.invites.get(token)).toMatchObject({ athlete_id: athleteId });
  const stranger = otherAccount(server);
  await signInWithCode(stranger.core, 'sam@example.com');
  await expect(stranger.core.createInvite(athleteId)).rejects.toThrow();
});

test('an Invite expires 7 days after it is made', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
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
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');

  await member.core.acceptInvite(token);

  expect(await member.inspect.athletes.get(athleteId)).toMatchObject({ name: 'Casey', owner_id: await server.session() });
  expect(await member.inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId, opponent_name: 'Hawks' });
  expect(await member.inspect.events.get(steal.id)).toEqual(steal);
  expect((await member.core.home()).athlete?.id).toBe(athleteId);
});

test('an Invite works once: another account is refused, and the account that accepted it may accept again', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);

  // a retry after a failed download is the same account, not a second use
  await member.core.acceptInvite(token);
  const other = otherAccount(server);
  await signInWithCode(other.core, 'lee@example.com');
  await expect(other.core.acceptInvite(token)).rejects.toMatchObject({ reason: 'used' });
});

test('an expired Invite is refused and makes no Member', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  server.invites.get(token)!.expires = Date.now() - 1;
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');

  await expect(member.core.acceptInvite(token)).rejects.toMatchObject({ reason: 'expired' });
  expect(await member.inspect.athletes.count()).toBe(0);
});

test("a stranger signing in downloads none of an Athlete's rows", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.recordTile(gameId, 'steal');
  await signInWithCode(core, 'casey@example.com');

  const stranger = otherAccount(server);
  await signInWithCode(stranger.core, 'lee@example.com');

  expect(await stranger.inspect.athletes.count()).toBe(0);
  expect(await stranger.inspect.games.count()).toBe(0);
  expect(await stranger.inspect.events.count()).toBe(0);
});

test('Invite co-parent is offered only by the Owner of a signed-in Athlete', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  expect(await core.canInvite(athleteId)).toBe(false);
  await signInWithCode(core, 'casey@example.com');
  expect(await core.canInvite(athleteId)).toBe(true);
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);

  expect(await member.core.canInvite(athleteId)).toBe(false);
});

test('only the Owner removes a Member, and sees the Members to remove', async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);
  const memberId = (await member.server.session())!;
  const stranger = otherAccount(server);
  await signInWithCode(stranger.core, 'lee@example.com');

  await expect(member.core.removeMember(athleteId, memberId)).rejects.toThrow('Only the Owner can remove a Member');
  await expect(stranger.core.removeMember(athleteId, memberId)).rejects.toThrow('Only the Owner can remove a Member');
  expect(await core.members(athleteId)).toEqual([expect.objectContaining({ member_id: memberId })]);

  await core.removeMember(athleteId, memberId);

  expect(await core.members(athleteId)).toEqual([]);
});

// Casey, a Game the Owner recorded, and a Member joined to it who records a Game of its own with a steal
async function sharedWithAMember() {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);
  const memberGame = await member.core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'halves' });
  const steal = await member.core.recordTile(memberGame, 'steal');
  await member.core.flush();
  return { core, server, athleteId, member, memberId: (await member.server.session())!, memberGame, steal };
}

test("a removed Member's phone drops the Athlete, its Games and Events at its next download, and the Owner keeps the Games it recorded", async () => {
  const { core, server, athleteId, member, memberId, memberGame, steal } = await sharedWithAMember();

  await core.removeMember(athleteId, memberId);
  await member.core.refresh();

  expect(await member.inspect.athletes.get(athleteId)).toBeUndefined();
  expect(await member.inspect.games.count()).toBe(0);
  expect(await member.inspect.events.count()).toBe(0);
  expect((await member.core.home()).athlete).toBeUndefined();
  expect(server.rows.games.get(memberGame)).toMatchObject({ athlete_id: athleteId, recorded_by: memberId });
  expect(server.rows.events.get(steal.id)).toBeDefined();
});

test('a Member who leaves drops the Athlete from its phone at once, and its Games stay with the Athlete', async () => {
  const { core, server, athleteId, member, memberId, memberGame, steal } = await sharedWithAMember();

  await member.core.leave(athleteId);

  expect(await member.inspect.athletes.get(athleteId)).toBeUndefined();
  expect(await member.inspect.events.get(steal.id)).toBeUndefined();
  expect(await core.members(athleteId)).toEqual([]);
  expect(server.rows.games.get(memberGame)).toMatchObject({ recorded_by: memberId });
  expect((await core.home()).athlete?.id).toBe(athleteId);
});

test("a Member cannot leave while a row on the Athlete waits to upload, and the Game reaches the server before the leave", async () => {
  const { core, server, link } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);
  link.up = false;
  const gameId = await member.core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'halves' });
  const steal = await member.core.recordTile(gameId, 'steal');

  await expect(member.core.leave(athleteId)).rejects.toThrow('Not everything on this Athlete has synced yet');
  expect(await member.inspect.athletes.get(athleteId)).toBeDefined();

  link.up = true;
  await member.core.leave(athleteId);

  expect(server.rows.events.get(steal.id)).toBeDefined();
  expect(server.rows.games.get(gameId)).toMatchObject({ recorded_by: await member.server.session() });
  expect(await member.inspect.athletes.get(athleteId)).toBeUndefined();
});

test("an Athlete this phone made under an account is not dropped by a download, because no Owner shared it in", async () => {
  const { core, inspect } = setup();
  await signInWithCode(core, 'casey@example.com');
  // a row written under another account, as a sign-in as someone else would leave it: it was never shared with this phone
  await inspect.athletes.put({
    id: 'made-here',
    owner_id: 'another-account',
    name: 'Jordan',
    jersey_number: null,
    created_at: '2026-10-30T10:00:00.000Z',
    updated_at: '2026-10-30T10:00:00.000Z',
  });

  await core.refresh();

  expect(await inspect.athletes.get('made-here')).toMatchObject({ name: 'Jordan' });
});

test('the Supabase server removes a Member as the Owner, and names a removal the database refused', async () => {
  const removed: unknown[][] = [];
  let rows: unknown[] = [];
  const client = {
    auth: { getSession: async () => ({ data: { session: { user: { id: 'owner-1' } } } }) },
    from: (table: string) => ({
      delete: () => ({
        eq: (athleteColumn: string, athleteId: unknown) => ({
          eq: (memberColumn: string, memberId: unknown) => ({
            select: async () => {
              removed.push([table, athleteColumn, athleteId, memberColumn, memberId]);
              return { data: rows, error: null };
            },
          }),
        }),
      }),
    }),
  };
  const server = createSupabaseServer(client as never);

  await expect(server.removeMember('a1', 'm1')).rejects.toThrow('Only the Owner can remove a Member');
  rows = [{ member_id: 'm1' }];
  await server.removeMember('a1', 'm1');

  expect(removed).toEqual([
    ['members', 'athlete_id', 'a1', 'member_id', 'm1'],
    ['members', 'athlete_id', 'a1', 'member_id', 'm1'],
  ]);
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

test('the Supabase server checks the emailed code as an email OTP', async () => {
  const calls: unknown[] = [];
  const client = {
    auth: {
      verifyOtp: async (args: unknown) => {
        calls.push(args);
        return { error: null };
      },
    },
  };

  await createSupabaseServer(client as never).verifyCode('casey@example.com', CODE);

  expect(calls).toEqual([{ email: 'casey@example.com', token: CODE, type: 'email' }]);
});

test("the Owner opening its own Invite is refused, and the link still works for a co-parent", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);

  await expect(core.acceptInvite(token)).rejects.toMatchObject({ reason: 'own' });
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);

  expect((await member.core.home()).athlete?.id).toBe(athleteId);
});

test("a Member's phone is not the Owner, and offers no Game in progress to record on", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
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
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  // this sign-in downloads too, and marks the download done for the account
  await signInWithCode(member.core, 'sam@example.com');
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

test("a Game a Member records reaches the Owner's phone at its next launch, under the Owner, with the Member as its Recorder", async () => {
  const { core, server, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const ownerGame = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.endGame(ownerGame, { teamScore: 5, opponentScore: 3 });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);

  const gameId = await member.core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'halves' });
  const steal = await member.core.recordTile(gameId, 'steal');
  await member.core.flush();

  const owner = await server.session();
  const memberAccount = await member.server.session();
  expect(server.rows.games.get(gameId)).toMatchObject({ owner_id: owner, athlete_id: athleteId, recorded_by: memberAccount });
  expect(server.rows.events.get(steal.id)).toMatchObject({ owner_id: owner, game_id: gameId });

  await core.refresh();

  expect(await inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId, recorded_by: memberAccount });
  expect(await inspect.events.get(steal.id)).toEqual(steal);
  expect((await core.home()).liveGameId).toBeUndefined();
});

test("a Game the Owner records while offline reaches a Member's phone once both are back online, and the Member does not record on it", async () => {
  const { core, server, link } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);

  link.up = false;
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  const steal = await core.recordTile(gameId, 'steal');
  link.up = true;
  await core.flush();
  await member.core.refresh();

  expect(await member.inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId, recorded_by: await server.session() });
  expect(await member.inspect.events.get(steal.id)).toEqual(steal);
  expect((await member.core.home()).liveGameId).toBeUndefined();
});

test("a launch on a phone already signed in downloads the Games another phone of the account recorded", async () => {
  const { core, server } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  await signInWithCode(core, 'casey@example.com');
  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await core.flush();

  expect(await second.inspect.games.get(gameId)).toBeUndefined();
  await second.core.refresh();

  expect(await second.inspect.games.get(gameId)).toMatchObject({ athlete_id: athleteId });
});

test("a Game held from before Recorders were stored is still its Owner's: the Owner's phone records on it, a Member's does not", async () => {
  const { core, server, inspect } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'basketball', periodFormat: 'quarters' });
  await signInWithCode(core, 'casey@example.com');
  const token = await core.createInvite(athleteId);
  const member = otherAccount(server);
  await signInWithCode(member.core, 'sam@example.com');
  await member.core.acceptInvite(token);
  // the phones' copies of the Game as the build before this one stored them: no Recorder
  await inspect.games.put({ ...(await inspect.games.get(gameId))!, recorded_by: undefined });
  await member.inspect.games.put({ ...(await member.inspect.games.get(gameId))!, recorded_by: undefined });

  await member.core.refresh();

  expect((await core.home()).liveGameId).toBe(gameId);
  expect((await member.core.home()).liveGameId).toBeUndefined();
  expect((await member.inspect.games.get(gameId))?.recorded_by).toBeUndefined();
});

test('the season line totals finished basketball Games, and the Games feed lists finished Games newest first', async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const start = (gameDate: string, format: GameFormat = { sport: 'basketball', periodFormat: 'quarters' }) =>
    core.startGame({ athleteId, opponentName: 'Hawks', gameDate, ...format });

  // on court for a made 2, a missed 3, a made and a missed Free Throw, a rebound each way and an assist; the Sub Out at 3–0 makes the Shift +3
  const first = await start('2026-10-28');
  await core.toggleSub(first);
  await core.recordShot(first, { x: 50, y: 20, value: 2, made: true });
  await core.recordShot(first, { x: 50, y: 65, value: 3, made: false });
  await core.recordFreeThrow(first, true);
  await core.recordFreeThrow(first, false);
  await core.recordTile(first, 'reb_off');
  await core.recordTile(first, 'reb_def');
  await core.recordTile(first, 'assist');
  await core.toggleSub(first);
  await core.endGame(first, { teamScore: 3, opponentScore: 0 });

  const second = await start('2026-10-29');
  await core.recordFreeThrow(second, true);
  await core.endGame(second, { teamScore: 1, opponentScore: 4 });

  // a Game still in progress counts toward no season; a softball Game makes the softball season, not the basketball one
  const unfinished = await start('2026-10-30');
  await core.recordShot(unfinished, { x: 50, y: 20, value: 2, made: true });
  const softball = await start('2026-10-27', { sport: 'softball', periodFormat: 'innings' });
  await core.recordTile(softball, 'assist');
  await core.endGame(softball, { teamScore: 1, opponentScore: 0 });

  const feed = await core.gameFeed(athleteId);
  expect(feed.seasons).toEqual([
    {
      sport: 'basketball',
      line: { points: 4, fg: { made: 1, attempted: 2 }, ft: { made: 2, attempted: 3 }, rebounds: 2, assists: 1, plusMinus: 3 },
    },
    { sport: 'softball', batting: expect.objectContaining({ atBats: 0, hits: 0 }) },
  ]);
  expect(feed.games.map((g) => g.id)).toEqual([second, first, softball]);
});

test('a retracted Event never counts toward the season line', async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({
    athleteId,
    opponentName: 'Hawks',
    gameDate: '2026-10-28',
    sport: 'basketball',
    periodFormat: 'quarters',
  });
  await core.recordShot(gameId, { x: 50, y: 20, value: 2, made: true });
  await core.recordTile(gameId, 'assist');
  await core.undo(gameId); // retracts the assist
  await core.undo(gameId); // retracts the Shot
  await core.recordTile(gameId, 'reb_def');
  await core.endGame(gameId, { teamScore: 0, opponentScore: 0 });

  expect((await core.gameFeed(athleteId)).seasons).toEqual([
    {
      sport: 'basketball',
      line: { points: 0, fg: { made: 0, attempted: 0 }, ft: { made: 0, attempted: 0 }, rebounds: 1, assists: 0, plusMinus: 0 },
    },
  ]);
});

test("the Games feed groups Games by the phone's local date: Today, Yesterday, This Week (2 to 6 days back), then Earlier", async () => {
  // 00:30 on the 30th local time: a UTC date would read the 29th in zones east of UTC
  const { core } = setup(new Date(2026, 9, 30, 0, 30));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  for (const gameDate of ['2026-10-23', '2026-10-24', '2026-10-25', '2026-10-29', '2026-10-30']) {
    const gameId = await core.startGame({ athleteId, opponentName: 'Hawks', gameDate, sport: 'basketball', periodFormat: 'quarters' });
    await core.endGame(gameId, { teamScore: 0, opponentScore: 0 });
  }

  expect((await core.gameFeed(athleteId)).games.map((g) => [g.gameDate, g.group])).toEqual([
    ['2026-10-30', 'today'],
    ['2026-10-29', 'yesterday'],
    ['2026-10-25', 'this-week'],
    ['2026-10-24', 'this-week'],
    ['2026-10-23', 'earlier'],
  ]);
});

test("a Game's summary shows its opponent, Final Score and stats; a Game still in progress has none", async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({
    athleteId,
    opponentName: 'Hawks',
    gameDate: '2026-10-28',
    sport: 'basketball',
    periodFormat: 'quarters',
  });
  await core.recordShot(gameId, { x: 50, y: 20, value: 2, made: true });
  await core.recordTile(gameId, 'steal');
  await core.endGame(gameId, { teamScore: 2, opponentScore: 1 });
  const unfinished = await core.startGame({
    athleteId,
    opponentName: 'Bulls',
    gameDate: '2026-10-30',
    sport: 'basketball',
    periodFormat: 'quarters',
  });

  expect(await core.gameSummary(gameId)).toMatchObject({
    opponent: 'Hawks',
    gameDate: '2026-10-28',
    final: { team: 2, opponent: 1 },
    line: { points: 2 },
    tiles: { steal: 1 },
  });
  expect(await core.gameSummary(unfinished)).toBeUndefined();
});

test("a finished basketball Game's copy text names the Athlete and Opponent, the Final Score, the line, Plus/Minus and the sport hashtag", async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-28', sport: 'basketball', periodFormat: 'quarters' });
  // on court for a made 2, a missed 3, a made Free Throw, an offensive rebound and an assist; the Sub Out at 3–0 makes the Shift +3
  await core.toggleSub(gameId);
  await core.recordShot(gameId, { x: 50, y: 20, value: 2, made: true });
  await core.recordShot(gameId, { x: 50, y: 65, value: 3, made: false });
  await core.recordFreeThrow(gameId, true);
  await core.recordTile(gameId, 'reb_off');
  await core.recordTile(gameId, 'assist');
  await core.toggleSub(gameId);
  await core.endGame(gameId, { teamScore: 3, opponentScore: 0 });

  expect(await core.gameCopyText(gameId)).toBe(
    ['Casey vs Hawks: 3–0 final', 'Casey: 3 PTS · FG 1/2 · FT 1/1 · 1 REB · 1 AST · Plus/Minus +3', '#basketball'].join('\n'),
  );
});

test('copy text counts only un-retracted Events, and a Game still in progress has none', async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-28', sport: 'basketball', periodFormat: 'quarters' });
  await core.recordShot(gameId, { x: 50, y: 20, value: 2, made: true });
  await core.recordTile(gameId, 'assist');
  await core.recordFreeThrow(gameId, true);
  await core.undo(gameId); // retracts the Free Throw
  await core.undo(gameId); // retracts the assist
  await core.endGame(gameId, { teamScore: 2, opponentScore: 0 });
  const unfinished = await core.startGame({ athleteId, opponentName: 'Bulls', gameDate: '2026-10-30', sport: 'basketball', periodFormat: 'quarters' });

  expect(await core.gameCopyText(gameId)).toBe(
    ['Casey vs Hawks: 2–0 final', 'Casey: 2 PTS · FG 1/1 · FT 0/0 · 0 REB · 0 AST · Plus/Minus 0', '#basketball'].join('\n'),
  );
  expect(await core.gameCopyText(unfinished)).toBeUndefined();
});

test("a finished Game's share card names the Athlete, carries its photo, the Opponent, the Final Score and the line; undefined while the Game runs", async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const photo = new Blob(['jpeg bytes'], { type: 'image/jpeg' });
  const athleteId = await core.addAthlete({ name: 'Casey', photo });
  const gameId = await core.startGame({ athleteId, opponentName: 'Hawks', gameDate: '2026-10-28', sport: 'basketball', periodFormat: 'quarters' });
  await core.toggleSub(gameId);
  await core.recordShot(gameId, { x: 50, y: 20, value: 2, made: true });
  await core.toggleSub(gameId);
  expect(await core.gameCard(gameId)).toBeUndefined();

  await core.endGame(gameId, { teamScore: 2, opponentScore: 0 });

  expect(await core.gameCard(gameId)).toMatchObject({
    athlete: 'Casey',
    opponent: 'Hawks',
    final: { team: 2, opponent: 0 },
    line: '2 PTS · FG 1/1 · FT 0/0 · 0 REB · 0 AST',
  });
  expect((await core.gameCard(gameId))?.photo?.size).toBe(photo.size);
});

test('a plate appearance records its Outcome and RBI as one Event, and Undo names it', async () => {
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });

  const event = await core.recordPlateAppearance(gameId, { outcome: 'double', rbi: 2 });

  expect(event).toMatchObject({ type: 'plate_appearance', outcome: 'double', rbi: 2, game_id: gameId });
  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: event.id, type: 'plate_appearance', outcome: 'double' });
});

test('each Outcome counts once toward At-Bats, AVG, OBP and SLG, by the plan formulas', async () => {
  // [Outcome, At-Bats, AVG, OBP, SLG] for one Plate Appearance, worked by hand from docs/plan.md:
  // AB = PA − BB − HBP − SF − SAC; AVG = H / AB; OBP = (H + BB + HBP) / (AB + BB + HBP + SF); SLG = total bases / AB.
  // undefined where the denominator is zero.
  const cases: [Outcome, number, number | undefined, number | undefined, number | undefined][] = [
    ['single', 1, 1, 1, 1],
    ['double', 1, 1, 1, 2],
    ['triple', 1, 1, 1, 3],
    ['home_run', 1, 1, 1, 4],
    ['walk', 0, undefined, 1, undefined],
    ['hit_by_pitch', 0, undefined, 1, undefined],
    ['reached_on_error', 1, 0, 0, 0],
    ['fielders_choice', 1, 0, 0, 0],
    ['strikeout', 1, 0, 0, 0],
    ['ground_out', 1, 0, 0, 0],
    ['fly_out', 1, 0, 0, 0],
    ['line_out', 1, 0, 0, 0],
    ['sac_fly', 0, undefined, 0, undefined],
    ['sac_bunt', 0, undefined, undefined, undefined],
  ];
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });

  for (const [outcome, atBats, avg, obp, slg] of cases) {
    const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
    await core.recordPlateAppearance(gameId, { outcome, rbi: 0 });

    expect((await core.liveGame(gameId))?.batting, outcome).toMatchObject({ atBats, avg, obp, slg });
  }
});

test('a Game sums its Plate Appearances into one batting line, and Undo takes the newest one back out', async () => {
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
  const outcomes: Outcome[] = [
    'single',
    'walk',
    'strikeout',
    'sac_fly',
    'double',
    'hit_by_pitch',
    'sac_bunt',
    'ground_out',
    'home_run',
    'reached_on_error',
  ];
  for (const outcome of outcomes) await core.recordPlateAppearance(gameId, { outcome, rbi: 0 });

  // 10 Plate Appearances: AB 6, H 3, total bases 7; OBP (3 + 1 + 1) / (6 + 1 + 1 + 1)
  const ten = (await core.liveGame(gameId))?.batting;
  expect(ten?.atBats).toBe(6);
  expect(ten?.avg).toBeCloseTo(3 / 6, 10);
  expect(ten?.obp).toBeCloseTo(5 / 9, 10);
  expect(ten?.slg).toBeCloseTo(7 / 6, 10);

  await core.undo(gameId); // retracts reached_on_error: 9 Plate Appearances, AB 5, H 3, total bases 7

  expect(await core.liveGame(gameId)).toMatchObject({ batting: { atBats: 5, avg: 0.6, obp: 0.625, slg: 1.4 } });
});

test("a softball Game's feed row carries its batting line: hits, At-Bats and RBI", async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
  await core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 1 });
  await core.recordPlateAppearance(gameId, { outcome: 'strikeout', rbi: 0 });
  await core.recordPlateAppearance(gameId, { outcome: 'double', rbi: 2 });
  await core.recordPlateAppearance(gameId, { outcome: 'walk', rbi: 0 });
  await core.endGame(gameId, { teamScore: 4, opponentScore: 2 });

  // the walk is not an At-Bat; the three At-Bats hold two hits
  expect((await core.gameFeed(athleteId)).games[0].batting).toMatchObject({ hits: 2, atBats: 3, rbi: 3 });
});

test("a softball Game's copy text and share card carry its batting line and Final Score, not the basketball line", async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
  await core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 1 });
  await core.recordPlateAppearance(gameId, { outcome: 'strikeout', rbi: 0 });
  await core.recordPlateAppearance(gameId, { outcome: 'double', rbi: 2 });
  await core.endGame(gameId, { teamScore: 4, opponentScore: 2 });

  expect(await core.gameCopyText(gameId)).toBe(
    ['Casey vs Hawks: 4–2 final', 'Casey: H/AB 2/3 · 3 RBI · Plus/Minus 0', '#softball'].join('\n'),
  );
  expect(await core.gameCard(gameId)).toMatchObject({ final: { team: 4, opponent: 2 }, line: 'H/AB 2/3 · 3 RBI' });
});

test("a softball season sums its Games' batting counts, and its rates come from the totals, not an average of Games", async () => {
  const { core } = setup(new Date(2026, 9, 30, 12));
  const athleteId = await core.addAthlete({ name: 'Casey' });
  const first = await core.startGame({ athleteId, ...GAME_SETUP, gameDate: '2026-10-27', sport: 'softball', periodFormat: 'innings' });
  await core.recordPlateAppearance(first, { outcome: 'single', rbi: 1 });
  await core.recordPlateAppearance(first, { outcome: 'walk', rbi: 0 });
  await core.endGame(first, { teamScore: 1, opponentScore: 0 });
  const second = await core.startGame({ athleteId, ...GAME_SETUP, gameDate: '2026-10-28', sport: 'softball', periodFormat: 'innings' });
  await core.recordPlateAppearance(second, { outcome: 'ground_out', rbi: 0 });
  await core.recordPlateAppearance(second, { outcome: 'home_run', rbi: 2 });
  await core.endGame(second, { teamScore: 3, opponentScore: 0 });

  // AB 3 (the walk is not one), H 2, RBI 3, total bases 5; AVG 2/3, OBP (2 + 1) / (3 + 1), SLG 5/3
  expect((await core.gameFeed(athleteId)).seasons).toEqual([
    { sport: 'softball', batting: { atBats: 3, hits: 2, rbi: 3, bases: 5, walks: 1, hitByPitch: 0, sacFlies: 0, avg: 2 / 3, obp: 0.75, slg: 5 / 3 } },
  ]);
});

async function softballGame(core: ReturnType<typeof createAppCore>) {
  const athleteId = await core.addAthlete({ name: 'Casey' });
  return core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
}

test('the count shows only once a Pitch is logged in the Plate Appearance, and each Pitch is one Pitch Event', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  expect((await core.liveGame(gameId))?.count).toBeUndefined();

  const ball = await core.recordPitch(gameId, 'ball');

  expect(ball).toMatchObject({ type: 'pitch', pitch: 'ball', game_id: gameId });
  expect((await core.liveGame(gameId))?.count).toEqual({ balls: 1, strikes: 0 });
  await core.recordPitch(gameId, 'called_strike');
  expect((await core.liveGame(gameId))?.count).toEqual({ balls: 1, strikes: 1, strikeout: 'looking' });
});

test('a foul is a strike only while the count has fewer than two strikes', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);

  for (const pitch of ['foul', 'foul', 'foul'] as const) await core.recordPitch(gameId, pitch);
  expect((await core.liveGame(gameId))?.count).toEqual({ balls: 0, strikes: 2 });

  await core.recordPitch(gameId, 'ball');
  await core.recordPitch(gameId, 'swinging_strike');
  expect((await core.liveGame(gameId))?.count).toEqual({ balls: 1, strikes: 3, strikeout: 'swinging' });
});

test('the count resets after each Outcome, and Undo brings back the Plate Appearance and its count', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPitch(gameId, 'ball');
  await core.recordPitch(gameId, 'called_strike');
  await core.recordPlateAppearance(gameId, { outcome: 'ground_out', rbi: 0 });
  expect((await core.liveGame(gameId))?.count).toBeUndefined();

  await core.undo(gameId); // retracts the Plate Appearance
  expect((await core.liveGame(gameId))?.count).toEqual({ balls: 1, strikes: 1, strikeout: 'looking' });

  await core.undo(gameId); // retracts the called strike
  expect((await core.liveGame(gameId))?.count).toEqual({ balls: 1, strikes: 0 });
});

test('a strikeout is looking or swinging by the last strike Pitch, and plain when no strike Pitch came before it', async () => {
  // [Pitches before the strikeout, how it is marked]: fouls are not strike Pitches, so they never mark it
  const cases: [Pitch[], 'looking' | 'swinging' | undefined][] = [
    [['called_strike'], 'looking'],
    [['called_strike', 'swinging_strike'], 'swinging'],
    [['swinging_strike', 'called_strike'], 'looking'],
    [['swinging_strike', 'foul'], 'swinging'],
    [['ball', 'foul'], undefined],
    [[], undefined],
  ];
  const { core } = setup();
  const athleteId = await core.addAthlete({ name: 'Casey' });

  for (const [pitches, marked] of cases) {
    const gameId = await core.startGame({ athleteId, ...GAME_SETUP, sport: 'softball', periodFormat: 'innings' });
    for (const pitch of pitches) await core.recordPitch(gameId, pitch);
    const strikeout = await core.recordPlateAppearance(gameId, { outcome: 'strikeout', rbi: 0 });

    expect((await core.liveGame(gameId))?.undoable, pitches.join(',')).toEqual({
      id: strikeout.id,
      type: 'plate_appearance',
      outcome: 'strikeout',
      strikeout: marked,
    });
  }
});

test('the count says how a strikeout would be marked, and only a strikeout is marked', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPitch(gameId, 'called_strike');
  expect((await core.liveGame(gameId))?.count?.strikeout).toBe('looking');

  await core.recordPlateAppearance(gameId, { outcome: 'double', rbi: 0 });
  await core.recordPitch(gameId, 'swinging_strike');
  await core.recordPlateAppearance(gameId, { outcome: 'double', rbi: 0 });
  expect((await core.liveGame(gameId))?.undoable?.strikeout).toBeUndefined();
});

test('a Pitch refuses anything but a ball, a called or swinging strike, or a foul', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);

  await expect(core.recordPitch(gameId, 'strike' as Pitch)).rejects.toThrow();
  expect((await core.liveGame(gameId))?.count).toBeUndefined();
});

test("a Pitch keeps its result when a second phone downloads it at sign-in", async () => {
  const { core, server } = setup();
  const gameId = await softballGame(core);
  const swing = await core.recordPitch(gameId, 'swinging_strike');
  await signInWithCode(core, 'casey@example.com');

  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');

  expect(await second.inspect.events.get(swing.id)).toEqual(swing);
});

test('Next period starts the count at zero, so a Pitch from the last period never marks a strikeout', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPitch(gameId, 'swinging_strike');
  await core.recordPitch(gameId, 'ball');

  await core.nextPeriod(gameId);
  expect((await core.liveGame(gameId))?.count).toBeUndefined();

  const strikeout = await core.recordPlateAppearance(gameId, { outcome: 'strikeout', rbi: 0 });
  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: strikeout.id, type: 'plate_appearance', outcome: 'strikeout' });
});

test("a Pitch's Undo names the Pitch it takes back", async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  const foul = await core.recordPitch(gameId, 'foul');

  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: foul.id, type: 'pitch', pitch: 'foul' });
});

test('the Outcome puts the Athlete on the base it reached: single to 1st, double to 2nd, triple to 3rd, and the other reaches to 1st', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  const cases: [Outcome, Base | undefined][] = [
    ['single', 'first'],
    ['double', 'second'],
    ['triple', 'third'],
    ['walk', 'first'],
    ['hit_by_pitch', 'first'],
    ['reached_on_error', 'first'],
    ['fielders_choice', 'first'],
    ['ground_out', undefined],
  ];
  for (const [outcome, base] of cases) {
    await core.recordPlateAppearance(gameId, { outcome, rbi: 0 });
    expect((await core.liveGame(gameId))?.onBase, outcome).toBe(base);
  }
});

test('a home run scores the Athlete: it counts a run and holds no base', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPlateAppearance(gameId, { outcome: 'home_run', rbi: 1 });

  expect((await core.liveGame(gameId))?.onBase).toBeUndefined();
  expect((await core.liveGame(gameId))?.baserunning).toEqual({ runs: 1, stolenBases: 0 });
});

test('a baserunning move is one Event naming its base and steal, and Undo puts the Athlete back on the base they held', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 0 });

  const steal = await core.recordBaserunning(gameId, { base: 'second', stolen: true });

  expect(steal).toMatchObject({ type: 'baserunning', base: 'second', stolen: true, game_id: gameId });
  expect((await core.liveGame(gameId))?.onBase).toBe('second');
  expect((await core.liveGame(gameId))?.undoable).toEqual({ id: steal.id, type: 'baserunning', base: 'second', stolen: true });

  await core.undo(gameId);
  expect((await core.liveGame(gameId))?.onBase).toBe('first');
});

test('Scored counts a run and Stole counts a stolen base, and Undo takes each back out', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 0 });

  await core.recordBaserunning(gameId, { base: 'second', stolen: true });
  expect((await core.liveGame(gameId))?.baserunning).toEqual({ runs: 0, stolenBases: 1 });

  await core.recordBaserunning(gameId, { base: 'home', stolen: false });
  expect((await core.liveGame(gameId))?.onBase).toBeUndefined();
  expect((await core.liveGame(gameId))?.baserunning).toEqual({ runs: 1, stolenBases: 1 });

  await core.undo(gameId);
  expect((await core.liveGame(gameId))?.onBase).toBe('second');
  expect((await core.liveGame(gameId))?.baserunning).toEqual({ runs: 0, stolenBases: 1 });
});

test('Out takes the Athlete off the diamond, and a Stole marked on an Out is a caught stealing, not a stolen base', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 0 });

  const caught = await core.recordBaserunning(gameId, { base: 'out', stolen: true });

  expect(caught).toMatchObject({ base: 'out', stolen: true });
  expect((await core.liveGame(gameId))?.onBase).toBeUndefined();
  expect((await core.liveGame(gameId))?.baserunning).toEqual({ runs: 0, stolenBases: 0 });
});

test('a baserunning move needs the Athlete on base, and never moves them back or to a base they hold', async () => {
  const { core } = setup();
  const gameId = await softballGame(core);
  await expect(core.recordBaserunning(gameId, { base: 'second', stolen: false })).rejects.toThrow();

  await core.recordPlateAppearance(gameId, { outcome: 'triple', rbi: 0 });
  await expect(core.recordBaserunning(gameId, { base: 'second', stolen: false })).rejects.toThrow();
  await expect(core.recordBaserunning(gameId, { base: 'third', stolen: false })).rejects.toThrow();
  await expect(core.recordBaserunning(gameId, { base: 'bogus' as never, stolen: false })).rejects.toThrow();

  expect((await core.liveGame(gameId))?.onBase).toBe('third');
});

test("a baserunning move's base and steal reach a second phone at sign-in", async () => {
  const { core, server } = setup();
  const gameId = await softballGame(core);
  await core.recordPlateAppearance(gameId, { outcome: 'single', rbi: 0 });
  const steal = await core.recordBaserunning(gameId, { base: 'second', stolen: true });
  await signInWithCode(core, 'casey@example.com');

  const second = phoneOn(server);
  await signInWithCode(second.core, 'casey@example.com');

  expect(await second.inspect.events.get(steal.id)).toEqual(steal);
});
