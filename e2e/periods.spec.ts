import { expect, test } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

test('Next period moves the Period on, and Undo takes it back', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await expect(page.getByText('Q1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByText('Q2', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Undo (last Event): Next period' }).click();
  await expect(page.getByText('Q1', { exact: true })).toBeVisible();
});

test('halves run H1 and H2, then overtime as OT1', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { periodFormat: 'Halves' });
  await expect(page.getByText('H1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Next period' }).click();
  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByText('OT1', { exact: true })).toBeVisible();
});

test('8 Periods run P1 to P8, then overtime as OT1', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { periodFormat: '8 Periods' });
  await expect(page.getByText('P1', { exact: true })).toBeVisible();

  for (let period = 2; period <= 8; period++) {
    await page.getByRole('button', { name: 'Next period', exact: true }).click();
    await expect(page.getByText(`P${period}`, { exact: true })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByText('OT1', { exact: true })).toBeVisible();
});
