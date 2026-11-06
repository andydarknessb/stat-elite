import { expect, test } from '@playwright/test';
import { addFirstAthlete, endGame, startGame, tapCourt } from './recorder';

test('ending a Game opens Game Complete with the Final Score, the line and Plus/Minus, and Copy text copies the summary', async ({ page, browserName }) => {
  // Playwright grants clipboard permissions on Chromium only, so the copy is checked there
  if (browserName === 'chromium') await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await addFirstAthlete(page);
  await startGame(page);

  // on court for a made 2 at the basket, a made Free Throw, an offensive rebound and an assist
  await page.getByRole('button', { name: 'Sub In' }).click();
  await tapCourt(page, 50, 11);
  await page.getByRole('group', { name: 'Shot result' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('group', { name: 'Free Throw' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('button', { name: /^OREB \d+$/ }).click();
  await page.getByRole('button', { name: /^AST \d+$/ }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'Save Final Score', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Casey 3 – Opponent 0')).toBeVisible();
  await expect(page.getByText('3 PTS · FG 1/1 · FT 1/1 · 1 REB · 1 AST')).toBeVisible();
  await expect(page.getByText('Plus/Minus +3', { exact: true })).toBeVisible();
  await expect(page.getByRole('img', { name: 'Won' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share card' })).toHaveCSS('background-color', 'rgb(245, 184, 65)');
  await expect(page.getByRole('button', { name: 'Done' })).not.toHaveCSS('background-color', 'rgb(245, 184, 65)');
  await expect(page.locator('button.primary')).toHaveCount(1);

  if (browserName === 'chromium') {
    await page.getByRole('button', { name: 'Copy text' }).click();
    await expect(page.getByRole('status')).toHaveText('Copied');
    // Windows clipboards hold CRLF, so the line breaks are compared as LF
    const pasted = (await page.evaluate(() => navigator.clipboard.readText())).replace(/\r\n/g, '\n');
    expect(pasted).toBe(
      ['Casey vs Opponent: 3–0 final', 'Casey: 3 PTS · FG 1/1 · FT 1/1 · 1 REB · 1 AST · Plus/Minus +3', '#basketball'].join('\n'),
    );
  }

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('Undo End Game on Game Complete reopens the Game on the live screen, and End Game closes it with the corrected Final Score', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, { teamLabel: 'Casey', teamScore: '52', opponentScore: '48' });

  await page.getByRole('button', { name: 'Undo End Game' }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, { teamLabel: 'Casey', teamScore: '52', opponentScore: '46' });
  await expect(page.getByText('Casey 52 – Opponent 46')).toBeVisible();
});
