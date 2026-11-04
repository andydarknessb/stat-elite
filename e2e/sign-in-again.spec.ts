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

test('a reload with the network off does not show Sign in again to sync', async ({ page, context }) => {
  await addFirstAthlete(page);
  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
  await context.setOffline(true);
  await page.reload();

  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Sign in again to sync' })).toHaveCount(0);
});
