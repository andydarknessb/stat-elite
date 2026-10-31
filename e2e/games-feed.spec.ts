import { expect, test, type Page } from '@playwright/test';

async function addAthlete(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

test('Home shows the season line, and the Games tab lists the finished Game, whose row opens its summary', async ({ page }) => {
  await addAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();

  // on court for a made 2 at the basket, a made Free Throw, an offensive rebound and an assist
  await page.getByRole('button', { name: 'Sub In' }).click();
  const court = await page.getByRole('img', { name: 'Half court' }).boundingBox();
  await page.mouse.click(court!.x + court!.width / 2, court!.y + court!.height * 0.11);
  await page.getByRole('group', { name: 'Shot result' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('group', { name: 'Free Throw' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('button', { name: /^OREB \d+$/ }).click();
  await page.getByRole('button', { name: /^AST \d+$/ }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // the Shift ran from 0–0 to 3–0 on the strip, so Plus/Minus is +3
  await expect(page.getByText('Season: 3 PTS · FG 1/1 · FT 1/1 · 1 REB · 1 AST · Plus/Minus +3')).toBeVisible();

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
  await page.getByRole('button', { name: /Opponent/ }).click();
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
  await expect(page.getByText('Team 3 – Opponent 0')).toBeVisible();
  await expect(page.getByText('Plus/Minus +3 · Playing Share')).toBeVisible();

  await page.getByRole('button', { name: 'Back' }).click();
  await expect(page.getByRole('heading', { name: 'Today' })).toBeVisible();
});
