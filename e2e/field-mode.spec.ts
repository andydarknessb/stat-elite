import { expect, test, type Page } from '@playwright/test';

async function addAthlete(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

async function startGame(page: Page) {
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

test('Field mode in Settings paints the light theme over a dark phone, and stays on across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const field = page.getByRole('button', { name: 'Field mode', exact: true });
  await expect(field).toHaveAttribute('aria-pressed', 'false');

  await field.click();
  await expect(field).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.getByRole('button', { name: 'Settings' }).click();
  await field.click();
  await expect(field).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
});

test('the live screen sun button turns Field mode on at Standard without scrolling', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addAthlete(page);
  await startGame(page);
  const sun = page.getByRole('button', { name: 'Field mode', exact: true });
  await expect(sun).toHaveAttribute('aria-pressed', 'false');

  await sun.click();

  await expect(sun).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});
