import { expect, test } from '@playwright/test';
import { addFirstAthlete } from './recorder';

// the stand-in keeps sessions in memory, so a reload with the network on finds the session ended (ADR 0007)
test('a reload with the network on shows Sign in again to sync, with the remembered address read-only, and the code clears it with the Athlete still there', async ({ page }) => {
  await addFirstAthlete(page);
  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Sign in again to sync' })).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('casey@example.com');
  await expect(page.getByLabel('Email')).toHaveAttribute('readonly', '');

  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByRole('heading', { name: 'Sign in again to sync' })).toHaveCount(0);
  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
});

test('a reload with the network on: Delete my account says it only clears this phone, and Clear this phone lands on the sign-in form', async ({ page }) => {
  await addFirstAthlete(page);
  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
  await page.reload();
  await expect(page.getByRole('heading', { name: 'Sign in again to sync' })).toBeVisible();

  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete my account and all data' }).click();

  await expect(page.getByText('This only clears this phone. Your Account and its data stay on the server. Sign in again first to delete them.')).toBeVisible();
  await expect(page.getByText('Casey: removed from this phone.')).toBeVisible();
  await expect(page.getByText('This deletes your account from the server')).toHaveCount(0);

  await page.getByRole('button', { name: 'Clear this phone' }).click();
  await expect(page.getByRole('button', { name: 'Send code' })).toBeVisible();
});

test('a reload with the network off does not show Sign in again to sync', async ({ page, context }) => {
  await addFirstAthlete(page);
  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
  // the service worker precaches the app shell while it installs; the offline switch below must not cut that short
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in again to sync' })).toHaveCount(0);
});
