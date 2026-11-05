import { expect, test } from '@playwright/test';
import { openApp } from './openApp';
import { addFirstAthlete, startGame } from './recorder';

test("the page is navy whatever the phone's setting is", async ({ page }) => {
  await addFirstAthlete(page);
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
    await expect(page.locator('body')).toHaveCSS('color', 'rgb(242, 244, 248)');
  }
});

test('Start Game is the gold button with navy text on either phone setting', async ({ page }) => {
  await addFirstAthlete(page);
  const start = page.getByRole('button', { name: 'Start Game' });
  for (const colorScheme of ['dark', 'light'] as const) {
    await page.emulateMedia({ colorScheme });
    await expect(start).toHaveCSS('background-color', 'rgb(245, 184, 65)');
    await expect(start).toHaveCSS('color', 'rgb(11, 16, 32)');
  }
});

test('Home headline is Barlow Condensed, body text is Barlow, and the Barlow face is loaded', async ({ page }) => {
  await addFirstAthlete(page);
  // WebKit quotes the whole font stack, Chromium only the family name
  await expect(page.getByRole('heading', { level: 1 })).toHaveCSS('font-family', /^"?Barlow Condensed"?/);
  await expect(page.locator('body')).toHaveCSS('font-family', /^Barlow/);
  const loaded = await page.evaluate(async () => {
    await document.fonts.ready;
    return document.fonts.check('17px Barlow');
  });
  expect(loaded).toBe(true);
});

test('in dark, the free-throw MAKE and MISS keep their green and red', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.emulateMedia({ colorScheme: 'dark' });
  const row = page.getByRole('group', { name: 'Free Throw' });
  await expect(row.getByRole('button', { name: 'MAKE' })).toHaveCSS('color', 'rgb(63, 185, 80)');
  await expect(row.getByRole('button', { name: 'MISS' })).toHaveCSS('color', 'rgb(240, 96, 90)');
});

test('under dark, form inputs are 52px on the surface, and Settings marks the chosen Button Size and Field mode gold', async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await openApp(page);
  const athleteName = page.getByLabel('Athlete name');
  await expect(athleteName).toHaveCSS('background-color', 'rgb(19, 26, 44)');
  expect((await athleteName.boundingBox())?.height).toBeGreaterThanOrEqual(52);
  await athleteName.fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  const opponent = page.getByLabel('Opponent');
  await expect(opponent).toHaveCSS('background-color', 'rgb(19, 26, 44)');
  expect((await opponent.boundingBox())?.height).toBeGreaterThanOrEqual(52);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('group', { name: 'Button Size' }).locator('[aria-pressed="true"]')).toHaveCSS(
    'background-color',
    'rgb(245, 184, 65)',
  );
  const field = page.getByRole('button', { name: 'Field mode' });
  await field.click();
  await expect(field).toHaveCSS('background-color', 'rgb(245, 184, 65)');
});
