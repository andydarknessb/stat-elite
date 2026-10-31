import { expect, test, type Locator, type Page } from '@playwright/test';

async function startGame(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

// The toast runs 3 seconds from the last tap. Count from the tap, not from when the page has re-read,
// so the checks hold whatever the re-render costs.
async function expectToastRunsFromTap(page: Page, toast: Locator, tappedAt: number) {
  await page.waitForTimeout(Math.max(0, tappedAt + 2500 - Date.now()));
  await expect(toast).toBeVisible({ timeout: 250 });
  await expect(toast).toBeHidden({ timeout: Math.max(1, tappedAt + 4000 - Date.now()) });
}

test('a tap shows a toast naming it, and Undo from the toast steps the count back', async ({ page }) => {
  await startGame(page);
  const steal = page.getByRole('button', { name: /^STL/ });
  const toast = page.getByRole('status');
  const undoLast = page.getByRole('button', { name: 'Undo (last Event)' });

  await expect(undoLast).toBeDisabled();
  await steal.click();

  await expect(steal).toHaveText('STL 1');
  await expect(toast).toContainText('STL');
  await expect(undoLast).toHaveAccessibleName('Undo (last Event): STL');

  await toast.getByRole('button', { name: 'Undo' }).click();

  await expect(steal).toHaveText('STL 0');
  await expect(toast).toBeHidden();
  await expect(undoLast).toBeDisabled();
});

test('a single tap keeps the toast up for 3 seconds, then clears it', async ({ page }) => {
  await startGame(page);
  const steal = page.getByRole('button', { name: /^STL/ });

  await steal.click();
  const tappedAt = Date.now();

  await expectToastRunsFromTap(page, page.getByRole('status'), tappedAt);
});

test('a repeated tap on the same tile restarts the 3 seconds', async ({ page }) => {
  await startGame(page);
  const steal = page.getByRole('button', { name: /^STL/ });

  await steal.click();
  await page.waitForTimeout(2000);
  await steal.click();
  const lastTap = Date.now();

  await expectToastRunsFromTap(page, page.getByRole('status'), lastTap);
  await expect(steal).toHaveText('STL 2');
});

test('a repeated Team +1 restarts the 3 seconds', async ({ page }) => {
  await startGame(page);
  const teamUp = page.getByRole('button', { name: 'Team +1' });

  await teamUp.click();
  await page.waitForTimeout(2000);
  await teamUp.click();
  const lastTap = Date.now();

  await expectToastRunsFromTap(page, page.getByRole('status'), lastTap);
});
