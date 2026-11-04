import { expect, test } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

test('at Standard the basketball live screen fits a 390×844 phone with no vertical scroll', async ({ page, browserName }) => {
  test.fixme(browserName === 'webkit', 'WebKit: bug #218');
  await addFirstAthlete(page);
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
  await addFirstAthlete(page);
  await startGame(page);
  const row = page.getByRole('group', { name: 'Free Throw' });
  const make = row.getByRole('button', { name: 'MAKE' });
  const miss = row.getByRole('button', { name: 'MISS' });

  // green make, red miss: the colors carry meaning in the dark theme
  await expect(make).toHaveCSS('color', 'rgb(63, 185, 80)');
  await expect(miss).toHaveCSS('color', 'rgb(240, 96, 90)');
  await make.click();
  await expect(row).toHaveText(/MAKE\s*1\/1\s*MISS/);
  await miss.click();
  await expect(row).toHaveText(/MAKE\s*1\/2\s*MISS/);
  await expect(page.getByRole('button', { name: 'Undo (last Event): Free Throw missed' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Free Throw' })).toHaveText(/MAKE\s*1\/2\s*MISS/);
});

test('Button Size is chosen in Settings and survives a reload', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Bleacher', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.reload();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('button', { name: 'Bleacher', exact: true })).toHaveAttribute('aria-pressed', 'true');
});

test('at Bleacher the live screen splits into two swipe pages, Shots then Other stats', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });
  const steal = page.getByRole('button', { name: /^STL \d+$/ });

  await expect(page.getByRole('region', { name: 'Shots' })).toBeInViewport();
  await expect(steal).not.toBeInViewport();

  await page.getByRole('region', { name: 'Shots' }).hover();
  await page.mouse.wheel(400, 0);

  await expect(steal).toBeInViewport();
  await expect(page.getByRole('region', { name: 'Other stats' })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();
});

test('at Bleacher the half court keeps its feet ratio, and the Shot controls fit beside it', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });

  const court = await page.getByRole('img', { name: 'Half court' }).boundingBox();
  await expect(page.getByRole('img', { name: 'Half court' })).toHaveAttribute('viewBox', '0 0 50 42');
  expect(Math.abs(court!.width / court!.height - 50 / 42)).toBeLessThanOrEqual(0.01);

  const controls = await page.getByRole('group', { name: 'Shot result' }).boundingBox();
  const shots = await page.getByRole('region', { name: 'Shots' }).boundingBox();
  expect(controls!.x + controls!.width).toBeLessThanOrEqual(shots!.x + shots!.width + 0.5);
});

test.describe('under dark', () => {
  test.use({ colorScheme: 'dark' });

  test('the Team count is gold and the Opponent count is near-white', async ({ page }) => {
    await addFirstAthlete(page);
    await startGame(page);

    await expect(page.getByRole('group', { name: 'Casey', exact: true }).locator('.count')).toHaveCSS('color', 'rgb(245, 184, 65)');
    await expect(page.getByRole('group', { name: 'Opponent', exact: true }).locator('.count')).toHaveCSS('color', 'rgb(242, 244, 248)');
  });

  test('a tapped stat tile flashes its gold border within 300 ms, and the flash ends', async ({ page }) => {
    await addFirstAthlete(page);
    await startGame(page);
    const tile = page.getByRole('button', { name: /^OREB \d+$/ });

    await tile.click();
    await expect(tile).toHaveCSS('border-top-color', 'rgb(245, 184, 65)', { timeout: 300 });
    await page.waitForTimeout(1500);
    await expect(tile).not.toHaveCSS('border-top-color', 'rgb(245, 184, 65)');
  });
});
