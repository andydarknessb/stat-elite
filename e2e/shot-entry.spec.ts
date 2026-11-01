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

/** Taps the half court at a spot, given as 0–100 on each axis. */
async function tapCourt(page: Page, x: number, y: number) {
  const court = page.getByRole('img', { name: 'Half court' });
  const box = await court.boundingBox();
  if (!box) throw new Error('the half court is not on screen');
  await court.click({ position: { x: (box.width * x) / 100, y: (box.height * y) / 100 } });
}

const result = (page: Page) => page.getByRole('group', { name: 'Shot result' });
const teamCount = (page: Page) => page.getByRole('group', { name: 'Team' }).locator('.count');

test('a Shot is saved only at MAKE or MISS, and a made Shot adds its points to the strip', async ({ page }) => {
  await addAthlete(page);
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
  await addAthlete(page);
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
  await addAthlete(page);
  await startGame(page);
  await tapCourt(page, 50, 65);
  await result(page).getByRole('button', { name: 'MAKE' }).click();
  await tapCourt(page, 50, 40);

  await page.reload();
  await expect(teamCount(page)).toHaveText('3');
  await expect(result(page).getByRole('button', { name: 'MAKE' })).toBeDisabled();
});
