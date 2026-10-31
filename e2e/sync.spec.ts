import { expect, test } from '@playwright/test';

// A Game recorded with the network off uploads once the Recorder saves it online, and the badge reaches 0.
// The smoke runs with no Supabase URL or key, so no request may reach supabase.co (#9).
test('a Game recorded offline uploads once it is saved, and the badge reaches 0', async ({ page, context }) => {
  const supabaseRequests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('supabase.co')) supabaseRequests.push(request.url());
  });

  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();

  await context.setOffline(true);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: /^STL/ }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  // the Athlete, the Game, the steal and the End Game
  await expect(page.getByText('4 not synced')).toBeVisible();

  await context.setOffline(false);
  await page.getByRole('button', { name: 'Save this game' }).click();
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send link' }).click();
  await expect(page.getByText('0 not synced')).toBeVisible();
  expect(supabaseRequests).toEqual([]);
});
