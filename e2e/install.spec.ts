import { expect, test } from '@playwright/test';
import { addFirstAthlete } from './recorder';

const IPHONE =
  'Mozilla/5.0 (iPhone; CPU iPhone OS 16_4 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/16.4 Mobile/15E148 Safari/604.1';
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/126.0 Mobile Safari/537.36';

test.describe('on iPhone', () => {
  test.use({ userAgent: IPHONE });

  test('the first run explains installing through the share sheet', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('region', { name: 'Add to Home Screen' });
    await expect(card).toContainText('tap Share, then Add to Home Screen');
  });

  test('on Home, the install card sits above the tab bar', async ({ page }) => {
    await addFirstAthlete(page);
    const card = page.getByRole('region', { name: 'Add to Home Screen' });
    await expect(card).toBeVisible();
    // Home is taller than the phone: the tab bar is pinned to the bottom edge, and the card sits above it only at the page's end
    await page.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
    const cardBox = await card.boundingBox();
    const tabsBox = await page.locator('nav.tabs').boundingBox();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(tabsBox!.y);
  });

  test('the sign-in screen puts the install card above the Email field, and dismissing it leaves the form usable', async ({ page }) => {
    await page.goto('/');
    const card = page.getByRole('region', { name: 'Add to Home Screen' });
    const email = page.getByLabel('Email');
    await expect(card).toBeVisible();
    const cardBox = await card.boundingBox();
    const emailBox = await email.boundingBox();
    expect(cardBox!.y + cardBox!.height).toBeLessThanOrEqual(emailBox!.y);

    await page.getByRole('button', { name: 'Not now' }).click();
    await expect(card).toHaveCount(0);
    await email.fill('casey@example.com');
    await expect(email).toHaveValue('casey@example.com');
    await expect(page.getByRole('button', { name: 'Send code' })).toBeEnabled();
  });
});

test.describe('on Android', () => {
  test.use({ userAgent: ANDROID });

  test('the first run offers the install, through the prompt or the browser menu', async ({ page }) => {
    await page.goto('/');
    await expect(page.getByRole('region', { name: 'Add to Home Screen' })).toBeVisible();
  });

  test('with the browser install prompt, the card offers Install and shows the prompt', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => {
      const event = Object.assign(new Event('beforeinstallprompt', { cancelable: true }), {
        prompt: async () => {
          (window as unknown as { promptShown: boolean }).promptShown = true;
        },
      });
      window.dispatchEvent(event);
    });
    await page.getByRole('button', { name: 'Install', exact: true }).click();
    const shown = await page.evaluate(() => (window as unknown as { promptShown?: boolean }).promptShown);
    expect(shown).toBe(true);
  });
});
