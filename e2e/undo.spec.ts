import { expect, test } from '@playwright/test';

async function startGame(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
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

test('the toast clears after 3 seconds and never blocks a tap on the tile', async ({ page }) => {
  await startGame(page);
  const steal = page.getByRole('button', { name: /^STL/ });
  const toast = page.getByRole('status');

  await steal.click();
  await expect(toast).toBeVisible();
  await steal.click();

  await expect(steal).toHaveText('STL 2');
  await expect(toast).toBeHidden({ timeout: 5000 });
  await expect(steal).toHaveText('STL 2');
});
