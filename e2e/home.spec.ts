import { expect, test, type Locator, type Page } from '@playwright/test';

async function addAthlete(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

// the same Game games-feed.spec.ts records: one made 2, a made Free Throw, an offensive rebound and an assist, 3–0
async function recordBasketballGame(page: Page) {
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
}

// the same Game games-feed.spec.ts records: one double with 2 RBI, 3–1
async function recordSoftballGame(page: Page) {
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
}

/** One headline number on the season card, by its label. */
const statOf = (season: Locator, label: string) => season.locator('dl > div', { hasText: label });

test('Home shows the basketball season card and the Game as a Won row with its Final Score', async ({ page }) => {
  await addAthlete(page);
  await recordBasketballGame(page);

  const season = page.getByRole('region', { name: 'Season' });
  await expect(season).toContainText('1 Game');
  await expect(statOf(season, 'Points')).toContainText('3');
  await expect(statOf(season, 'Rebounds')).toContainText('1');
  await expect(statOf(season, 'Plus/Minus')).toContainText('+3');

  const row = page.getByRole('region', { name: 'Recent Games' }).getByRole('button').first();
  await expect(row.getByRole('img', { name: 'Won' })).toBeVisible();
  await expect(row).toContainText('3–0');
});

test('Home\'s season chips switch the season card to softball, which shows its batting rates', async ({ page }) => {
  await addAthlete(page);
  await recordBasketballGame(page);
  await recordSoftballGame(page);

  const season = page.getByRole('region', { name: 'Season' });
  await expect(season.getByRole('button', { name: 'Basketball' })).toHaveAttribute('aria-pressed', 'true');
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'false');

  await season.getByRole('button', { name: 'Softball' }).click();
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'true');
  await expect(statOf(season, 'AVG')).toContainText('1.000');
  await expect(statOf(season, 'OBP')).toContainText('1.000');
  await expect(statOf(season, 'SLG')).toContainText('2.000');
});

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(colorScheme, () => {
    test.use({ colorScheme });

    test('Start Game is the one gold button on Home', async ({ page }) => {
      await addAthlete(page);
      await expect(page.getByRole('button', { name: 'Start Game' })).toHaveCSS('background-color', 'rgb(245, 184, 65)');
      for (const name of ['Edit', 'Add Athlete', 'Settings']) {
        await expect(page.getByRole('button', { name, exact: true })).not.toHaveCSS('background-color', 'rgb(245, 184, 65)');
      }
    });

    test('the pressed tab label is gold text', async ({ page }) => {
      await addAthlete(page);
      const label = colorScheme === 'dark' ? 'rgb(245, 184, 65)' : 'rgb(100, 73, 26)';
      await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCSS('color', label);
    });
  });
}
