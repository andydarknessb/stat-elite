import { expect, test } from '@playwright/test';
import { openApp } from './openApp';
import { addAthlete, addFirstAthlete, startGame } from './recorder';

// A Game recorded with the network off uploads once the connection returns, and the badge reads All synced.
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
  await addAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: /^STL/ }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'Save Final Score', exact: true }).click();
  // the Athlete, the Game, the steal and the End Game
  await expect(page.getByText('4 not synced · saved on this phone')).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('All synced')).toBeVisible();
  expect(supabaseRequests).toEqual([]);
});

// The badge waits a second before it shows a count: a blip under a second around a stat tile tap reads All synced throughout (#278).
test('the badge holds All synced through a blip under a second around a stat tile tap', async ({ page, context }) => {
  await addFirstAthlete(page);
  await startGame(page);
  // every text the badge shows from here on, in order
  await page.evaluate(() => {
    const seen = [document.querySelector('.sync')?.textContent ?? ''];
    (window as unknown as { badgeSeen: string[] }).badgeSeen = seen;
    new MutationObserver(() => seen.push(document.querySelector('.sync')?.textContent ?? '')).observe(document.body, {
      subtree: true,
      childList: true,
      characterData: true,
    });
  });

  await context.setOffline(true);
  await page.getByRole('button', { name: /^STL/ }).click();
  await context.setOffline(false);
  await expect(page.getByText('All synced')).toBeVisible();
  const seen = await page.evaluate(() => (window as unknown as { badgeSeen: string[] }).badgeSeen);
  expect(seen.filter((text) => text !== 'All synced')).toEqual([]);
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
  await expect(page.getByText('All synced')).toBeVisible();
});

// Signed in as refused@example.com, the stand-in refuses every upload: Home says so, and the live screen does not (#208).
test("a row the server refuses shows Home's notice, and the live screen does not", async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Email').fill('refused@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await addAthlete(page);

  const notice = page.getByText("Some Games can't upload right now. They're safe on this phone.");
  await expect(notice).toBeVisible();
  await startGame(page);
  await expect(notice).toBeHidden();
});

// Offline, with no row refused, Home does not show the notice while its rows wait on the phone (#208).
test('offline, with rows waiting and none refused, Home does not show the notice', async ({ page, context }) => {
  await addFirstAthlete(page);
  await context.setOffline(true);
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'Save Final Score', exact: true }).click();
  await expect(page.getByText(/^[1-9][0-9]* not synced · saved on this phone$/)).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByText("Some Games can't upload right now. They're safe on this phone.")).toHaveCount(0);
});

// A Game recorded offline after sign-in uploads when the connection returns, with no tap in between (#48).
test('a Game recorded offline after sign-in uploads when the connection returns, with no tap', async ({ page, context }) => {
  // the second guard as the first test has it: no request reaches Supabase from this flow (#76)
  const supabaseRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('supabase.co')) supabaseRequests.push(request.url());
  });

  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: /^STL/ }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'Save Final Score', exact: true }).click();
  await expect(page.getByText('All synced')).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();

  await context.setOffline(true);
  await startGame(page);
  await expect(page.getByText(/^[1-9][0-9]* not synced · saved on this phone$/)).toBeVisible();

  await context.setOffline(false);
  await expect(page.getByText('All synced')).toBeVisible();
  expect(supabaseRequests).toEqual([]);
});
