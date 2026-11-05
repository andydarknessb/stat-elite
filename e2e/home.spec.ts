import { expect, test, type Locator } from '@playwright/test';
import { addAthlete, addFirstAthlete, recordBasketballGame, recordSoftballGame } from './recorder';

/** One headline number on the season card, by its label. */
const statOf = (season: Locator, label: string) => season.locator('dl > div', { hasText: label });

test('Home shows the basketball season card and the Game as a Won row with its Final Score', async ({ page }) => {
  await addFirstAthlete(page);
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
  await addFirstAthlete(page);
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

test('switching Athlete opens the season card on its first sport, not the one chosen for the last Athlete', async ({ page }) => {
  await addFirstAthlete(page);
  await recordBasketballGame(page);
  await recordSoftballGame(page);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByLabel('Athlete name').fill('Sam');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await recordBasketballGame(page);
  await recordSoftballGame(page, 'Sam');

  const season = page.getByRole('region', { name: 'Season' });
  await season.getByRole('button', { name: 'Softball' }).click();
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Switch to Casey' }).click();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
  await expect(season.getByRole('button', { name: 'Basketball' })).toHaveAttribute('aria-pressed', 'true');
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'false');
});

test('an Invite stays with its Athlete: after a switch, the link made under Sam is gone and Casey offers its own', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await addAthlete(page, { name: 'Sam' });

  const sharing = page.getByRole('region', { name: 'Sharing' });
  await page.getByRole('button', { name: 'Invite co-parent' }).click();
  await expect(sharing).toContainText('Invite for Sam');
  await expect(sharing).toContainText('?invite=');

  await page.getByRole('button', { name: 'Switch to Casey' }).click();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
  await expect(sharing).not.toContainText('?invite=');
  await expect(sharing.getByRole('button', { name: 'Invite co-parent' })).toBeVisible();
});

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`on either phone setting, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('Start Game is the one gold button on Home', async ({ page }) => {
      await addFirstAthlete(page);
      await expect(page.getByRole('button', { name: 'Start Game' })).toHaveCSS('background-color', 'rgb(245, 184, 65)');
      for (const name of ['Edit', 'Add Athlete', 'Settings']) {
        await expect(page.getByRole('button', { name, exact: true })).not.toHaveCSS('background-color', 'rgb(245, 184, 65)');
      }
    });

    test('the pressed tab label is gold text', async ({ page }) => {
      await addFirstAthlete(page);
      await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCSS('color', 'rgb(245, 184, 65)');
    });
  });
}
