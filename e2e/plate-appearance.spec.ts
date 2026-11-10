import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

// the batting line is three stat cards, AVG, OBP and SLG: each holds its stat as a term, its value under it (#249)
const battingCard = (page: Page, stat: 'AVG' | 'OBP' | 'SLG') => page.locator('.batting-card', { has: page.locator('dt', { hasText: stat }) });

test('an Outcome, then its RBI chip, records a Plate Appearance; Undo takes it back; Next inning moves to the next inning', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
  await expect(battingCard(page, 'AVG')).toContainText('—');

  await page.getByRole('button', { name: '2B', exact: true }).click();
  // the RBI row is the tallest state of the screen: it must still fit the phone without scrolling
  const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
  expect(overflow).toBeLessThanOrEqual(0);
  await page.getByRole('button', { name: '2 RBI' }).click();

  await expect(battingCard(page, 'AVG')).toContainText('1.000');
  await expect(battingCard(page, 'OBP')).toContainText('1.000');
  await expect(battingCard(page, 'SLG')).toContainText('2.000');

  await page.getByRole('button', { name: 'Undo (last Event): 2B' }).click();
  await expect(battingCard(page, 'AVG')).toContainText('—');

  await page.getByRole('button', { name: 'Next inning' }).click();
  await expect(page.getByText('Inn 2', { exact: true })).toBeVisible();
});

test('Pitches show a count once one is logged; a strikeout is marked by the last strike Pitch; the count resets after the Outcome', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
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
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
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
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI' }).click();
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();

  await page.getByRole('button', { name: 'Undo (last Event): 2B' }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toHaveCount(0);
  await expect(battingCard(page, 'AVG')).toContainText('—');
});

test('the armed Outcome is aria-pressed true; the other Outcomes are aria-pressed false', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  const outcomes = page.getByRole('group', { name: 'Outcome' });
  await outcomes.getByRole('button', { name: '2B', exact: true }).click();

  await expect(outcomes.getByRole('button', { name: '2B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  const total = await outcomes.getByRole('button').count();
  await expect(outcomes.locator('button[aria-pressed="false"]')).toHaveCount(total - 1);
});

test('on Bleacher the Pitch, Outcome and RBI buttons are at least 64px tall, and the RBI row still fits the phone', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball', buttonSize: 'Bleacher' });
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
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball', buttonSize: 'Compact' });
  const box = await page.getByRole('button', { name: '2B', exact: true }).boundingBox();
  expect(box?.height).toBe(44);
});

test('Next inning disarms an Outcome: its RBI chips go down, and the next inning opens', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toBeVisible();

  await page.getByRole('button', { name: 'Next inning' }).click();
  await expect(page.getByRole('group', { name: 'RBI' })).toHaveCount(0);
  await expect(page.getByText('Inn 2', { exact: true })).toBeVisible();
});

test('Next inning takes the Athlete off base: the Base group goes, and Undo brings it back', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '1B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Base', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Next inning' }).click();
  await expect(page.getByRole('group', { name: 'Base', exact: true })).toHaveCount(0);

  await page.getByRole('button', { name: 'Undo (last Event): Next inning' }).click();
  await expect(page.getByRole('group', { name: 'Base', exact: true })).toBeVisible();
});

// the armed Outcome is gold with ink text on either phone setting: the tokens hold under dark as well as light
for (const colorScheme of ['dark', 'light'] as const) {
  test(`an armed Outcome is gold with ink text on either phone setting, ${colorScheme}`, async ({ page }) => {
    await page.emulateMedia({ colorScheme });
    await addFirstAthlete(page);
    await startGame(page, { sport: 'softball' });
    const armed = page.getByRole('group', { name: 'Outcome' }).getByRole('button', { name: '2B', exact: true });
    await armed.click();
    await expect(armed).toHaveAttribute('aria-pressed', 'true');
    const style = await armed.evaluate((el) => {
      const s = getComputedStyle(el);
      return { background: s.backgroundColor, color: s.color };
    });
    expect(style).toEqual({ background: 'rgb(245, 184, 65)', color: 'rgb(11, 16, 32)' });
  });
}
