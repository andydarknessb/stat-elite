import { expect, test, type Locator } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

test.use({ viewport: { width: 390, height: 844 } });

// a box on the page; a missing one fails the check with its name, not a null read
const boxOf = async (locator: Locator) => {
  const box = await locator.boundingBox();
  if (!box) throw new Error(`${locator} is not on the screen`);
  return box;
};

test('a Pitch shows the Count in the Pitch row, and the Outcome grid does not move', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  const oneB = page.getByRole('button', { name: '1B', exact: true });
  const before = await boxOf(oneB);

  await page.getByRole('button', { name: 'Ball', exact: true }).click();
  await expect(page.getByText('Count 1-0', { exact: true })).toBeVisible();

  expect(Math.abs((await boxOf(oneB)).y - before.y)).toBeLessThanOrEqual(1);
  const label = await boxOf(page.getByText('Pitch (optional)', { exact: true }));
  const count = await boxOf(page.getByText('Count 1-0', { exact: true }));
  expect(count.y < label.y + label.height && label.y < count.y + count.height).toBe(true);
});

test('the Pitch and Outcome groups read as labelled groups, with the Count absent before a Pitch', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await expect(page.getByText(/^Count /)).toHaveCount(0);

  await expect(page.getByRole('group', { name: 'Pitch', exact: true }).getByText('Pitch (optional)', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Outcome', exact: true }).getByText('Outcome', { exact: true })).toBeVisible();
});

test('the Pitch group and the Outcome label, and the Outcome group and the AVG card, sit 16px apart', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  const pitchGroup = await boxOf(page.getByRole('group', { name: 'Pitch', exact: true }));
  const outcomeGroup = await boxOf(page.getByRole('group', { name: 'Outcome', exact: true }));
  const outcomeLabel = await boxOf(page.getByRole('group', { name: 'Outcome', exact: true }).getByText('Outcome', { exact: true }));
  const avg = await boxOf(page.locator('.batting-card', { has: page.locator('dt', { hasText: 'AVG' }) }));

  expect(outcomeLabel.y - (pitchGroup.y + pitchGroup.height)).toBeGreaterThanOrEqual(16);
  expect(avg.y - (outcomeGroup.y + outcomeGroup.height)).toBeGreaterThanOrEqual(16);
});

test('an Outcome opens RBI? and Cancel over five equal chips on one row, at 390px and 360px; Cancel disarms it', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '2B', exact: true }).click();

  const rbi = page.getByRole('group', { name: 'RBI', exact: true });
  await expect(rbi.getByText('RBI?', { exact: true })).toBeVisible();
  await expect(rbi.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible();
  const outcomeGroup = await boxOf(page.getByRole('group', { name: 'Outcome', exact: true }));
  expect((await boxOf(rbi)).y).toBeGreaterThanOrEqual(outcomeGroup.y + outcomeGroup.height);

  for (const width of [390, 360]) {
    await page.setViewportSize({ width, height: 844 });
    const chips = await Promise.all([0, 1, 2, 3, 4].map((n) => boxOf(rbi.getByRole('button', { name: `${n} RBI`, exact: true }))));
    const tops = chips.map((chip) => chip.y);
    const widths = chips.map((chip) => chip.width);
    expect(Math.max(...tops) - Math.min(...tops)).toBeLessThanOrEqual(1);
    expect(Math.max(...widths) - Math.min(...widths)).toBeLessThanOrEqual(1);
  }

  await rbi.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.getByRole('group', { name: 'RBI', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: '2B', exact: true })).toHaveAttribute('aria-pressed', 'false');
});

for (const buttonSize of [undefined, 'Compact', 'Bleacher'] as const) {
  const height = buttonSize === 'Compact' ? 44 : buttonSize === 'Bleacher' ? 64 : 56;
  test(`1B is ${height}px tall at ${buttonSize ?? 'Standard'}, within 1px`, async ({ page }) => {
    await addFirstAthlete(page);
    await startGame(page, { sport: 'softball', buttonSize });
    const { height: actual } = await boxOf(page.getByRole('button', { name: '1B', exact: true }));
    expect(actual).toBeGreaterThanOrEqual(height - 1);
    if (buttonSize) expect(actual).toBeLessThanOrEqual(height + 1);
  });
}

for (const buttonSize of [undefined, 'Bleacher'] as const) {
  test(`Cancel is at most 44px tall at ${buttonSize ?? 'Standard'}`, async ({ page }) => {
    await addFirstAthlete(page);
    await startGame(page, { sport: 'softball', buttonSize });
    await page.getByRole('button', { name: '2B', exact: true }).click();
    const cancel = await boxOf(page.getByRole('group', { name: 'RBI', exact: true }).getByRole('button', { name: 'Cancel', exact: true }));
    expect(cancel.height).toBeLessThanOrEqual(44 + 1);
  });
}

test('the batting line leaves the screen while the RBI or Base group is up, and comes back after Out', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page, { sport: 'softball' });
  const batting = page.locator('dl.batting');

  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(batting).toBeHidden();
  await expect(batting).toHaveCount(1);

  await page.getByRole('button', { name: '2 RBI', exact: true }).click();
  await expect(batting).toBeVisible();

  await page.getByRole('button', { name: '1B', exact: true }).click();
  await page.getByRole('button', { name: '0 RBI', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Base', exact: true })).toBeVisible();
  await expect(batting).toBeHidden();

  await page.getByRole('button', { name: 'Out', exact: true }).click();
  await expect(page.getByRole('group', { name: 'Base', exact: true })).toHaveCount(0);
  await expect(batting).toBeVisible();
});

test('basketball keeps Next period on the Period button, its toast and Undo', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: 'Next period', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('Next period');
  await expect(page.getByRole('button', { name: 'Undo (last Event): Next period', exact: true })).toBeVisible();
});

for (const sport of ['softball', 'baseball'] as const) {
  test(`${sport}: the Period button, its toast and Undo say Next inning`, async ({ page }) => {
    await addFirstAthlete(page);
    await startGame(page, { sport });
    await page.getByRole('button', { name: 'Next inning', exact: true }).click();
    await expect(page.getByRole('status')).toContainText('Next inning');
    await expect(page.getByRole('button', { name: 'Undo (last Event): Next inning', exact: true })).toBeVisible();
    await page.getByRole('button', { name: 'Undo (last Event): Next inning', exact: true }).click();
    await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
  });
}
