import { expect, test } from 'vitest';
import { syncOnLaunchAndOnline } from './syncTriggers';

test('wiring the sync triggers flushes once at launch', () => {
  let flushes = 0;
  syncOnLaunchAndOnline({ flush: async () => void flushes++ }, new EventTarget());
  expect(flushes).toBe(1);
});

test('the connection returning flushes again', () => {
  let flushes = 0;
  const target = new EventTarget();
  syncOnLaunchAndOnline({ flush: async () => void flushes++ }, target);
  target.dispatchEvent(new Event('online'));
  expect(flushes).toBe(2);
});
