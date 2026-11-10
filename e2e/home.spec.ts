import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp } from './openApp';
import { addAthlete, addFirstAthlete, recordBasketballGame, recordSoftballGame, startGame } from './recorder';

/** No button on the screen computes the primary gold. */
async function expectNoGoldButton(page: Page) {
  const buttons = await page.getByRole('button').all();
  expect(buttons.length).toBeGreaterThan(0);
  for (const button of buttons) {
    await expect(button).not.toHaveCSS('background-color', 'rgb(245, 184, 65)');
  }
}

/** One headline number on the season card, by its label. */
const statOf = (season: Locator, label: string) => season.locator('dl > div', { hasText: label });

test('Home shows the basketball season card and the Game as a Won row with its Final Score', async ({ page }) => {
  await addFirstAthlete(page);
  await recordBasketballGame(page);

  const season = page.getByRole('region', { name: 'Season' });
  await expect(season).toContainText('1 Game');
  await expect(statOf(season, 'Points')).toContainText('3');
  await expect(statOf(season, 'Rebounds')).toContainText('1');
  await expect(statOf(season, 'Plus/Minus')).toContainText('+3');

  const row = page.getByRole('region', { name: 'Recent Games' }).getByRole('button').first();
  await expect(row.getByRole('img', { name: 'Won' })).toBeVisible();
  await expect(row).toContainText('3–0');
});

test('Home\'s season chips switch the season card to softball, which shows its batting rates', async ({ page }) => {
  await addFirstAthlete(page);
  await recordBasketballGame(page);
  await recordSoftballGame(page);

  const season = page.getByRole('region', { name: 'Season' });
  await expect(season.getByRole('button', { name: 'Basketball' })).toHaveAttribute('aria-pressed', 'true');
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'false');

  await season.getByRole('button', { name: 'Softball' }).click();
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'true');
  await expect(statOf(season, 'AVG')).toContainText('1.000');
  await expect(statOf(season, 'OBP')).toContainText('1.000');
  await expect(statOf(season, 'SLG')).toContainText('2.000');
});

test('switching Athlete opens the season card on its first sport, not the one chosen for the last Athlete', async ({ page }) => {
  await addFirstAthlete(page);
  await recordBasketballGame(page);
  await recordSoftballGame(page);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByLabel('Athlete name').fill('Sam');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await recordBasketballGame(page);
  await recordSoftballGame(page, 'Sam');

  const season = page.getByRole('region', { name: 'Season' });
  await season.getByRole('button', { name: 'Softball' }).click();
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'true');

  await page.getByRole('button', { name: 'Switch to Casey' }).click();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
  await expect(season.getByRole('button', { name: 'Basketball' })).toHaveAttribute('aria-pressed', 'true');
  await expect(season.getByRole('button', { name: 'Softball' })).toHaveAttribute('aria-pressed', 'false');
});

test('an Invite stays with its Athlete: after a switch, the link made under Sam is gone and Casey offers its own', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await addAthlete(page, { name: 'Sam' });

  const sharing = page.getByRole('region', { name: 'Sharing' });
  await page.getByRole('button', { name: 'Invite co-parent' }).click();
  await expect(sharing).toContainText('Invite for Sam');
  await expect(sharing).toContainText('?invite=');

  await page.getByRole('button', { name: 'Switch to Casey' }).click();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
  await expect(sharing).not.toContainText('?invite=');
  await expect(sharing.getByRole('button', { name: 'Invite co-parent' })).toBeVisible();
});

test('Home shows no Season card until the Athlete has a finished Game', async ({ page }) => {
  await addFirstAthlete(page);
  await expect(page.getByRole('region', { name: 'Season' })).toHaveCount(0);
  await recordBasketballGame(page);
  await expect(page.getByRole('region', { name: 'Season' })).toBeVisible();
});

test('Start Game, a stat tile and the half court take touch-action manipulation, so rapid taps do not zoom the page', async ({ page }) => {
  await addFirstAthlete(page);
  await expect(page.getByRole('button', { name: 'Start Game' })).toHaveCSS('touch-action', 'manipulation');
  await startGame(page);
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveCSS('touch-action', 'manipulation');
  await expect(page.getByRole('img', { name: 'Half court' })).toHaveCSS('touch-action', 'manipulation');
});

test('Delete everything and the Sign out confirm are neutral: no button on either screen is gold', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Delete my account and all data' }).click();
  await expect(page.getByRole('button', { name: 'Delete everything', exact: true })).toBeVisible();
  await expectNoGoldButton(page);
  await page.getByRole('button', { name: 'Cancel' }).click();
  await page.getByRole('button', { name: 'Sign out', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Sign out' })).toBeVisible();
  await expectNoGoldButton(page);
});

test.describe('first run at 390×844', () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test('the signed-in line and Sign out keep the 16px margin', async ({ page }) => {
    await openApp(page);
    const line = page.getByText('Signed in as casey@example.com');
    const signOut = page.getByRole('button', { name: 'Sign out', exact: true });
    await expect(signOut).toBeVisible();
    expect((await line.boundingBox())!.x).toBeGreaterThanOrEqual(16);
    expect((await signOut.boundingBox())!.x).toBeGreaterThanOrEqual(16);
  });

  test('the photo button takes the app surface, and sits centred in its field by pixels', async ({ page, browserName }) => {
    test.skip(browserName !== 'chromium', 'criterion 2 is on Chromium');
    await openApp(page);
    const photo = page.getByLabel('Photo (optional)');
    await expect(photo).toBeVisible();
    expect(await photo.evaluate((el) => getComputedStyle(el, '::file-selector-button').backgroundColor)).toBe('rgb(26, 35, 56)');

    // a pseudo-element has no box Playwright can read, so the field's own picture is scanned: the button's fill rows, above and below
    const field = (await photo.boundingBox())!;
    const shot = await photo.screenshot();
    const fill = await page.evaluate(async (src) => {
      const img = new Image();
      img.src = src;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext('2d')!;
      ctx.drawImage(img, 0, 0);
      const px = ctx.getImageData(0, 0, canvas.width, canvas.height).data;
      let first = -1;
      let last = -1;
      for (let y = 0; y < canvas.height; y++) {
        for (let x = 0; x < canvas.width; x++) {
          const i = (y * canvas.width + x) * 4;
          if (Math.abs(px[i] - 26) <= 3 && Math.abs(px[i + 1] - 35) <= 3 && Math.abs(px[i + 2] - 56) <= 3) {
            if (first < 0) first = y;
            last = y;
          }
        }
      }
      return { height: canvas.height, top: first, bottom: last };
    }, `data:image/png;base64,${shot.toString('base64')}`);

    expect(fill.top).toBeGreaterThanOrEqual(0);
    // the gaps above and below the fill, in CSS pixels: the criterion's 2px
    const scale = fill.height / field.height;
    const above = fill.top / scale;
    const below = (fill.height - 1 - fill.bottom) / scale;
    expect(Math.abs(above - below)).toBeLessThanOrEqual(2);
  });
});

for (const colorScheme of ['dark', 'light'] as const) {
  test.describe(`on either phone setting, ${colorScheme}`, () => {
    test.use({ colorScheme });

    test('Start Game is the one gold button on Home', async ({ page }) => {
      await addFirstAthlete(page);
      await expect(page.getByRole('button', { name: 'Start Game' })).toHaveCSS('background-color', 'rgb(245, 184, 65)');
      for (const name of ['Edit', 'Add Athlete', 'Settings']) {
        await expect(page.getByRole('button', { name, exact: true })).not.toHaveCSS('background-color', 'rgb(245, 184, 65)');
      }
    });

    test('the pressed tab label is gold text', async ({ page }) => {
      await addFirstAthlete(page);
      await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCSS('color', 'rgb(245, 184, 65)');
    });
  });
}
