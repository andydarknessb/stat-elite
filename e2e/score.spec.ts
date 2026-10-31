import { expect, test } from '@playwright/test';

test('a Recorder adjusts the strip, reloads and still sees the score, then ends the Game with a Final Score', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  await page.getByRole('button', { name: 'Team +1' }).click();
  await page.getByRole('button', { name: 'Team +1' }).click();
  await page.getByRole('button', { name: 'Opponent +1' }).click();
  await expect(page.getByRole('group', { name: 'Team' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Opponent' }).getByText('1', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Team' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Opponent' }).getByText('1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Team final').fill('');
  await expect(page.getByRole('button', { name: 'End Game' })).toBeDisabled();
  await page.getByLabel('Team final').fill('9');
  await page.getByLabel('Opponent final').fill('7');
  await page.getByRole('button', { name: 'End Game' }).click();

  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Team 9 – Opponent 7')).toBeVisible();
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Team +1' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});
