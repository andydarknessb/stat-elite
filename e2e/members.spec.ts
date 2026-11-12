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
test('a Members load that fails online shows its message with a Retry, and Retry clears it', async ({ page }) => {
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

// A Remove tapped offline keeps its confirm card and its failed message on screen, and the message stays once the connection returns (#290).
test('a Remove tapped offline keeps its confirm card and its failed message through the reconnect', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('with-member@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await addAthlete(page);
  await page.getByRole('button', { name: 'Remove', exact: true }).click();

  await context.setOffline(true);
  await expect(page.getByText('Remove member@example.com? They lose Casey')).toBeVisible();
  await page.getByRole('button', { name: 'Yes, remove' }).click();
  await expect(page.getByText('Could not remove. Check the connection and try again.')).toBeVisible();
  await expect(page.getByText('Remove member@example.com? They lose Casey')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('Could not remove. Check the connection and try again.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'member@example.com' })).toBeVisible();
});

// A failed Members load leaves no message behind when the connection returns: the message is cleared before the reconnect renders (#290).
test('a failed Members load leaves no message when the connection returns, and the list loads', async ({ page, context }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('no-answer@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await addAthlete(page);
  await expect(page.getByText('Could not load the Members. Check the connection and try again.')).toBeVisible();

  await context.setOffline(true);
  await expect(page.getByText('Members show when this phone is back online.')).toBeVisible();
  // installed once the offline line is up, so it sees the reconnect and nothing before it
  await page.evaluate(() => {
    const flag = window as unknown as { alertSeen: boolean };
    flag.alertSeen = false;
    new MutationObserver(() => {
      if (document.body.textContent?.includes('Could not load the Members')) flag.alertSeen = true;
    }).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await context.setOffline(false);
  await expect(page.getByText('No Members yet.')).toBeVisible();
  expect(await page.evaluate(() => (window as unknown as { alertSeen: boolean }).alertSeen)).toBe(false);
});

// A reload ends the Owner's Session: its Members load alerts and never reads as none, and signing in again loads the list (#294).
test('an Owner whose session ended sees the Members alert, not No Members yet, and signing in again loads the list', async ({ page }) => {
  await addFirstAthlete(page);
  await page.reload();

  await expect(page.getByText('Could not load the Members. Check the connection and try again.')).toBeVisible();
  await expect(page.getByText('No Members yet.')).toHaveCount(0);

  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();

  await expect(page.getByText('No Members yet.')).toBeVisible();
  await expect(page.getByText('Could not load the Members')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Leave', exact: true })).toHaveCount(0);
});

type StandIn = { standIn: { signOut(): Promise<void> } };

// A Session that ends with No Members yet on screen: the refused load shows its alert alone (#297).
test('a Session that ends with No Members yet on screen shows the alert alone', async ({ page }) => {
  await addFirstAthlete(page);
  await expect(page.getByText('No Members yet.')).toBeVisible();
  await page.evaluate(async () => {
    await (globalThis as unknown as StandIn).standIn.signOut();
    window.dispatchEvent(new Event('online'));
  });

  await expect(page.getByText('Could not load the Members. Check the connection and try again.')).toBeVisible();
  await expect(page.getByText('No Members yet.')).toHaveCount(0);
});

// A Session that ends with a Member on screen: the refused load clears the list, so no stale Remove stands beside the alert (#297).
test('a Session that ends with a Member on screen shows the alert alone, no stale Remove', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('with-member@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await addAthlete(page);
  await expect(page.getByRole('listitem').filter({ hasText: 'member@example.com' })).toBeVisible();
  await page.evaluate(async () => {
    await (globalThis as unknown as StandIn).standIn.signOut();
    window.dispatchEvent(new Event('online'));
  });

  await expect(page.getByText('Could not load the Members. Check the connection and try again.')).toBeVisible();
  await expect(page.getByRole('listitem').filter({ hasText: 'member@example.com' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
});
