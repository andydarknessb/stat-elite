import { expect, test, type Page } from '@playwright/test';

const NOT_SAVED = 'Not saved. Try again.';

// Makes every write to the phone's store fail, as a refused IndexedDB write does; reads still work.
async function failWrites(page: Page) {
  await page.evaluate(() => {
    const refuse = () => {
      throw new DOMException('the store refused the write', 'UnknownError');
    };
    IDBObjectStore.prototype.add = refuse;
    IDBObjectStore.prototype.put = refuse;
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
