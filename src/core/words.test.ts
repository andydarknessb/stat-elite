import { expect, it, vi } from 'vitest';
import type { AthleteFate } from './appCore';
import type { Undoable } from './eventLog';
import { clockOf, fateLine, gameDateText, initials, periodStartLabel, rateText, resultOf, shotTallyText, syncText, undoLabel, zoneLabel } from './words';

const GAME_DATE_ROWS = [
  ['2026-11-05', 'Thu, Nov 5'],
  ['2025-11-08', 'Sat, Nov 8, 2025'],
] as const;

it.each(GAME_DATE_ROWS)('gameDateText(%s) is %s, with today 2026-11-05', (stored, text) => {
  expect(gameDateText(stored, new Date(2026, 10, 5))).toBe(text);
});

it('gameDateText reads the same dates with the process time zone set to America/Los_Angeles', () => {
  vi.stubEnv('TZ', 'America/Los_Angeles');
  try {
    expect(GAME_DATE_ROWS.map(([stored]) => gameDateText(stored, new Date(2026, 10, 5)))).toEqual(GAME_DATE_ROWS.map(([, text]) => text));
  } finally {
    vi.unstubAllEnvs();
  }
});

it.each([
  ['rim', 'Rim'],
  ['mid-left', 'Mid-range left'],
  ['mid-center', 'Mid-range center'],
  ['mid-right', 'Mid-range right'],
  ['three-left', 'Three-point left'],
  ['three-center', 'Three-point center'],
  ['three-right', 'Three-point right'],
] as const)('zoneLabel(%s) is %s', (zone, label) => {
  expect(zoneLabel(zone)).toBe(label);
});

it.each([
  [0, 'All synced'],
  [1, '1 not synced · saved on this phone'],
  [12, '12 not synced · saved on this phone'],
])('syncText(%i rows waiting) is %s', (rows, text) => {
  expect(syncText(rows)).toBe(text);
});

it.each([
  [1 / 3, '.333'],
  [1, '1.000'],
  [undefined, '—'],
])('rateText(%s) is %s', (rate, text) => {
  expect(rateText(rate)).toBe(text);
});

it('clockOf writes a Shift time as m:ss', () => {
  expect(clockOf(61_000)).toBe('1:01');
});

it.each([
  [{ team: 5, opponent: 3 }, 'W', 'Won'],
  [{ team: 3, opponent: 5 }, 'L', 'Lost'],
  [{ team: 4, opponent: 4 }, 'T', 'Tied'],
])('resultOf(%j) is %s, %s', (final, letter, name) => {
  expect(resultOf(final)).toEqual({ letter, name });
});

it('initials takes the first letter of the first two names', () => {
  expect(initials('Casey Jones')).toBe('CJ');
});

const undoable = (fields: Pick<Undoable, 'type'> & Partial<Undoable>): Undoable => ({ id: 'e1', ...fields });

it.each([
  [undoable({ type: 'shot', value: 3, made: true }), 'Made 3PT'],
  [undoable({ type: 'free_throw', made: false }), 'Free Throw missed'],
  [undoable({ type: 'pitch', pitch: 'called_strike' }), 'Called strike'],
  [undoable({ type: 'plate_appearance', outcome: 'strikeout', strikeout: 'swinging' }), 'Strikeout swinging'],
  [undoable({ type: 'baserunning', base: 'second', stolen: true }), '2nd (Stole)'],
])('undoLabel(%j) is %s', (event, text) => {
  expect(undoLabel(event, 'basketball')).toBe(text);
});

it.each([
  ['basketball', 'Next period'],
  ['softball', 'Next inning'],
  ['baseball', 'Next inning'],
] as const)('the Period-start label on %s is %s, on the Period button, its toast and Undo', (sport, label) => {
  expect(periodStartLabel(sport)).toBe(label);
  expect(undoLabel(undoable({ type: 'period_start' }), sport)).toBe(label);
});

it.each([
  [{ name: 'Casey', fate: 'passes', to: 'Jordan' }, 'Casey: passes to Jordan, with its Games and Events.'],
  [{ name: 'Casey', fate: 'deleted', games: 1 }, 'Casey: deleted with 1 Game and their Events.'],
  [{ name: 'Casey', fate: 'deleted', games: 2 }, 'Casey: deleted with 2 Games and their Events.'],
  [{ name: 'Casey', fate: 'left' }, 'Casey: you leave it; the Games you recorded stay with it.'],
  [{ name: 'Casey', fate: 'removed' }, 'Casey: removed from this phone.'],
] as [AthleteFate, string][])('fateLine(%j) reads as the Recorder confirms it', (athlete, text) => {
  expect(fateLine(athlete)).toBe(text);
});

// the live Game's tally inputs: 2s made of attempted, Free Throws made of attempted, and points; no 3s in any row
const tally = (threePointers: boolean, twos: [number, number], freeThrows: [number, number], points: number) => ({
  threePointers,
  shots: { 2: { made: twos[0], attempted: twos[1] }, 3: { made: 0, attempted: 0 } },
  freeThrows: { made: freeThrows[0], attempted: freeThrows[1] },
  points,
});

it.each([
  [tally(true, [0, 0], [0, 0], 0), '2PT 0/0 · 3PT 0/0 · FT 0/0 · 0 pts'],
  [tally(true, [1, 2], [1, 1], 3), '2PT 1/2 · 3PT 0/0 · FT 1/1 · 3 pts'],
  [tally(false, [1, 2], [1, 1], 3), '2PT 1/2 · FT 1/1 · 3 pts'],
  [tally(true, [0, 0], [1, 1], 1), '2PT 0/0 · 3PT 0/0 · FT 1/1 · 1 pt'],
])('shotTallyText(%j) is %s', (counts, text) => {
  expect(shotTallyText(counts)).toBe(text);
});
