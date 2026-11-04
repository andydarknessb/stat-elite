import { expect, test, type Page } from '@playwright/test';
import { openApp } from './openApp';

async function addAthlete(page: Page) {
  await openApp(page);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

/** A local calendar date, the given number of days from today (negative is back), as a date input reads it. */
function localDate(daysFromToday: number) {
  const date = new Date();
  date.setDate(date.getDate() + daysFromToday);
  return [date.getFullYear(), String(date.getMonth() + 1).padStart(2, '0'), String(date.getDate()).padStart(2, '0')].join('-');
}

const fitsWidth = (page: Page) => page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);

test('a basketball Game added from Home opens its summary with no Game Complete, and the Games tab lists it under its date', async ({ page }) => {
  const played = localDate(-10);
  await addAthlete(page);
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await expect(page.getByRole('heading', { name: 'Add past Game' })).toBeVisible();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill(played);
  await page.getByLabel('Casey score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByLabel('2PT made').fill('6');
  await page.getByLabel('2PT attempted').fill('10');
  await page.getByLabel('FT made').fill('4');
  await page.getByLabel('FT attempted').fill('4');
  await page.getByLabel('AST', { exact: true }).fill('3');
  expect(await fitsWidth(page)).toBe(true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  // the summary: the Final Score, the line, and Plus/Minus and Playing Share read as dashes
  await expect(page.getByText('Casey 40 – Opponent 32')).toBeVisible();
  await expect(page.getByText('16 PTS · FG 6/10 · FT 4/4')).toBeVisible();
  await expect(page.getByText('Plus/Minus — · Playing Share —')).toBeVisible();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toHaveCount(0);

  // Home still offers Start Game, and the live screen did not open
  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sub In' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  const earlier = page.getByRole('region', { name: 'Earlier' });
  await expect(earlier.getByRole('button', { name: /Lions/ })).toContainText(played);
  await expect(earlier.getByRole('button', { name: /Lions/ })).toContainText('Plus/Minus —');
});

test('a softball Game added, then edited, shows the new batting line, and its Sport stays fixed on edit', async ({ page }) => {
  const played = localDate(-10);
  await addAthlete(page);
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByLabel('Opponent', { exact: true }).fill('Hawks');
  await page.getByLabel('Date', { exact: true }).fill(played);
  await page.getByLabel('Casey score').fill('5');
  await page.getByLabel('Opponent score').fill('3');
  // a double with 1 RBI: one At-Bat, one hit
  await page.getByLabel('2B', { exact: true }).fill('1');
  await page.getByLabel('RBI', { exact: true }).fill('1');
  expect(await fitsWidth(page)).toBe(true);
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Casey 5 – Opponent 3')).toBeVisible();
  await expect(page.getByText('H/AB 1/1 · 1 RBI', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Edit past Game' })).toBeVisible();
  await expect(page.getByLabel('Sport')).toBeDisabled();
  await page.getByLabel('RBI', { exact: true }).fill('2');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('H/AB 1/1 · 2 RBI', { exact: true })).toBeVisible();

  // reopened, the form holds the saved numbers and Sport is still fixed
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.getByLabel('Sport')).toBeDisabled();
  await expect(page.getByLabel('RBI', { exact: true })).toHaveValue('2');
});

test('a 2PT made above 2PT attempted disables Save with an alert, and the date input refuses days after today', async ({ page }) => {
  const today = localDate(0);
  await addAthlete(page);
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill(today);
  await page.getByLabel('Casey score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  const save = page.getByRole('button', { name: 'Save', exact: true });

  await page.getByLabel('2PT made').fill('5');
  await page.getByLabel('2PT attempted').fill('3');
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
  await page.getByLabel('2PT attempted').fill('8');
  await expect(save).toBeEnabled();
  await expect(page.getByRole('alert')).toHaveCount(0);

  // a count that is not a whole number is named, and never saved
  await page.getByLabel('FT made').fill('1.5');
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toContainText('FT made');
  await page.getByLabel('FT made').fill('');

  await expect(page.getByLabel('Date', { exact: true })).toHaveAttribute('max', today);
  await page.getByLabel('Date', { exact: true }).fill(localDate(1));
  await expect(save).toBeDisabled();
  await expect(page.getByRole('alert')).toBeVisible();
});

test('a live Game has no Remove button, and a finished Game recorded here has Remove and no Edit', async ({ page }) => {
  await addAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Opponent/ }).click();
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
});

test('a finished Game recorded here is removed from its summary after confirming, and leaves the Games feed', async ({ page }) => {
  await addAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Opponent/ }).click();
  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText("Remove this Game? It leaves the Games feed and the season line on every phone, and the app can't bring it back.")).toBeVisible();
  await page.getByRole('button', { name: 'Yes, remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('button', { name: /Opponent/ })).toHaveCount(0);
});

test('a Backlogged Game removed from its summary after confirming lands on Home, and leaves the Games feed', async ({ page }) => {
  const played = localDate(-10);
  await addAthlete(page);
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill(played);
  await page.getByLabel('Casey score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Casey 40 – Opponent 32')).toBeVisible();

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await expect(page.getByText("Remove this Game? It leaves the Games feed and the season line on every phone, and the app can't bring it back.")).toBeVisible();
  await page.getByRole('button', { name: 'Yes, remove', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('button', { name: /Lions/ })).toHaveCount(0);
});
