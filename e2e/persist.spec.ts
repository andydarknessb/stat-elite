import { expect, test } from '@playwright/test';

type PersistWindow = { persistCalls: number };

test('first run asks the browser to keep storage permanently', async ({ page }) => {
  // stub before the app loads, so the call the first-run screen makes lands on the counter
  await page.addInitScript(() => {
    const w = window as unknown as PersistWindow;
    w.persistCalls = 0;
    navigator.storage.persist = async () => {
      w.persistCalls += 1;
      return true;
    };
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeVisible();

  const calls = await page.evaluate(() => (window as unknown as PersistWindow).persistCalls);
  expect(calls).toBeGreaterThanOrEqual(1);
});

test('every launch asks the browser to keep storage permanently, once an Athlete exists', async ({ page }) => {
  await page.addInitScript(() => {
    const w = window as unknown as PersistWindow;
    w.persistCalls = 0;
    navigator.storage.persist = async () => {
      w.persistCalls += 1;
      return true;
    };
  });

  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

  // the init script resets the counter on every load, so this counts the reloaded page alone
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

  const calls = await page.evaluate(() => (window as unknown as PersistWindow).persistCalls);
  expect(calls).toBeGreaterThanOrEqual(1);
});
