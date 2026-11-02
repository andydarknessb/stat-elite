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

test('the page follows the phone colour scheme: navy on dark, white on light', async ({ page }) => {
  await addAthlete(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(242, 244, 248)');
  await page.emulateMedia({ colorScheme: 'light' });
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await expect(page.locator('body')).toHaveCSS('color', 'rgb(11, 16, 32)');
});

test('Start Game is the gold button with navy text in both schemes', async ({ page }) => {
  await addAthlete(page);
  const start = page.getByRole('button', { name: 'Start Game' });
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(start).toHaveCSS('background-color', 'rgb(245, 184, 65)');
    await expect(start).toHaveCSS('color', 'rgb(11, 16, 32)');
  }
});

test('Home headline is Barlow Condensed, body text is Barlow, and the Barlow face is loaded', async ({ page }) => {
  await addAthlete(page);
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /^"Barlow Condensed"/);
  await expect(page.locator('body')).toHaveCSS('font-family', /^Barlow/);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('17px Barlow');
  });
  expect(loaded).toBe(true);
});

test('in dark, the free-throw MAKE and MISS keep their green and red', async ({ page }) => {
  await addAthlete(page);
  await startGame(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const row = page.getByRole('group', { name: 'Free Throw' });
  await expect(row.getByRole('button', { name: 'MAKE' })).toHaveCSS('color', 'rgb(63, 185, 80)');
  await expect(row.getByRole('button', { name: 'MISS' })).toHaveCSS('color', 'rgb(240, 96, 90)');
});
