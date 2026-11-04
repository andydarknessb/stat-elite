import { expect, test } from 'vitest';
import { syncOnLaunchAndOnline } from './syncTriggers';

const visible = { visibilityState: 'visible' as DocumentVisibilityState };

test('wiring the sync triggers refreshes once at launch', () => {
  let refreshes = 0;
  syncOnLaunchAndOnline({ refresh: async () => void refreshes++ }, new EventTarget(), visible);
  expect(refreshes).toBe(1);
});

test('the connection returning refreshes again', () => {
  let refreshes = 0;
  const target = new EventTarget();
  syncOnLaunchAndOnline({ refresh: async () => void refreshes++ }, target, visible);
  target.dispatchEvent(new Event('online'));
  expect(refreshes).toBe(2);
});

test('the page becoming visible again refreshes again', () => {
  let refreshes = 0;
  const target = new EventTarget();
  syncOnLaunchAndOnline({ refresh: async () => void refreshes++ }, target, visible);
  target.dispatchEvent(new Event('visibilitychange'));
  expect(refreshes).toBe(2);
});

test('the page becoming hidden does not refresh', () => {
  let refreshes = 0;
  const target = new EventTarget();
  const hidden = { visibilityState: 'hidden' as DocumentVisibilityState };
  syncOnLaunchAndOnline({ refresh: async () => void refreshes++ }, target, hidden);
  target.dispatchEvent(new Event('visibilitychange'));
  expect(refreshes).toBe(1);
});
