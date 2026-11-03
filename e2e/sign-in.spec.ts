import { expect, test } from '@playwright/test';

// The stand-in refuses too-soon@example.com as Supabase's send rate limit does, so the wait message can be reached (#158).
test('a code asked for too soon says to wait and stays on the email step', async ({ page }) => {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill('too-soon@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Wait a minute before asking for another code.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('too-soon@example.com');
  await expect(page.getByLabel('Code')).toHaveCount(0);
});

test('a code that cannot be sent with the network off says so', async ({ page, context }) => {
  await page.goto('/?invite=not-a-token');
  await context.setOffline(true);
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Could not send the code. Check the connection and try again.')).toBeVisible();
});
