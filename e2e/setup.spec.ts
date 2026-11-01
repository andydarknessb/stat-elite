import { expect, test } from '@playwright/test';

const today = () => new Date().toLocaleDateString('en-CA');

test('Start Game opens setup, Start opens the live screen, and the next setup is prefilled from that Game', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await expect(page.getByRole('heading', { name: 'Game setup' })).toBeVisible();
  await expect(page.getByLabel('Sport')).toHaveValue('basketball');
  await expect(page.getByLabel('Period format')).toHaveValue('quarters');
  await expect(page.getByLabel('Opponent')).toHaveValue('Opponent');
  await expect(page.getByLabel('Date')).toHaveValue(today());

  await page.getByLabel('Opponent').fill('Hawks');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: /^STL/ })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByLabel('Opponent')).toHaveValue('Hawks');
});

test('the next setup is prefilled with 8 Periods from a Game started that way', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Period format').selectOption('8 Periods');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText('P1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByLabel('Period format')).toHaveValue('eighths');
});

test('a baseball Game is set up in innings, and Cancel starts nothing', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await page.getByLabel('Sport').selectOption('baseball');
  await expect(page.getByLabel('Period format')).toHaveValue('innings');
  await expect(page.getByLabel('Period format')).toBeDisabled();

  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveCount(0);

  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('baseball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Outcome' })).toBeVisible();
});
