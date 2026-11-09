import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, endGame, startGame, tapCourt } from './recorder';

const result = (page: Page) => page.getByRole('group', { name: 'Shot result' });
const threePointButton = (page: Page) => page.getByRole('button', { name: '3PT', exact: true });
// a Spot far beyond the arc: a 3 whenever Three-Pointers are on
const tapDeep = (page: Page) => tapCourt(page, 50, 90);

test('with Three-pointers off, a Spot beyond the arc is a 2 and the screen never says 3PT', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { threePointers: 'Off' });

  await expect(threePointButton(page)).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'Half court' }).locator('path')).toHaveCount(1);
  const turnOn = await page.getByRole('button', { name: 'Turn on 3PT' }).boundingBox();
  const controls = await result(page).boundingBox();
  expect(turnOn?.width).toBeCloseTo(controls?.width ?? 0, 0);
  await tapDeep(page);
  await result(page).getByRole('button', { name: 'MAKE' }).click();

  await expect(page.getByRole('button', { name: 'Undo (last Event): Made 2PT' })).toBeVisible();
  await expect(page.getByText('2PT 1/1 · FT 0/0 · 2 pts')).toBeVisible();
});

test('with Three-pointers off, the court tells a keyboard Recorder a deep Spot is a 2', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { threePointers: 'Off' });

  const court = page.getByRole('img', { name: 'Half court' });
  await court.focus();
  for (let i = 0; i < 15; i++) await page.keyboard.press('ArrowDown');
  await expect(court).toHaveAccessibleName(/Mid-range center, 2PT$/);
});

test('Turn on 3PT from the keyboard with no Spot picked leaves focus on the court', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { threePointers: 'Off' });

  await page.getByRole('button', { name: 'Turn on 3PT' }).focus();
  await page.keyboard.press('Enter');
  await expect(threePointButton(page)).toBeVisible();
  await expect(page.getByRole('img', { name: 'Half court' })).toBeFocused();
});

test('Turn on 3PT brings the 3PT button back, and a Spot already tapped takes its preset', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { threePointers: 'Off' });

  await tapDeep(page);
  await page.getByRole('button', { name: 'Turn on 3PT' }).click();

  await expect(threePointButton(page)).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: 'Turn on 3PT' })).toHaveCount(0);
  await result(page).getByRole('button', { name: 'MAKE' }).click();
  await expect(page.getByText('2PT 0/0 · 3PT 1/1 · FT 0/0 · 3 pts')).toBeVisible();
});

test('Game setup keeps Three-pointers from the last basketball Game, and softball has no such field', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { threePointers: 'Off' });
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByLabel('Three-pointers')).toHaveValue('off');
  await page.getByLabel('Sport').selectOption('softball');
  await expect(page.getByLabel('Three-pointers')).toHaveCount(0);
});

test('the Free Throw row says Free Throws, and the tally adds its point', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  const row = page.getByRole('group', { name: 'Free Throw' });
  await expect(row.getByText('Free Throws')).toBeVisible();
  await row.getByRole('button', { name: 'MAKE' }).click();
  await expect(page.getByText('2PT 0/0 · 3PT 0/0 · FT 1/1 · 1 pt')).toBeVisible();
});

test('at Standard the live screen still fits with a long tally', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  const shots = async (x: number, y: number, attempts: number, makes: number) => {
    for (let i = 0; i < attempts; i++) {
      await tapCourt(page, x, y);
      await result(page).getByRole('button', { name: i < makes ? 'MAKE' : 'MISS' }).click();
    }
  };
  await shots(50, 40, 20, 12);
  await shots(50, 90, 10, 3);
  const freeThrows = page.getByRole('group', { name: 'Free Throw' });
  for (let i = 0; i < 12; i++) await freeThrows.getByRole('button', { name: i < 10 ? 'MAKE' : 'MISS' }).click();
  await expect(page.getByText('2PT 12/20 · 3PT 3/10 · FT 10/12 · 43 pts')).toBeVisible();

  await expect(page.getByRole('button', { name: 'End Game' })).toBeInViewport();
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('at Bleacher the half court sits in the middle of its row', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });

  const court = await page.getByRole('img', { name: 'Half court' }).boundingBox();
  const row = await result(page).boundingBox();
  if (!court || !row) throw new Error('the court and its controls are not on screen');
  expect(Math.abs(court.x + court.width / 2 - (row.x + row.width / 2))).toBeLessThan(1);
});
