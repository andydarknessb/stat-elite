import { expect, test } from '@playwright/test';

test('after one online visit, the app opens and records with the network off', async ({ page, context }) => {
  await page.goto('/');
  // the service worker precaches the app shell while it installs; a reload hands the page to it
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeVisible();

  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const steal = page.getByRole('button', { name: /^STL/ });
  await steal.click();
  await expect(steal).toHaveText('STL 1');
});
