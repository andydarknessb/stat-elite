import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, startGame, tapCourt } from './recorder';

const result = (page: Page) => page.getByRole('group', { name: 'Shot result' });
const teamCount = (page: Page) => page.getByRole('group', { name: 'Casey' }).locator('.count');
const court = (page: Page) => page.getByRole('img', { name: 'Half court' });

// tabs from the top of the live screen until the court has focus
async function tabToCourt(page: Page) {
  for (let i = 0; i < 30 && !(await court(page).evaluate((el) => el === document.activeElement)); i++) await page.keyboard.press('Tab');
  await expect(court(page)).toBeFocused();
}

test('a Shot is saved only at MAKE or MISS, and a made Shot adds its points to the strip', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  // a spot in the key is a 2: nothing is saved until the result tap
  await tapCourt(page, 50, 40);
  await expect(result(page).getByRole('button', { name: 'MAKE' })).toBeEnabled();
  await expect(page.getByRole('button', { name: 'Undo (last Event)', exact: true })).toBeDisabled();

  await result(page).getByRole('button', { name: 'MAKE' }).click();
  await expect(page.getByRole('button', { name: 'Undo (last Event): Made 2PT' })).toBeVisible();
  await expect(teamCount(page)).toHaveText('2');
  await expect(page.getByText('2PT 1/1 · 3PT 0/0 · 2 pts')).toBeVisible();
});

test('a spot beyond the arc presets 3PT, and the Recorder can flip it before the result', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  const threePt = page.getByRole('button', { name: '3PT' });
  await expect(threePt).toBeDisabled();

  await tapCourt(page, 50, 65);
  await expect(threePt).toHaveAttribute('aria-pressed', 'true');
  await threePt.click();
  await expect(threePt).toHaveAttribute('aria-pressed', 'false');

  await result(page).getByRole('button', { name: 'MISS' }).click();
  await expect(page.getByRole('button', { name: 'Undo (last Event): Missed 2PT' })).toBeVisible();
});

test('a made Shot is on the strip after a reload, and a spot with no result yet is not kept', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await tapCourt(page, 50, 65);
  await result(page).getByRole('button', { name: 'MAKE' }).click();
  await tapCourt(page, 50, 40);

  await page.reload();
  await expect(teamCount(page)).toHaveText('3');
  await expect(result(page).getByRole('button', { name: 'MAKE' })).toBeDisabled();
});

test('the court takes keyboard focus, and the arrow keys place a Spot that MAKE records', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await tabToCourt(page);

  // the first arrow key places the Spot at its fixed start in the key, then moves it one step: a 2 in mid-range center
  await page.keyboard.press('ArrowRight');
  await expect(court(page)).toHaveAccessibleName(/Mid-range center/);
  await expect(result(page).getByRole('button', { name: 'MAKE' })).toBeEnabled();
  await result(page).getByRole('button', { name: 'MAKE' }).click();
  await expect(page.getByRole('button', { name: 'Undo (last Event): Made 2PT' })).toBeVisible();
  await expect(page.getByText('2PT 1/1 · 3PT 0/0 · 2 pts')).toBeVisible();
});

test('arrow keys move the Spot across the three-point line, and the preset flips as a tap does', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await tabToCourt(page);
  const threePt = page.getByRole('button', { name: '3PT' });

  // fifteen steps down the court from the key put the Spot past the arc
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await expect(threePt).toHaveAttribute('aria-pressed', 'true');
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowUp');
  await expect(threePt).toHaveAttribute('aria-pressed', 'false');
});
