import { expect, test } from 'vitest';
import { storedSize } from './photo';

test.each([
  [4000, 3000, 1600, 1200],
  [3000, 4000, 1200, 1600],
  [1000, 800, 1000, 800],
  [1200, 1200, 1200, 1200],
])('a %ix%i photo is stored at %ix%i', (width, height, storedWidth, storedHeight) => {
  expect(storedSize(width, height)).toEqual({ width: storedWidth, height: storedHeight });
});
