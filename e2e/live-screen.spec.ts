import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

// The toast is the Undo button's box, so no Period row button sits under it (#246)
async function expectToastOverUndo(page: Page) {
  const toast = await page.getByRole('status').boundingBox();
  const undo = await page.getByRole('button', { name: /^Undo \(last Event\)/ }).boundingBox();
  if (!toast || !undo) throw new Error('the toast or the Undo button is not on screen');
  // the boxes go into each failure message, so a red run shows where each element sat
  const periodRow = [];
  for (const button of await page.locator('.period-row button').all()) periodRow.push(await button.boundingBox());
  const slot = await page.locator('.undo-slot').boundingBox();
  const diagnostics = JSON.stringify({ toast, undo, slot, periodRow, viewport: page.viewportSize() });
  for (const key of ['x', 'y', 'width', 'height'] as const) {
    expect(Math.abs(toast[key] - undo[key]), `toast and Undo differ in ${key}: ${diagnostics}`).toBeLessThanOrEqual(1);
  }
  for (const box of periodRow) {
    if (!box) throw new Error(`a Period row button is not on screen: ${diagnostics}`);
    const overlaps = box.x < toast.x + toast.width && toast.x < box.x + box.width && box.y < toast.y + toast.height && toast.y < box.y + box.height;
    expect(overlaps, `the toast overlaps a Period row button: ${diagnostics}`).toBe(false);
  }
}

test('at Standard the basketball live screen fits a 390×844 phone with no vertical scroll', async ({ page }) => {
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

test('the toast sits exactly over the Undo button after a tap, and no Period row button is under it', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: /^STL/ }).click();

  await expect(page.getByRole('status')).toBeVisible();
  await expectToastOverUndo(page);
});

test('on softball, with the Athlete on base and an Outcome armed, the toast still sits over the Undo button', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '1B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Base', exact: true })).toBeVisible();
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();

  await page.getByRole('button', { name: 'Ball', exact: true }).click();
  await expect(page.getByRole('status')).toBeVisible();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();
  // the Ball adds a Count line above the Undo button, which moves it down; the boxes are read once that line has landed
  await expect(page.getByText(/^Count /)).toBeVisible();
  await expectToastOverUndo(page);
});

test('the live screen has its status region before the first tap, and a tap names its Event in it', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await expect(page.getByRole('status')).toHaveCount(1);

  await page.getByRole('button', { name: /^STL/ }).click();
  await expect(page.getByRole('status')).toContainText('STL');
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

test.describe('on a touchscreen', () => {
  test.use({ hasTouch: true });

  // End Game opens the Final Score form and brings it into view, so Save Final Score is on screen with no scroll by the Recorder (#245)
  test('End Game stays in its row and brings the Final Score form into view, and a second tap keeps playing', async ({ page }) => {
    await addFirstAthlete(page);
    await startGame(page);

    const endGame = page.locator('.period-row').getByRole('button', { name: 'End Game', exact: true });
    const box = await endGame.boundingBox();
    if (!box) throw new Error('End Game is not on screen');
    const centre = { x: box.x + box.width / 2, y: box.y + box.height / 2 };

    await page.touchscreen.tap(centre.x, centre.y);
    await expect(endGame).toHaveAttribute('aria-expanded', 'true');
    await expect(page.getByRole('button', { name: 'Save Final Score', exact: true })).toBeInViewport({ ratio: 1 });

    // the same tap again lands on Keep playing, which sits where End Game was; the Game stays live
    await page.touchscreen.tap(centre.x, centre.y);
    // a Game closes asynchronously, so give a tap that would end it time to land before the check
    await page.waitForTimeout(1000);
    await expect(page.getByRole('region', { name: 'Game Complete' })).toHaveCount(0);
  });
});
