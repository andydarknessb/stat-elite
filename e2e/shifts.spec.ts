import { expect, test, type Page } from '@playwright/test';

async function startBasketballGame(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

test('Sub In puts the Athlete on court and Sub Out takes her off, with the Shift on the bar', async ({ page }) => {
  await startBasketballGame(page);

  await page.getByRole('button', { name: 'Sub In' }).click();
  await expect(page.getByRole('button', { name: 'Sub Out' })).toBeVisible();
  await expect(page.getByText(/^On court \d+:\d{2}/)).toBeVisible();

  await page.getByRole('button', { name: 'Sub Out' }).click();
  await expect(page.getByText('On bench')).toBeVisible();
  await expect(page.getByText(/1 Shift · Plus\/Minus/)).toBeVisible();
});
