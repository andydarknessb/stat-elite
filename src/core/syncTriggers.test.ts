import { expect, test } from 'vitest';
import { syncOnLaunchAndOnline } from './syncTriggers';

test('wiring the sync triggers refreshes once at launch', () => {
  let refreshes = 0;
  syncOnLaunchAndOnline({ refresh: async () => void refreshes++ }, new EventTarget());
  expect(refreshes).toBe(1);
});

test('the connection returning refreshes again', () => {
  let refreshes = 0;
  const target = new EventTarget();
  syncOnLaunchAndOnline({ refresh: async () => void refreshes++ }, target);
  target.dispatchEvent(new Event('online'));
  expect(refreshes).toBe(2);
});
