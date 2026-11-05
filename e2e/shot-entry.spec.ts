import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, startGame, tapCourt } from './recorder';

const result = (page: Page) => page.getByRole('group', { name: 'Shot result' });
const teamCount = (page: Page) => page.getByRole('group', { name: 'Casey' }).locator('.count');

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
