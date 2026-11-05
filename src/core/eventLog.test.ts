import { expect, it } from 'vitest';
import { fold } from './eventLog';
import type { EventRow } from './store';

const NOW = '2026-10-30T19:00:00.000Z';

// an Event as the Game's log holds it: each field the Event does not set is null
const event = (seq: number, fields: Pick<EventRow, 'type'> & Partial<EventRow>): EventRow => ({
  id: `e${seq}`,
  game_id: 'game',
  seq,
  client_ts: `2026-10-30T18:${String(seq).padStart(2, '0')}:00.000Z`,
  period: 1,
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
  ...fields,
});
const shot = (seq: number) => event(seq, { type: 'shot', shot_value: 3, made: true, court_x: 50, court_y: 90 });
const scoreSnapshot = (seq: number, team: number, opponent: number) => event(seq, { type: 'score', team_score: team, opponent_score: opponent });
const subIn = (seq: number) => event(seq, { type: 'sub_in', team_score: 0, opponent_score: 0 });
const periodStart = (seq: number, period: number) => event(seq, { type: 'period_start', period });
const retraction = (seq: number, target: number) => event(seq, { type: 'retraction', retracts_id: `e${target}` });

// each case: a retracted Event and the Retraction that undoes it, folded to the value that Event would have changed
it.each([
  ['a retracted Shot', [shot(1), retraction(2, 1)], (log: ReturnType<typeof fold>) => log.counts.points, 0],
  [
    'a retracted Score Snapshot',
    [scoreSnapshot(1, 4, 2), scoreSnapshot(2, 6, 2), retraction(3, 2)],
    (log: ReturnType<typeof fold>) => log.score,
    { team: 4, opponent: 2 },
  ],
  ['a retracted Sub In', [subIn(1), retraction(2, 1)], (log: ReturnType<typeof fold>) => log.onCourt, false],
  ['a retracted Period start', [periodStart(1, 2), retraction(2, 1)], (log: ReturnType<typeof fold>) => log.period, 1],
])('%s does not count', (_, events, read, expected) => {
  expect(read(fold(events, NOW))).toEqual(expected);
});

// a Period start takes the Athlete off base; retracting it puts them back on the base they held (GLOSSARY: Period, Baserunning)
it('a single then a Period start folds to no base', () => {
  expect(fold([event(1, { type: 'plate_appearance', outcome: 'single' }), periodStart(2, 2)], NOW).onBase).toBeUndefined();
});

it('retracting that Period start folds the Athlete back to first', () => {
  expect(fold([event(1, { type: 'plate_appearance', outcome: 'single' }), periodStart(2, 2), retraction(3, 2)], NOW).onBase).toBe('first');
});
