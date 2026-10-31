import { expect, test, type Page } from '@playwright/test';

async function startSoftballGame(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

test('an Outcome, then its RBI chip, records a Plate Appearance; Undo takes it back; Next period moves to the next inning', async ({ page }) => {
  await startSoftballGame(page);
  await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
  await expect(page.getByText('AVG —')).toBeVisible();

  await page.getByRole('button', { name: '2B', exact: true }).click();
  // the RBI row is the tallest state of the screen: it must still fit the phone without scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '2 RBI' }).click();

  await expect(page.getByText('AVG 1.000 · OBP 1.000 · SLG 2.000')).toBeVisible();

  await page.getByRole('button', { name: 'Undo (last Event): 2B' }).click();
  await expect(page.getByText('AVG —')).toBeVisible();

  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByText('Inn 2', { exact: true })).toBeVisible();
});
