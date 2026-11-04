import { expect, test } from '@playwright/test';
import { openApp } from './openApp';
import { addFirstAthlete, startGame } from './recorder';

test('a Recorder adds an Athlete, taps STL, and still sees the count after a reload', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  const steal = page.getByRole('button', { name: /^STL/ });
  await expect(steal).toHaveText('STL 0');
  await steal.click();
  await expect(steal).toHaveText('STL 1');

  await page.reload();
  await expect(steal).toHaveText('STL 1');
});

test("the page is navy whatever the phone's setting is", async ({ page }) => {
  await openApp(page);
  const background = () => page.evaluate(() => getComputedStyle(document.body).backgroundColor);

  await page.emulateMedia({ colorScheme: 'light' });
  expect(await background()).toBe('rgb(11, 16, 32)');
  await page.emulateMedia({ colorScheme: 'dark' });

  expect(await background()).toBe('rgb(11, 16, 32)');
});
