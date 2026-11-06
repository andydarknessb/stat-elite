import { expect, test } from '@playwright/test';

// An Invite opened on a phone with nothing recorded signs the invitee in with the emailed code, the same sign-in form as the first screen (#76).
// The stand-in accepts any six digits and refuses a token it does not hold, so the refusal shows the invitee was signed in first.
test('an invitee signs in with the code on the Invite screen, and a wrong code offers a new code', async ({ page }) => {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('12345');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/That code did not work/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new code' })).toBeVisible();

  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('This invite link is not valid.')).toBeVisible();
});

// A join that fails without a refusal keeps the link: Retry tries again, and the retry's refusal offers Continue only (#210).
// The stand-in's no-answer address fails its first accept without a refusal, so the first attempt reaches Retry.
test('a join that fails without a refusal offers Retry and Continue; Retry tries again with the link kept, and a refusal offers Continue only', async ({ page }) => {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill('no-answer@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/Could not join/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();

  await page.getByRole('button', { name: 'Retry' }).click();
  await expect(page.getByText('This invite link is not valid.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Continue' })).toBeVisible();
});
