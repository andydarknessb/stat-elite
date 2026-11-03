import { expect, test, type Page } from '@playwright/test';
import { openApp } from './openApp';

// The Invite screen signs the phone in with the emailed code; the refused link then leaves it on Continue, signed in, with no reload.
async function signInOnThisPhone(page: Page, email: string) {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill(email);
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('This invite link is not valid.')).toBeVisible();
  await page.getByRole('button', { name: 'Continue' }).click();
}

async function addAthlete(page: Page) {
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

test('Settings names the signed-in address, Sign out warns, Cancel changes nothing, and confirming clears the phone', async ({ page }) => {
  await signInOnThisPhone(page, 'casey@example.com');
  await addAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByText('Signed in as casey@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByText('Photos on this phone: 0')).toBeVisible();
  await expect(page.getByText('Your Athletes and Games stay on your Account.')).toBeVisible();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByText('Signed in as casey@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByText('Signed in as')).toHaveCount(0);
});

test('Sign out with the network off shows the refusal, and the Athlete is still on Home after going back', async ({ page, context }) => {
  await signInOnThisPhone(page, 'casey@example.com');
  await context.setOffline(true);
  await addAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(
    'Could not sign out. Wait for everything to sync and check the connection, then try again.',
  );
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();
});

test('Sign out on Add Athlete, once confirmed, returns to the sign-in screen', async ({ page }) => {
  await openApp(page);
  await expect(page.getByText('Signed in as casey@example.com')).toBeVisible();

  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.getByText('Signed in as')).toHaveCount(0);
});

test('a phone that never signed in opens on the sign-in screen, with no Signed in as line and no Sign out', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Email')).toBeVisible();

  await expect(page.getByText('Signed in as')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sign out' })).toHaveCount(0);
});
