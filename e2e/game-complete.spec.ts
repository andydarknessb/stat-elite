import { expect, test } from '@playwright/test';

test.use({ permissions: ['clipboard-read', 'clipboard-write'] });

test('ending a Game opens Game Complete with the Final Score, the line and Plus/Minus, and Copy text copies the summary', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
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

  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Team 3 – Opponent 0')).toBeVisible();
  await expect(page.getByText('3 PTS · FG 1/1 · FT 1/1 · 1 REB · 1 AST')).toBeVisible();
  await expect(page.getByText('Plus/Minus +3', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Copy text' }).click();
  await expect(page.getByRole('button', { name: 'Copied' })).toBeVisible();
  // Windows clipboards hold CRLF, so the line breaks are compared as LF
  const pasted = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
  expect(pasted).toBe(
    ['Casey vs Opponent: 3–0 final', 'Casey: 3 PTS · FG 1/1 · FT 1/1 · 1 REB · 1 AST · Plus/Minus +3', '#basketball'].join('\n'),
  );
});
