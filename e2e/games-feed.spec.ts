import { expect, test, type Page } from '@playwright/test';

async function addAthlete(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

test('Home shows the season line, and the Games tab lists the finished Game, whose row opens its summary', async ({ page }) => {
  await addAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // on court for a made 2 at the basket, a made Free Throw, an offensive rebound and an assist
  await page.getByRole('button', { name: 'Sub In' }).click();
  const court = await page.getByRole('img', { name: 'Half court' }).boundingBox();
  await page.mouse.click(court!.x + court!.width / 2, court!.y + court!.height * 0.11);
  await page.getByRole('group', { name: 'Shot result' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('group', { name: 'Free Throw' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('button', { name: /^OREB \d+$/ }).click();
  await page.getByRole('button', { name: /^AST \d+$/ }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // the Shift ran from 0–0 to 3–0 on the strip, so Plus/Minus is +3
  const season = page.getByRole('region', { name: 'Season' });
  await expect(season).toContainText('1 Game');
  await expect(season.locator('dl > div', { hasText: 'Points' })).toContainText('3');
  await expect(season.locator('dl > div', { hasText: 'Rebounds' })).toContainText('1');
  await expect(season.locator('dl > div', { hasText: 'Plus/Minus' })).toContainText('+3');

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  // basketball keeps Plus/Minus on its feed row, and its summary keeps the tiles
  await expect(page.getByRole('button', { name: /Opponent/ })).toContainText('Plus/Minus +3');
  await page.getByRole('button', { name: /Opponent/ }).click();
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Won' })).toBeVisible();
  await expect(page.getByText('Team 3 – Opponent 0')).toBeVisible();
  await expect(page.getByText('Plus/Minus +3 · Playing Share')).toBeVisible();
  await expect(page.getByText('STL 0')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});

test('a softball Game shows its batting line in Game Complete, its Games feed row and its own Home season line', async ({ page }) => {
  await addAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // a double with 2 RBI: one At-Bat, one hit
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await page.getByRole('button', { name: '2 RBI' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Team final').fill('3');
  await page.getByLabel('Opponent final').fill('1');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();

  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
  await expect(page.getByText('Team 3 – Opponent 1')).toBeVisible();
  await expect(page.getByText('H/AB 1/1 · 2 RBI', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Game Complete' })).not.toContainText('Plus/Minus');
  await page.getByRole('button', { name: 'Done' }).click();

  const season = page.getByRole('region', { name: 'Season' });
  await expect(season.locator('dl > div', { hasText: 'AVG' })).toContainText('1.000');
  await expect(season.locator('dl > div', { hasText: 'OBP' })).toContainText('1.000');
  await expect(season.locator('dl > div', { hasText: 'SLG' })).toContainText('2.000');
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('button', { name: /H\/AB 1\/1 · 2 RBI/ })).toContainText('H/AB 1/1 · 2 RBI');

  // the summary shows the batting line only: no Plus/Minus, Playing Share or basketball tiles
  await page.getByRole('button', { name: /H\/AB 1\/1 · 2 RBI/ }).click();
  await expect(page.getByText('H/AB 1/1 · 2 RBI', { exact: true })).toBeVisible();
  await expect(page.getByText('Plus/Minus')).toHaveCount(0);
  await expect(page.getByText('Playing Share')).toHaveCount(0);
  await expect(page.getByText('STL')).toHaveCount(0);
});

test('a baseball Game shows its batting line in Game Complete and its Games feed row, with no Plus/Minus', async ({ page }) => {
  await addAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Baseball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // a double with 1 RBI: one At-Bat, one hit
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await page.getByRole('button', { name: '1 RBI' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Team final').fill('2');
  await page.getByLabel('Opponent final').fill('1');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();

  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
  await expect(page.getByText('H/AB 1/1 · 1 RBI', { exact: true })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Game Complete' })).not.toContainText('Plus/Minus');
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('button', { name: /H\/AB 1\/1 · 1 RBI/ })).toContainText('H/AB 1/1 · 1 RBI');
});

test('the Games tab chips filter its feed and season tiles, with one basketball and one softball Game', async ({ page }) => {
  await addAthlete(page);
  // the basketball Game from the first test: a made 2, a made Free Throw, an offensive rebound and an assist
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'Sub In' }).click();
  const court = await page.getByRole('img', { name: 'Half court' }).boundingBox();
  await page.mouse.click(court!.x + court!.width / 2, court!.y + court!.height * 0.11);
  await page.getByRole('group', { name: 'Shot result' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('group', { name: 'Free Throw' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('button', { name: /^OREB \d+$/ }).click();
  await page.getByRole('button', { name: /^AST \d+$/ }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // the softball Game from the second test: a double with 2 RBI
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await page.getByRole('button', { name: '2 RBI' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Team final').fill('3');
  await page.getByLabel('Opponent final').fill('1');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  const all = page.getByRole('button', { name: 'All', exact: true });
  const softball = page.getByRole('button', { name: 'Softball', exact: true });
  const season = page.getByRole('region', { name: 'Season' });
  const basketballRow = page.getByRole('button', { name: /Plus\/Minus \+3/ });
  const softballRow = page.getByRole('button', { name: /H\/AB 1\/1 · 2 RBI/ });

  // All is pressed first: both rows, and no season tiles
  await expect(page.getByRole('button', { name: 'Basketball', exact: true })).toBeVisible();
  await expect(softball).toBeVisible();
  await expect(all).toHaveAttribute('aria-pressed', 'true');
  await expect(basketballRow).toBeVisible();
  await expect(softballRow).toBeVisible();
  await expect(season).toHaveCount(0);

  // Softball: its row only, and its season tiles above its Games
  await softball.click();
  await expect(softball).toHaveAttribute('aria-pressed', 'true');
  await expect(basketballRow).toHaveCount(0);
  await expect(softballRow).toBeVisible();
  await expect(season.locator('dl > div', { hasText: 'AVG' })).toContainText('1.000');
  await expect(season.locator('dl > div', { hasText: 'OBP' })).toContainText('1.000');
  await expect(season.locator('dl > div', { hasText: 'SLG' })).toContainText('2.000');
  await expect(season.locator('dl > div', { hasText: 'H/AB' })).toContainText('1/1');
  await expect(season.locator('dl > div', { hasText: 'RBI' })).toContainText('2');
  await expect(season.locator('dl > div', { hasText: 'Games' })).toContainText('1');

  // All again: both rows back, and no tiles
  await all.click();
  await expect(basketballRow).toBeVisible();
  await expect(softballRow).toBeVisible();
  await expect(season).toHaveCount(0);
});
