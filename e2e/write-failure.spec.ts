import { expect, test, type Page } from '@playwright/test';

const NOT_SAVED = 'Not saved. Try again.';

// Makes every write to the phone's store fail, as a refused IndexedDB write does; reads still work.
// The real add and put stay on window so restoreWrites can put them back.
async function failWrites(page: Page) {
  await page.evaluate(() => {
    const refuse = () => {
      throw new DOMException('the store refused the write', 'UnknownError');
    };
    const kept = window as unknown as { realAdd: typeof IDBObjectStore.prototype.add; realPut: typeof IDBObjectStore.prototype.put };
    kept.realAdd = IDBObjectStore.prototype.add;
    kept.realPut = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.add = refuse;
    IDBObjectStore.prototype.put = refuse;
  });
}

// Puts the real add and put back, so a retry lands.
async function restoreWrites(page: Page) {
  await page.evaluate(() => {
    const kept = window as unknown as { realAdd: typeof IDBObjectStore.prototype.add; realPut: typeof IDBObjectStore.prototype.put };
    IDBObjectStore.prototype.add = kept.realAdd;
    IDBObjectStore.prototype.put = kept.realPut;
  });
}

// An uncaught rejection surfaces as a pageerror: a refused write has to be caught, not dropped.
function collectPageErrors(page: Page): Error[] {
  const errors: Error[] = [];
  page.on('pageerror', (error) => errors.push(error));
  return errors;
}

async function expectNotSaved(page: Page) {
  const alert = page.getByRole('alert');
  await expect(alert).toHaveCount(1);
  await expect(alert).toHaveText(NOT_SAVED);
  // a count and a text check pass for a line below the fold, which the Recorder cannot see
  await expect(alert).toBeInViewport({ ratio: 1 });
}

async function caseyFirstRun(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
}

async function startGame(page: Page) {
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: /^STL/ })).toBeVisible();
}

async function startSoftballGame(page: Page) {
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
}

/** Taps the half court at a spot, given as 0–100 on each axis. */
async function tapCourt(page: Page, x: number, y: number) {
  const court = page.getByRole('img', { name: 'Half court' });
  const box = await court.boundingBox();
  if (!box) throw new Error('the half court is not on screen');
  await court.click({ position: { x: (box.width * x) / 100, y: (box.height * y) / 100 } });
}

const shotResult = (page: Page) => page.getByRole('group', { name: 'Shot result' });
const freeThrow = (page: Page) => page.getByRole('group', { name: 'Free Throw' });

test('Add Athlete from Home: a refused save keeps the form open with the name typed', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByLabel('Athlete name').fill('Sam');
  await failWrites(page);

  await page.getByRole('button', { name: 'Add Athlete' }).click();

  await expectNotSaved(page);
  await expect(page.getByLabel('Athlete name')).toHaveValue('Sam');
  expect(errors).toEqual([]);
});

test('Edit Athlete with the name Sam: a refused save keeps the form open with Sam in it', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Athlete name').fill('Sam');
  await failWrites(page);

  await page.getByRole('button', { name: 'Save' }).click();

  await expectNotSaved(page);
  await expect(page.getByLabel('Athlete name')).toHaveValue('Sam');
  expect(errors).toEqual([]);
});

test('the Athlete switch: a refused save leaves the Athlete shown before the tap', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByLabel('Athlete name').fill('Sam');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible();
  await failWrites(page);

  await page.getByRole('button', { name: 'Switch to Casey' }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible();
  expect(errors).toEqual([]);
});

test("Game setup's Start: a refused save enables Start again", async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await failWrites(page);

  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeEnabled();
  expect(errors).toEqual([]);
});

test('the STL tile: a refused save leaves STL at 0 and shows no toast', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await failWrites(page);

  await page.getByRole('button', { name: /^STL/ }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveText('STL 0');
  await expect(page.getByRole('status')).toBeHidden();
  expect(errors).toEqual([]);
});

test("the strip's Team +1: a refused save leaves Team at 0 and shows no toast", async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await failWrites(page);

  await page.getByRole('button', { name: 'Team +1' }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('group', { name: 'Team', exact: true }).locator('.count')).toHaveText('0');
  await expect(page.getByRole('status')).toBeHidden();
  expect(errors).toEqual([]);
});

test('Undo: a refused save leaves STL at 1', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await page.getByRole('button', { name: /^STL/ }).click();
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveText('STL 1');
  await failWrites(page);

  await page.getByRole('button', { name: 'Undo (last Event)' }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveText('STL 1');
  expect(errors).toEqual([]);
});

test('End Game: a refused save leaves the Game live with its STL tile shown', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await failWrites(page);

  await page.getByRole('button', { name: 'End Game' }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('button', { name: /^STL/ })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Button Size: a refused save leaves Compact unpicked, and a retry that lands picks it', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const compact = page.getByRole('group', { name: 'Button Size' }).getByRole('button', { name: 'Compact', exact: true });
  await failWrites(page);

  await compact.click();

  await expectNotSaved(page);
  await expect(compact).toHaveAttribute('aria-pressed', 'false');
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await compact.click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(compact).toHaveAttribute('aria-pressed', 'true');
  expect(errors).toEqual([]);
});

test('Shot: a refused MAKE keeps the spot armed, and a retry that lands records the Shot', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await tapCourt(page, 50, 40);
  await failWrites(page);

  await shotResult(page).getByRole('button', { name: 'MAKE' }).click();

  await expectNotSaved(page);
  await expect(page.getByText('2PT 0/0 · 3PT 0/0 · 0 pts')).toBeVisible();
  await expect(shotResult(page).getByRole('button', { name: 'MAKE' })).toBeEnabled();
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await shotResult(page).getByRole('button', { name: 'MAKE' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('2PT 1/1 · 3PT 0/0 · 2 pts')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Free Throw: a refused MAKE shows no toast and no count, and a retry that lands counts it', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await failWrites(page);

  await freeThrow(page).getByRole('button', { name: 'MAKE' }).click();

  await expectNotSaved(page);
  await expect(page.locator('.free-throws .count')).toHaveText('0/0');
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await freeThrow(page).getByRole('button', { name: 'MAKE' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.free-throws .count')).toHaveText('1/1');
  expect(errors).toEqual([]);
});

test('Pitch: a refused Ball shows no count and no toast, and a retry that lands starts the count', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startSoftballGame(page);
  await failWrites(page);

  await page.getByRole('button', { name: 'Ball', exact: true }).click();

  await expectNotSaved(page);
  await expect(page.getByText(/^Count /)).toHaveCount(0);
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await page.getByRole('button', { name: 'Ball', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Count 1-0', { exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Plate Appearance: a refused RBI keeps the Outcome armed with no toast, and a retry that lands shows the batting line', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startSoftballGame(page);
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await failWrites(page);

  await page.getByRole('button', { name: '2 RBI' }).click();

  await expectNotSaved(page);
  await expect(page.getByText('AVG —')).toBeVisible();
  await expect(page.getByRole('button', { name: '2 RBI' })).toBeVisible();
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await page.getByRole('button', { name: '2 RBI' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('AVG 1.000')).toBeVisible();
  expect(errors).toEqual([]);
});

test('Baserunning: a refused move keeps Stole armed with no toast, and a retry that lands moves the runner', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startSoftballGame(page);
  await page.getByRole('button', { name: '1B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI' }).click();
  await expect(page.getByRole('img', { name: 'On first' })).toBeVisible();
  await page.getByRole('button', { name: 'Stole', exact: true }).click();
  await failWrites(page);

  await page.getByRole('button', { name: '2nd', exact: true }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('img', { name: 'On first' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stole', exact: true })).toHaveAttribute('aria-pressed', 'true');
  // the 1B toast may still be up, so this filters by the move's text
  await expect(page.getByRole('status').filter({ hasText: '2nd' })).toHaveCount(0);

  await restoreWrites(page);
  await page.getByRole('button', { name: '2nd', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('img', { name: 'On second' })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Sub In: a refused sub shows no toast and no pulse, and a retry that lands shows Sub Out', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await failWrites(page);

  await page.getByRole('button', { name: 'Sub In', exact: true }).click();

  await expectNotSaved(page);
  await expect(page.getByRole('button', { name: 'Sub In', exact: true })).toBeVisible();
  await expect(page.getByText('On bench', { exact: true })).toBeVisible();
  await expect(page.locator('.strip')).not.toHaveClass(/pulse/);
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await page.getByRole('button', { name: 'Sub In', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Sub Out', exact: true })).toBeVisible();
  expect(errors).toEqual([]);
});

test('Next period: a refused period keeps the Outcome armed and the inning, and a retry that lands moves on', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startSoftballGame(page);
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await failWrites(page);

  await page.getByRole('button', { name: 'Next period' }).click();

  await expectNotSaved(page);
  await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 RBI' })).toBeVisible();
  await expect(page.getByRole('status')).toBeHidden();

  await restoreWrites(page);
  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.getByText('Inn 2', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: '2 RBI' })).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('a refused STL tile, then a Free Throw that lands: the alert clears', async ({ page }) => {
  const errors = collectPageErrors(page);
  await caseyFirstRun(page);
  await startGame(page);
  await failWrites(page);
  await page.getByRole('button', { name: /^STL/ }).click();
  await expectNotSaved(page);

  await restoreWrites(page);
  await freeThrow(page).getByRole('button', { name: 'MAKE' }).click();

  await expect(page.getByRole('alert')).toHaveCount(0);
  await expect(page.locator('.free-throws .count')).toHaveText('1/1');
  expect(errors).toEqual([]);
});
