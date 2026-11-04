import { expect, it } from 'vitest';
import { OUTCOMES, TILE_EVENT_TYPES } from './store';
import { backlogProblem, countFields, notWhole, textOf, totalsOf } from './totals';

// every score and count the form shows, each a different number, so a count lost in either direction shows
const BASKETBALL_KEYS = [
  'teamScore',
  'opponentScore',
  'shot2Made',
  'shot2Attempted',
  'shot3Made',
  'shot3Attempted',
  'freeThrowMade',
  'freeThrowAttempted',
  ...TILE_EVENT_TYPES.map((type) => `tile:${type}`),
];
const BATTING_KEYS = ['teamScore', 'opponentScore', ...OUTCOMES.map((outcome) => `outcome:${outcome}`), 'rbi', 'runs', 'steals'];
const numbered = (keys: string[]) => Object.fromEntries(keys.map((key, i) => [key, String(i + 1)]));

it('basketball text becomes Totals and back, unchanged for every count', () => {
  const text = numbered(BASKETBALL_KEYS);
  expect(textOf(totalsOf('basketball', text))).toEqual(text);
});

it('softball text becomes Totals and back, unchanged for every count', () => {
  const text = numbered(BATTING_KEYS);
  expect(textOf(totalsOf('softball', text))).toEqual(text);
});

it('a blank count reads as 0', () => {
  const basketball = textOf(totalsOf('basketball', { teamScore: '48', opponentScore: '40', freeThrowMade: '' }));
  expect(basketball.freeThrowMade).toBe('0');
  expect(basketball.shot3Attempted).toBe('0');
  expect(textOf(totalsOf('baseball', { teamScore: '3', opponentScore: '1', rbi: '' })).rbi).toBe('0');
});

it('the whole-number rule names the field for 1.5 and for -1, and accepts a count with spaces around it', () => {
  const fields = countFields('basketball');
  expect(notWhole(fields, { freeThrowMade: '1.5' })?.[1]).toBe('FT made');
  expect(notWhole(fields, { shot2Made: '-1' })?.[1]).toBe('2PT made');
  expect(notWhole(fields, { freeThrowAttempted: ' 7 ' })).toBeUndefined();
});

// one valid entry per sport, with every count, so each refusal below removes just one
const BASKETBALL = {
  team: 48,
  opponent: 40,
  shots: { 2: { made: 4, attempted: 9 }, 3: { made: 2, attempted: 6 } },
  freeThrows: { made: 5, attempted: 7 },
  tiles: { reb_off: 1, reb_def: 2, assist: 3, steal: 1, block: 0, turnover: 2, foul: 3 },
};
const SOFTBALL = {
  team: 3,
  opponent: 1,
  outcomes: Object.fromEntries(OUTCOMES.map((outcome) => [outcome, outcome === 'single' ? 1 : 0])) as Record<(typeof OUTCOMES)[number], number>,
  rbi: 1,
  runs: 1,
  steals: 0,
};
const COUNT_PROBLEM = 'Counts and scores are whole numbers from 0 to 999.';
const problemWith = (sport: 'basketball' | 'softball', totals: object) =>
  backlogProblem({ sport, opponentName: 'Hawks', gameDate: '2026-10-29', totals } as Parameters<typeof backlogProblem>[0], '2026-10-30');

it('a complete entry is no problem', () => {
  expect(problemWith('basketball', BASKETBALL)).toBeUndefined();
  expect(problemWith('softball', SOFTBALL)).toBeUndefined();
});

it('backlogProblem names a basketball entry with no freeThrows', () => {
  const { freeThrows: _missing, ...rest } = BASKETBALL;
  expect(problemWith('basketball', rest)).toBe(COUNT_PROBLEM);
});

it('backlogProblem names a softball entry with no outcomes', () => {
  const { outcomes: _missing, ...rest } = SOFTBALL;
  expect(problemWith('softball', rest)).toBe(COUNT_PROBLEM);
});
