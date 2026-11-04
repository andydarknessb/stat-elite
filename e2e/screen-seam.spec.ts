import { expect, test } from '@playwright/test';
import { addFirstAthlete, endGame, recordBasketballGame, startGame } from './recorder';

/** A local calendar date, the given number of days from today (negative is back), as a date input reads it. */
function localDate(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

// Makes every read of the phone's store throw, as a refused IndexedDB read does; writes still work.
// It runs in the page, so it is passed to evaluate or addInitScript.
function refuseReads() {
  const refuse = () => {
    throw new DOMException('the store refused the read', 'UnknownError');
  };
  for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
    proto.get = refuse;
    proto.getAll = refuse;
    proto.count = refuse;
    proto.openCursor = refuse;
  }
}

test('Remove in one tab: the other tab on the same summary leaves it, and the Game leaves its feed', async ({ page }) => {
  await addFirstAthlete(page);
  await recordBasketballGame(page);
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Opponent/ }).click();
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();

  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await other.getByRole('button', { name: 'Games', exact: true }).click();
  await other.getByRole('button', { name: /Opponent/ }).click();
  await expect(other.getByRole('heading', { name: 'Opponent' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();

  await expect(other.getByRole('heading', { name: 'Opponent' })).toHaveCount(0);
  await expect(other.getByText('No finished Games yet.')).toBeVisible();
});

test('Edit past Game open in one tab, Remove in the other: the form closes', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill(localDate(-10));
  await page.getByLabel('Casey score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Lions' })).toBeVisible();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit past Game' })).toBeVisible();

  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await other.getByRole('button', { name: 'Games', exact: true }).click();
  await other.getByRole('button', { name: /Lions/ }).click();
  await other.getByRole('button', { name: 'Remove', exact: true }).click();
  await other.getByRole('button', { name: 'Yes, remove' }).click();

  await expect(page.getByRole('heading', { name: 'Edit past Game' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('Game Complete in one tab, Remove in the other: that tab goes Home', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);

  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await other.getByRole('button', { name: 'Games', exact: true }).click();
  await other.getByRole('button', { name: /Opponent/ }).click();
  await other.getByRole('button', { name: 'Remove', exact: true }).click();
  await other.getByRole('button', { name: 'Yes, remove' }).click();

  await expect(page.getByRole('region', { name: 'Game Complete' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('a read that fails before anything is on screen shows the alert and Reload', async ({ page }) => {
  await addFirstAthlete(page);
  await page.addInitScript(refuseReads);
  await page.reload();

  await expect(page.getByRole('alert')).toHaveText("Could not read this phone's data.");
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
});

test('a read that fails with a Game on screen keeps the score strip and shows no alert', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.evaluate(refuseReads);
  // the live screen re-reads each second, so a second has to pass for a read to fail on screen
  await page.waitForTimeout(1500);

  await expect(page.locator('.strip')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});
