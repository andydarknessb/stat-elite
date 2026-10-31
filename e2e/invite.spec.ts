import { expect, test } from '@playwright/test';

// An Invite opened on a phone with nothing recorded signs the invitee in with the emailed code, the same form Save this game uses (#76).
// The stand-in accepts any six digits and refuses a token it does not hold, so the refusal shows the invitee was signed in first.
test('an invitee signs in with the code on the Invite screen, and a wrong code offers a new link', async ({ page }) => {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send link' }).click();
  await page.getByLabel('Code').fill('12345');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/That code did not work/)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Send a new link' })).toBeVisible();

  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('This invite link is not valid.')).toBeVisible();
});
