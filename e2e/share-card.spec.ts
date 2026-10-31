import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';

// A 1x1 PNG, enough for the photo to render (as athletes.spec.ts uses it).
const PHOTO = {
  name: 'casey.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

async function endAGame(page: Page, withPhoto: boolean) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  if (withPhoto) await page.getByLabel('Photo (optional)').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
}

test('Share card hands the Recorder a 1200×1200 image through the share sheet', async ({ page }) => {
  // stands in for the phone's share sheet: keeps the files it is given
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async (data: ShareData) => {
        (window as Window & { shared?: File[] }).shared = data.files;
      },
    });
  });

  await endAGame(page, true);
  await page.getByRole('button', { name: 'Share card' }).click();

  await expect.poll(() => page.evaluate(() => (window as Window & { shared?: File[] }).shared?.length)).toBe(1);
  const card = await page.evaluate(async () => {
    const file = (window as Window & { shared?: File[] }).shared![0];
    const bitmap = await createImageBitmap(file);
    return { type: file.type, width: bitmap.width, height: bitmap.height };
  });
  expect(card).toEqual({ type: 'image/png', width: 1200, height: 1200 });
});

test('where file sharing is unsupported, Share card downloads the 1200×1200 image', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
  });

  await endAGame(page, false);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share card' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toBe('statelite-final.png');
  // a PNG's IHDR chunk holds the width and height as 32-bit big-endian integers at bytes 16 and 20
  const png = readFileSync((await file.path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 1200]);
});
