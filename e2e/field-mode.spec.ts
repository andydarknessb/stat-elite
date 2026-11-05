import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

/** What the head holds once parsed, before any module script runs (#121). */
type Head = { field: boolean; colorScheme: string | null; themeColors: string[]; cleared: boolean };

/** On every load, records the head at readyState 'interactive', and whether data-field is ever removed after that. */
async function recordHead(page: Page) {
  await page.addInitScript(() => {
    document.addEventListener('readystatechange', () => {
      if (document.readyState !== 'interactive') return;
      const root = document.documentElement;
      const head = {
        field: root.hasAttribute('data-field'),
        colorScheme: document.querySelector('meta[name="color-scheme"]')?.getAttribute('content') ?? null,
        themeColors: [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
          .filter((meta) => !meta.media || matchMedia(meta.media).matches)
          .map((meta) => meta.content.toLowerCase()),
        cleared: false,
      };
      Object.assign(window, { __head: head });
      new MutationObserver(() => {
        if (!root.hasAttribute('data-field')) head.cleared = true;
      }).observe(root, { attributes: true, attributeFilter: ['data-field'] });
    });
  });
}

const readHead = (page: Page) => page.evaluate(() => (window as unknown as { __head: Head }).__head);

/** The theme-color the browser chrome would use now: metas with no media, or whose media matches. */
const themeColors = (page: Page) =>
  page.evaluate(() =>
    [...document.querySelectorAll<HTMLMetaElement>('meta[name="theme-color"]')]
      .filter((meta) => !meta.media || matchMedia(meta.media).matches)
      .map((meta) => meta.content.toLowerCase()),
  );

test('Field mode in Settings paints the light theme over a dark phone, and stays on across a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const field = page.getByRole('button', { name: 'Field mode', exact: true });
  await expect(field).toHaveAttribute('aria-pressed', 'false');

  await field.click();
  await expect(field).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.reload();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.getByRole('button', { name: 'Settings' }).click();
  await field.click();
  await expect(field).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
});

test('the live screen sun button turns Field mode on at Standard without scrolling', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addFirstAthlete(page);
  await startGame(page);
  const sun = page.getByRole('button', { name: 'Field mode', exact: true });
  await expect(sun).toHaveAttribute('aria-pressed', 'false');

  await sun.click();

  await expect(sun).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await page.evaluate(() => document.documentElement.scrollHeight <= window.innerHeight)).toBe(true);
});

test('a cold load with Field mode on marks the root before the app reads its setting', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await recordHead(page);
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Field mode', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  expect(await readHead(page)).toEqual({ field: true, colorScheme: 'light', themeColors: ['#ffffff'], cleared: false });
});

test('the theme-color follows Field mode live, without a reload', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const field = page.getByRole('button', { name: 'Field mode', exact: true });

  await field.click();
  await expect.poll(() => themeColors(page)).toEqual(['#ffffff']);
  await field.click();
  await expect.poll(() => themeColors(page)).toEqual(['#0b1020']);
});

test('Field mode turned off stays off across a cold load', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await recordHead(page);
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  const field = page.getByRole('button', { name: 'Field mode', exact: true });
  await field.click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await field.click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');

  await page.reload();
  await expect(page.getByRole('button', { name: 'Settings' })).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
  expect(await readHead(page)).toEqual({ field: false, colorScheme: 'dark', themeColors: ['#0b1020'], cleared: false });
});

test('with Field mode on, the Free Throw and the pressed Home label keep their light colours', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Field mode', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveCSS('color', 'rgb(100, 73, 26)');

  await startGame(page);
  const row = page.getByRole('group', { name: 'Free Throw' });
  await expect(row.getByRole('button', { name: 'MAKE' })).toHaveCSS('color', 'rgb(26, 127, 55)');
  await expect(row.getByRole('button', { name: 'MISS' })).toHaveCSS('color', 'rgb(201, 48, 44)');
});

test('turning Field mode off after a cold load with it on leaves the meta navy', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Field mode', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await page.reload();

  await page.getByRole('button', { name: 'Settings' }).click();
  const field = page.getByRole('button', { name: 'Field mode', exact: true });
  await expect(field).toHaveAttribute('aria-pressed', 'true');
  await field.click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
  await expect(page.locator('meta[name="color-scheme"]')).toHaveAttribute('content', 'dark');
  await expect.poll(() => themeColors(page)).toEqual(['#0b1020']);
});

test('on a light phone the page is navy with Field mode off, white with it on, and navy again off', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'light' });
  await addFirstAthlete(page);
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
  await page.getByRole('button', { name: 'Settings' }).click();
  const field = page.getByRole('button', { name: 'Field mode', exact: true });
  await field.click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
  await field.click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
});

test('deleting the account clears Field mode on the next cold load', async ({ page }) => {
  await page.emulateMedia({ colorScheme: 'dark' });
  await recordHead(page);
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Field mode', exact: true }).click();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');

  await page.getByRole('button', { name: 'Delete my account and all data' }).click();
  await page.getByRole('button', { name: 'Delete everything' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');

  await page.reload();
  await expect(page.getByLabel('Email')).toBeVisible();
  await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
  expect(await readHead(page)).toEqual({ field: false, colorScheme: 'dark', themeColors: ['#0b1020'], cleared: false });
});
