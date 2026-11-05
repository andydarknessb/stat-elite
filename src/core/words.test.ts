import { expect, it } from 'vitest';
import type { AthleteFate } from './appCore';
import type { Undoable } from './eventLog';
import { clockOf, fateLine, initials, rateText, resultOf, undoLabel } from './words';

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
  expect(undoLabel(event)).toBe(text);
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
