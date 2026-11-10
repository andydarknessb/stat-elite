import { expect, test, type Locator, type Page } from '@playwright/test';
import { addFirstAthlete, endGame, startGame, tapCourt } from './recorder';

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
  await expect(page.getByRole('group', { name: 'Free Throw' })).toHaveText(/MAKE\s*Free Throws\s*0\/0\s*MISS/);
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
  await expect(row).toHaveText(/MAKE\s*Free Throws\s*1\/1\s*MISS/);
  await miss.click();
  await expect(row).toHaveText(/MAKE\s*Free Throws\s*1\/2\s*MISS/);
  await expect(page.getByRole('button', { name: 'Undo (last Event): Free Throw missed' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Free Throw' })).toHaveText(/MAKE\s*Free Throws\s*1\/2\s*MISS/);
});

// the Free Throw pair: muted while a Spot is placed, and enabled either way (#274)
async function expectFreeThrowMuted(page: Page, muted: boolean) {
  const row = page.getByRole('group', { name: 'Free Throw' });
  for (const name of ['MAKE', 'MISS']) {
    const button = row.getByRole('button', { name, exact: true });
    await expect(button).toHaveCSS('opacity', muted ? '0.5' : '1');
    await expect(button).toBeEnabled();
  }
}

test('a placed Spot mutes the Free Throw pair, which stays enabled, and the pair is full again when the Shot records', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  const row = page.getByRole('group', { name: 'Free Throw' });
  await expectFreeThrowMuted(page, false);

  await tapCourt(page, 50, 40);
  await expectFreeThrowMuted(page, true);
  await row.getByRole('button', { name: 'MAKE', exact: true }).click();
  await expect(row).toHaveText(/MAKE\s*Free Throws\s*1\/1\s*MISS/);
  await expect(page.locator('.court .spot')).toBeVisible();
  await expectFreeThrowMuted(page, true);

  await page.getByRole('group', { name: 'Shot result' }).getByRole('button', { name: 'MAKE', exact: true }).click();
  await expect(page.locator('.court .spot')).toHaveCount(0);
  await expectFreeThrowMuted(page, false);
});

test('at Bleacher a placed Spot mutes the Free Throw pair the same way', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });
  await tapCourt(page, 50, 40);
  await expectFreeThrowMuted(page, true);
});

test('in Field mode a placed Spot mutes the Free Throw pair the same way', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: 'Field mode' }).click();
  await expect(page.getByRole('button', { name: 'Field mode' })).toHaveAttribute('aria-pressed', 'true');
  await tapCourt(page, 50, 40);
  await expectFreeThrowMuted(page, true);
});

// the strip's labels and ± buttons sit 8px inside its top and bottom edges, so the card's edge never touches them (#274)
test('the score strip keeps its labels and ± buttons 8px inside its top and bottom edges', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  const strip = await page.getByRole('region', { name: 'Score', exact: true }).boundingBox();
  const team = page.getByRole('group', { name: 'Casey', exact: true });
  const label = await team.locator('.score-name').boundingBox();
  if (!strip || !label) throw new Error('the score strip is not on screen');
  expect(label.y).toBeGreaterThanOrEqual(strip.y + 8 - 0.5);
  for (const button of await team.getByRole('button').all()) {
    const box = await button.boundingBox();
    if (!box) throw new Error('a score button is not on screen');
    expect(box.y + box.height).toBeLessThanOrEqual(strip.y + strip.height - 8 + 0.5);
  }
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

test('at Bleacher the half court keeps its feet ratio, and the Shot controls sit under it at full width', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });

  const court = await page.getByRole('img', { name: 'Half court' }).boundingBox();
  await expect(page.getByRole('img', { name: 'Half court' })).toHaveAttribute('viewBox', '0 0 50 42');
  expect(Math.abs(court!.width / court!.height - 50 / 42)).toBeLessThanOrEqual(0.01);

  const controls = await page.getByRole('group', { name: 'Shot result' }).boundingBox();
  const shots = await page.getByRole('region', { name: 'Shots' }).boundingBox();
  // the controls sit under the court and span the page, so MAKE and MISS are not squeezed beside it (#247)
  expect(controls!.y).toBeGreaterThanOrEqual(court!.y + court!.height - 0.5);
  expect(Math.abs(controls!.width - shots!.width)).toBeLessThanOrEqual(0.5);
});

// the Shot result buttons' widths on screen, for the Standard and Bleacher comparison (#247)
async function shotResultWidths(page: Page) {
  const result = page.getByRole('group', { name: 'Shot result' });
  const make = await result.getByRole('button', { name: 'MAKE', exact: true }).boundingBox();
  const miss = await result.getByRole('button', { name: 'MISS', exact: true }).boundingBox();
  if (!make || !miss) throw new Error('MAKE or MISS is not on screen');
  return { make: make.width, miss: miss.width };
}

test('at Bleacher MAKE and MISS are at least as wide as at Standard, on the same 390×844 phone', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  const standard = await shotResultWidths(page);
  // a live Game holds the Settings off, so the Standard Game ends before the Bleacher one starts
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);
  await page.getByRole('button', { name: 'Done', exact: true }).click();

  await startGame(page, { buttonSize: 'Bleacher' });
  const bleacher = await shotResultWidths(page);
  expect(bleacher.make, `MAKE is ${bleacher.make}px at Bleacher, ${standard.make}px at Standard`).toBeGreaterThanOrEqual(standard.make);
  expect(bleacher.miss, `MISS is ${bleacher.miss}px at Bleacher, ${standard.miss}px at Standard`).toBeGreaterThanOrEqual(standard.miss);
});

test('at Bleacher the switch shows the page in view: Other stats brings its tiles in, and a swipe back shows Shots', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });
  const shots = page.getByRole('button', { name: 'Shots', exact: true });
  const other = page.getByRole('button', { name: 'Other stats', exact: true });
  const oreb = page.getByRole('button', { name: /^OREB \d+$/ });

  await expect(shots).toHaveAttribute('aria-pressed', 'true');
  await expect(other).toHaveAttribute('aria-pressed', 'false');
  await expect(oreb).not.toBeInViewport();

  await other.click();
  await expect(oreb).toBeInViewport();
  await expect(other).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('region', { name: 'Other stats' }).hover();
  await page.mouse.wheel(-400, 0);
  await expect(shots).toHaveAttribute('aria-pressed', 'true');
  await expect(oreb).not.toBeInViewport();
});

test('at Bleacher the toast sits exactly over the Undo button after a tap, and no Period row button is under it', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });
  await page.getByRole('button', { name: /^STL/ }).click();

  await expect(page.getByRole('status')).toBeVisible();
  await expectToastOverUndo(page);
});

// the live screen has one level-one heading, its batting line reads as terms with their values, and the active tab is the current page (#249)
test('the softball live screen has one level-one heading, its batting line reads as terms, and the active tab is the current page', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });

  await expect(page.getByRole('heading', { level: 1 })).toHaveCount(1);
  const batting = page.locator('dl.batting');
  await expect(batting.getByRole('group')).toHaveCount(0);
  await expect(batting.getByRole('term')).toHaveText(['AVG', 'OBP', 'SLG']);
  await expect(batting.getByRole('definition')).toHaveCount(3);

  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
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

// The dock: Undo, the toast, the Period row and the End Game form stay on screen at every phone height and Button Size (#272)
type Box = { x: number; y: number; width: number; height: number };

function overlaps(a: Box, b: Box) {
  return a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;
}

// the dock's Undo button and Period row buttons: a control the page scrolls to must sit clear of every one of them
async function expectClearOfDock(page: Page, control: Locator) {
  const box = await control.boundingBox();
  if (!box) throw new Error('the control is not on screen');
  const dock = [await page.getByRole('button', { name: /^Undo \(last Event\)/ }).boundingBox()];
  for (const button of await page.locator('.period-row button').all()) dock.push(await button.boundingBox());
  for (const other of dock) {
    if (!other) throw new Error('a dock control is not on screen');
    expect(overlaps(box, other), `the control overlaps a dock control: ${JSON.stringify({ box, other, viewport: page.viewportSize() })}`).toBe(false);
  }
}

const phones = [
  { width: 393, height: 759 },
  { width: 390, height: 664 },
  { width: 375, height: 667 },
];
const buttonSizes = ['Compact', 'Standard', 'Bleacher'] as const;

for (const viewport of phones) {
  for (const buttonSize of buttonSizes) {
    test(`at ${buttonSize} on a ${viewport.width}×${viewport.height} phone, Undo and End Game are on screen, and a tap's toast sits over Undo`, async ({ page }) => {
      await page.setViewportSize(viewport);
      await addFirstAthlete(page);
      await startGame(page, buttonSize === 'Standard' ? {} : { buttonSize });
      await expect(page.getByRole('button', { name: /^Undo \(last Event\)/ })).toBeInViewport();
      await expect(page.getByRole('button', { name: 'End Game' })).toBeInViewport();

      await page.getByRole('button', { name: /^STL/ }).click();
      await expect(page.getByRole('status')).toBeInViewport();
      await expectToastOverUndo(page);
    });
  }
}

test('at Standard on a 375×667 phone, scrolled to the end, FOUL is fully on screen and clear of the dock', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await addFirstAthlete(page);
  await startGame(page);
  await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));

  const foul = page.getByRole('button', { name: /^FOUL \d+$/ });
  await expect(foul).toBeInViewport({ ratio: 1 });
  await expectClearOfDock(page, foul);
});

test('at Standard on a 375×667 phone, focusing FOUL from the top scrolls it clear of the dock', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await addFirstAthlete(page);
  await startGame(page);
  await page.evaluate(() => window.scrollTo(0, 0));

  const foul = page.getByRole('button', { name: /^FOUL \d+$/ });
  await foul.focus();
  await expectClearOfDock(page, foul);
});

test('on softball at 375×667 with an Outcome armed, Undo and End Game are on screen', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 667 });
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();

  await expect(page.getByRole('button', { name: /^Undo \(last Event\)/ })).toBeInViewport();
  await expect(page.getByRole('button', { name: 'End Game' })).toBeInViewport();
});

test('at Bleacher on a 393×759 phone, Undo and End Game are on screen on both the Shots and Other stats pages', async ({ page }) => {
  await page.setViewportSize({ width: 393, height: 759 });
  await addFirstAthlete(page);
  await startGame(page, { buttonSize: 'Bleacher' });
  const undo = page.getByRole('button', { name: /^Undo \(last Event\)/ });
  const endButton = page.getByRole('button', { name: 'End Game' });
  await expect(undo).toBeInViewport();
  await expect(endButton).toBeInViewport();

  await page.getByRole('button', { name: 'Other stats', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Other stats' })).toBeInViewport();
  await expect(undo).toBeInViewport();
  await expect(endButton).toBeInViewport();
});
