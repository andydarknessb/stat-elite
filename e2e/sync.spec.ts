import { expect, test } from '@playwright/test';
import { openApp } from './openApp';

// A Game recorded with the network off uploads once the connection returns, and the badge reaches 0.
// The smoke runs with no Supabase URL or key, so no request may reach supabase.co (#9).
test('a Game recorded offline uploads once the connection returns, and the badge reaches 0', async ({ page, context }) => {
  const supabaseRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('supabase.co')) supabaseRequests.push(request.url());
  });

  // a second guard: no request to Supabase leaves the browser, even from a build that has its URL and key
  await page.route(/\.supabase\.co\//, (route) => route.abort());

  await openApp(page);
  // the network goes first, so the Athlete waits in the queue with the rest
  await context.setOffline(true);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: /^STL/ }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  // the Athlete, the Game, the steal and the End Game
  await expect(page.getByText('4 not synced')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('0 not synced')).toBeVisible();
  expect(supabaseRequests).toEqual([]);
});

// A wrong code on the sign-in screen offers a new code with the email kept, and the code and error clear; the right one then signs in (#76).
test('a wrong code on the sign-in screen offers a new code with the email kept, and the right one signs in', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Check your email and type the 6-digit code.')).toBeVisible();
  await page.getByLabel('Code').fill('12345');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/That code did not work/)).toBeVisible();

  await page.getByRole('button', { name: 'Send a new code' }).click();
  await expect(page.getByLabel('Email')).toHaveValue('casey@example.com');
  await expect(page.getByText(/That code did not work/)).toBeHidden();
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('Code')).toHaveValue('');
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('0 not synced')).toBeVisible();
});

// A Game recorded offline after sign-in uploads when the connection returns, with no tap in between (#48).
test('a Game recorded offline after sign-in uploads when the connection returns, with no tap', async ({ page, context }) => {
  // the second guard as the first test has it: no request reaches Supabase from this flow (#76)
  const supabaseRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('supabase.co')) supabaseRequests.push(request.url());
  });

  await openApp(page);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: /^STL/ }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await expect(page.getByText('0 not synced')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText(/^[1-9][0-9]* not synced$/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('0 not synced')).toBeVisible();
  expect(supabaseRequests).toEqual([]);
});
