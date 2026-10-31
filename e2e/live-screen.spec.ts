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

async function chooseButtonSize(page: Page, size: string) {
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: size, exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();
}

test('at Standard the basketball live screen fits a 390×844 phone with no vertical scroll', async ({ page }) => {
  await addAthlete(page);
  await startGame(page);

  // each tile records its Event in one tap and shows the count
  for (const label of ['OREB', 'DREB', 'AST', 'STL', 'BLK', 'TO', 'FOUL']) {
    const tile = page.getByRole('button', { name: new RegExp(`^${label} \\d+$`) });
    await expect(tile).toBeVisible();
    await tile.click();
    await expect(tile).toHaveText(`${label} 1`);
  }
  await expect(page.getByRole('group', { name: 'Free Throw' })).toHaveText(/MAKE\s*0\/0\s*MISS/);
  await expect(page.getByRole('button', { name: 'End Game' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
  await expect(page.getByRole('dialog')).toHaveCount(0);
});

test('a Free Throw records MAKE or MISS with no spot, and the row reads made/attempted', async ({ page }) => {
  await addAthlete(page);
  await startGame(page);
  const row = page.getByRole('group', { name: 'Free Throw' });
  const make = page.getByRole('button', { name: 'MAKE' });
  const miss = page.getByRole('button', { name: 'MISS' });

  // green make, red miss: the colors carry meaning in light mode
  await expect(make).toHaveCSS('color', 'rgb(26, 127, 55)');
  await expect(miss).toHaveCSS('color', 'rgb(201, 48, 44)');
  await make.click();
  await expect(row).toHaveText(/MAKE\s*1\/1\s*MISS/);
  await miss.click();
  await expect(row).toHaveText(/MAKE\s*1\/2\s*MISS/);
  await expect(page.getByRole('button', { name: 'Undo (last Event): Free Throw missed' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Free Throw' })).toHaveText(/MAKE\s*1\/2\s*MISS/);
});

test('Button Size is chosen in Settings and survives a reload', async ({ page }) => {
  await addAthlete(page);
  await chooseButtonSize(page, 'Bleacher');

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Bleacher', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('at Bleacher the live screen splits into two swipe pages, Shots then Other stats', async ({ page }) => {
  await addAthlete(page);
  await chooseButtonSize(page, 'Bleacher');
  await startGame(page);
  const steal = page.getByRole('button', { name: /^STL \d+$/ });

  await expect(page.getByRole('region', { name: 'Shots' })).toBeInViewport();
  await expect(steal).not.toBeInViewport();

  await page.getByRole('region', { name: 'Shots' }).hover();
  await page.mouse.wheel(400, 0);

  await expect(steal).toBeInViewport();
  await expect(page.getByRole('region', { name: 'Other stats' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();
});
