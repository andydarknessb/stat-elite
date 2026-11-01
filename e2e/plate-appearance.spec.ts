import { expect, test, type Page } from '@playwright/test';

async function startSoftballGame(page: Page, size?: 'Compact' | 'Bleacher') {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  if (size) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('group', { name: 'Button Size' }).getByRole('button', { name: size, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

test('an Outcome, then its RBI chip, records a Plate Appearance; Undo takes it back; Next period moves to the next inning', async ({ page }) => {
  await startSoftballGame(page);
  await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
  await expect(page.getByText('AVG —')).toBeVisible();

  await page.getByRole('button', { name: '2B', exact: true }).click();
  // the RBI row is the tallest state of the screen: it must still fit the phone without scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '2 RBI' }).click();

  await expect(page.getByText('AVG 1.000 · OBP 1.000 · SLG 2.000')).toBeVisible();

  await page.getByRole('button', { name: 'Undo (last Event): 2B' }).click();
  await expect(page.getByText('AVG —')).toBeVisible();

  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByText('Inn 2', { exact: true })).toBeVisible();
});

test('Pitches show a count once one is logged; a strikeout is marked by the last strike Pitch; the count resets after the Outcome', async ({ page }) => {
  await startSoftballGame(page);
  await expect(page.getByText(/^Count /)).toHaveCount(0);

  await page.getByRole('button', { name: 'Ball', exact: true }).click();
  await page.getByRole('button', { name: 'Called strike', exact: true }).click();
  await expect(page.getByText('Count 1-1', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo (last Event): Called strike' })).toBeVisible();

  await page.getByRole('button', { name: 'Strikeout', exact: true }).click();
  // the RBI row sits under the Pitch row and the count: the tallest state must still fit without scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '0 RBI' }).click();

  await expect(page.getByText(/^Count /)).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Undo (last Event): Strikeout looking' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo (last Event): Strikeout looking' }).click();
  await expect(page.getByText('Count 1-1', { exact: true })).toBeVisible();
});

test('a reach puts the Athlete on the diamond; Stole marks the next base move, and Out takes them off', async ({ page }) => {
  await startSoftballGame(page);
  await page.getByRole('button', { name: '1B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI' }).click();

  await expect(page.getByRole('img', { name: 'On first' })).toBeVisible();
  // the diamond joins the live screen after a reach: it must still fit the phone without scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(0);

  await page.getByRole('button', { name: 'Stole', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Stole', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: '2nd', exact: true }).click();

  await expect(page.getByRole('img', { name: 'On second' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Undo (last Event): 2nd (Stole)' })).toBeVisible();

  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect(page.getByRole('img', { name: /^On / })).toHaveCount(0);
});

test('Undo disarms an Outcome: its RBI chips go down, and the Plate Appearance it armed is retracted', async ({ page }) => {
  await startSoftballGame(page);
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI' }).click();
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo (last Event): 2B' }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toHaveCount(0);
  await expect(page.getByText('AVG —')).toBeVisible();
});

test('the armed Outcome is aria-pressed true; the other Outcomes are aria-pressed false', async ({ page }) => {
  await startSoftballGame(page);
  const outcomes = page.getByRole('group', { name: 'Outcome' });
  await outcomes.getByRole('button', { name: '2B', exact: true }).click();

  await expect(outcomes.getByRole('button', { name: '2B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const total = await outcomes.getByRole('button').count();
  await expect(outcomes.locator('button[aria-pressed="false"]')).toHaveCount(total - 1);
});

test('on Bleacher the Pitch, Outcome and RBI buttons are at least 64px tall, and the RBI row still fits the phone', async ({ page }) => {
  await startSoftballGame(page, 'Bleacher');
  const height = async (name: string) => (await page.getByRole('button', { name, exact: true }).boundingBox())?.height;
  await expect(page.getByRole('button', { name: 'Ball', exact: true })).toBeVisible();
  expect(await height('Ball')).toBeGreaterThanOrEqual(64);
  expect(await height('2B')).toBeGreaterThanOrEqual(64);

  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('button', { name: '0 RBI', exact: true })).toBeVisible();
  expect(await height('0 RBI')).toBeGreaterThanOrEqual(64);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
});

test('on Compact the 2B button is 44px tall', async ({ page }) => {
  await startSoftballGame(page, 'Compact');
  const box = await page.getByRole('button', { name: '2B', exact: true }).boundingBox();
  expect(box?.height).toBe(44);
});

test('Next period disarms an Outcome: its RBI chips go down, and the next inning opens', async ({ page }) => {
  await startSoftballGame(page);
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();

  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toHaveCount(0);
  await expect(page.getByText('Inn 2', { exact: true })).toBeVisible();
});
