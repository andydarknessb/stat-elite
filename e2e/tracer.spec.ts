import { expect, test } from '@playwright/test';

test('a Recorder adds an Athlete, taps STL, and still sees the count after a reload', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();

  const steal = page.getByRole('button', { name: 'STL' });
  await expect(steal).toHaveText('STL 0');
  await steal.click();
  await expect(steal).toHaveText('STL 1');

  await page.reload();
  await expect(steal).toHaveText('STL 1');
});

test("the theme follows the phone's light or dark setting", async ({ page }) => {
  await page.goto('/');
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  const light = await background();
  await page.emulateMedia({ colorScheme: 'dark' });

  expect(await background()).not.toBe(light);
});
