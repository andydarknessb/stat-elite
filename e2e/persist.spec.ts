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
