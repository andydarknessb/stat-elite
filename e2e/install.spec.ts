import { expect, test } from '@playwright/test';

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
