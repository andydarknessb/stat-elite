import { expect, test } from '@playwright/test';
import { addAthlete, addFirstAthlete } from './recorder';

// Home's Members wait for the connection: offline when Home mounts them, the line stands in for the list with no alert, and reconnecting loads it with no tap (#278).
test('Members wait for the connection: offline on Home, the line shows with no alert, and reconnecting loads the list', async ({ page, context }) => {
  await addFirstAthlete(page);
  await context.setOffline(true);
  // Settings replaces Home, so Done mounts Home's Members while the phone is offline
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await expect(page.getByText('Members show when this phone is back online.')).toBeVisible();
  await expect(page.getByText('Could not load the Members')).toHaveCount(0);

  await context.setOffline(false);
  await expect(page.getByText('No Members yet.')).toBeVisible();
  await expect(page.getByText('Members show when this phone is back online.')).toHaveCount(0);
});

// The stand-in's no-answer address fails its first Members load without a refusal: Home shows the load's message with a Retry, and Retry loads the list (#278).
test("a Members load that fails online shows its message with a Retry, and Retry clears it", async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('no-answer@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await addAthlete(page);

  await expect(page.getByText('Could not load the Members. Check the connection and try again.')).toBeVisible();
  await page.getByRole('button', { name: 'Retry', exact: true }).click();
  await expect(page.getByText('No Members yet.')).toBeVisible();
  await expect(page.getByText('Could not load the Members')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Retry', exact: true })).toHaveCount(0);
});
