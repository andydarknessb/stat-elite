import { expect, test } from '@playwright/test';

// The deployed check runs this spec, so it stops at the sign-in screen; recording offline is tested on localhost in offline-recording.spec.ts
test('after one online visit, the sign-in screen opens with the network off and says so', async ({ page, context }) => {
  await page.goto('/');
  // the service worker precaches the app shell while it installs; a reload hands the page to it
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.reload();
  await expect(page.getByLabel('Email')).toBeVisible();

  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByText('You need a connection to sign in.')).toBeVisible();
});
