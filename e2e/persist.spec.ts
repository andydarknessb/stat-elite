import { expect, test } from '@playwright/test';
import { openApp } from './openApp';
import { addFirstAthlete } from './recorder';

type PersistWindow = { persistCalls: number };

test('first run asks the browser to keep storage permanently', async ({ page }) => {
  // stub before the app loads, so the call the first-run screen makes lands on the counter
  // on the prototype: an own property on the navigator.storage wrapper goes with the wrapper when WebKit collects it
  await page.addInitScript(() => {
    const w = window as unknown as PersistWindow;
    w.persistCalls = 0;
    StorageManager.prototype.persist = async () => {
      w.persistCalls += 1;
      return true;
    };
  });

  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeVisible();

  const calls = await page.evaluate(() => (window as unknown as PersistWindow).persistCalls);
  expect(calls).toBeGreaterThanOrEqual(1);
});

test('every launch asks the browser to keep storage permanently, once an Athlete exists', async ({ page }) => {
  // on the prototype, for the same reason as the first-run test (#222)
  await page.addInitScript(() => {
    const w = window as unknown as PersistWindow;
    w.persistCalls = 0;
    StorageManager.prototype.persist = async () => {
      w.persistCalls += 1;
      return true;
    };
  });

  await addFirstAthlete(page);
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

  // the init script resets the counter on every load, so this counts the reloaded page alone
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

  const calls = await page.evaluate(() => (window as unknown as PersistWindow).persistCalls);
  expect(calls).toBeGreaterThanOrEqual(1);
});
