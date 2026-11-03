import { expect, test } from '@playwright/test';
import { openApp } from './openApp';

test('a Recorder adjusts the strip, reloads and still sees the score, then ends the Game with a Final Score', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await page.getByRole('button', { name: 'Casey +1' }).click();
  await page.getByRole('button', { name: 'Casey +1' }).click();
  await page.getByRole('button', { name: 'Opponent +1' }).click();
  await expect(page.getByRole('group', { name: 'Casey' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Opponent' }).getByText('1', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Casey' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Opponent' }).getByText('1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Casey final').fill('');
  await expect(page.getByRole('button', { name: 'End Game' })).toBeDisabled();
  await page.getByLabel('Casey final').fill('9');
  await page.getByLabel('Opponent final').fill('7');
  await page.getByRole('button', { name: 'End Game' }).click();

  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Casey 9 – Opponent 7')).toBeVisible();
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Casey +1' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('End Game opens the Finish game form inline, and Keep playing closes it with the Game still live', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  await page.getByRole('button', { name: 'End Game' }).click();
  await expect(page.getByText('Finish game?')).toBeVisible();
  const title = page.getByRole('heading', { name: 'Finish game?' });
  await expect(title).toHaveCSS('font-size', '22px');
  await expect(title).toHaveCSS('font-family', /Barlow Condensed/);
  await expect(title).toHaveCSS('margin-top', '0px');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByText('Finish game?')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();

  await page.getByRole('button', { name: 'Casey +1' }).click();
  await expect(page.getByRole('group', { name: 'Casey' }).getByText('1', { exact: true })).toBeVisible();
});
