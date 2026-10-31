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

test('tapping the Game line lists each closed Shift with its time and Plus/Minus, and the screen still fits 390×844', async ({ page }) => {
  await startBasketballGame(page);

  await page.getByRole('button', { name: 'Sub In' }).click();
  await page.getByRole('button', { name: 'Team +1' }).click();
  await page.getByRole('button', { name: 'Team +1' }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();
  await page.getByRole('button', { name: 'Sub In' }).click();
  await page.getByRole('button', { name: 'Opponent +1' }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();

  const gameLine = page.locator('.shift .game');
  await expect(gameLine).toHaveAttribute('aria-expanded', 'false');
  const bar = page.locator('.shift');
  const closedHeight = (await bar.boundingBox())!.height;
  await gameLine.click();

  const shifts = page.getByRole('list', { name: 'Shifts' }).getByRole('listitem');
  await expect(shifts).toHaveCount(2);
  await expect(shifts.nth(0)).toContainText('Shift 1');
  await expect(shifts.nth(0)).toContainText('+2');
  await expect(shifts.nth(1)).toContainText('Shift 2');
  await expect(shifts.nth(1)).toContainText('-1');
  await expect(gameLine).toHaveAttribute('aria-expanded', 'true');
  expect((await bar.boundingBox())!.height).toBeCloseTo(closedHeight, 1);
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await gameLine.click();
  await expect(gameLine).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('list', { name: 'Shifts' })).toHaveCount(0);
  await expect(gameLine).toContainText(/2 Shifts · Plus\/Minus \+1/);
});

for (const size of ['Compact', 'Bleacher']) {
  test(`at ${size} the Shifts list opens in the Shift bar and does not widen the page`, async ({ page }) => {
    await page.goto('/');
    await page.getByLabel('Athlete name').fill('Casey');
    await page.getByRole('button', { name: 'Add Athlete' }).click();
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: size, exact: true }).click();
    await page.getByRole('button', { name: 'Done' }).click();
    await page.getByRole('button', { name: 'Start Game' }).click();
    await page.getByRole('button', { name: 'Start', exact: true }).click();

    await page.getByRole('button', { name: 'Sub In' }).click();
    await page.getByRole('button', { name: 'Team +1' }).click();
    await page.getByRole('button', { name: 'Sub Out' }).click();
    await page.locator('.shift .game').click();

    await expect(page.getByRole('list', { name: 'Shifts' }).getByRole('listitem')).toHaveCount(1);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

test('a long Shifts list scrolls inside its line and does not widen the page', async ({ page }) => {
  await startBasketballGame(page);
  for (let i = 0; i < 4; i++) {
    await page.getByRole('button', { name: 'Sub In' }).click();
    await page.getByRole('button', { name: 'Team +1' }).click();
    await page.getByRole('button', { name: 'Sub Out' }).click();
  }
  await page.locator('.shift .game').click();

  const list = page.getByRole('list', { name: 'Shifts' });
  await expect(list.getByRole('listitem')).toHaveCount(4);
  expect(await list.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
});

test('the Shift on court stays off the Shifts list', async ({ page }) => {
  await startBasketballGame(page);

  await page.getByRole('button', { name: 'Sub In' }).click();
  await page.getByRole('button', { name: 'Team +1' }).click();
  await page.locator('.shift .game').click();

  await expect(page.getByRole('list', { name: 'Shifts' })).toHaveCount(1);
  await expect(page.getByRole('list', { name: 'Shifts' }).getByRole('listitem')).toHaveCount(0);
  await expect(page.getByText(/^On court \d+:\d{2}/)).toBeVisible();
});
