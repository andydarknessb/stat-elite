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

// bytes the browser cannot decode as an image
const BAD_PHOTO = { name: 'bad.png', mimeType: 'image/png', buffer: Buffer.from('not an image') };

type Photo = { name: string; mimeType: string; buffer: Buffer };

async function endAGame(page: Page, photo?: Photo) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  if (photo) await page.getByLabel('Photo (optional)').setInputFiles(photo);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
}

// stands in for the phone's share sheet: keeps the files it is given
async function keepSharedFiles(page: Page) {
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async (data: ShareData) => {
        (window as Window & { shared?: File[] }).shared = data.files;
      },
    });
  });
}

// a 30x10 PNG: blue outer columns and a pure red middle 10 columns, drawn in the page with a canvas
async function stripedPhoto(page: Page): Promise<Photo> {
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 30;
    canvas.height = 10;
    const ctx = canvas.getContext('2d')!;
    ctx.fillStyle = '#0000ff';
    ctx.fillRect(0, 0, 30, 10);
    ctx.fillStyle = '#ff0000';
    ctx.fillRect(10, 0, 10, 10);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  return { name: 'stripes.png', mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

// each channel within 8 of the target
const near = (rgb: number[], target: number[]) => rgb.every((c, i) => Math.abs(c - target[i]) <= 8);

// taps Share card, then reads back the one file the share stub kept
async function tapShareCard(page: Page) {
  await page.getByRole('button', { name: 'Share card' }).click();
  await expect.poll(() => page.evaluate(() => (window as Window & { shared?: File[] }).shared?.length)).toBe(1);
  return page.evaluate(async () => {
    const file = (window as Window & { shared?: File[] }).shared![0];
    const bitmap = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = bitmap.width;
    canvas.height = bitmap.height;
    const ctx = canvas.getContext('2d')!;
    ctx.drawImage(bitmap, 0, 0);
    const pixel = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data.slice(0, 3));
    // rows 940 to 1030, where the Final Score is drawn
    const band = ctx.getImageData(0, 940, bitmap.width, 91).data;
    let bright = 0;
    for (let i = 0; i < band.length; i += 4) {
      if (band[i] > 200 && band[i + 1] > 200 && band[i + 2] > 200) bright++;
    }
    return {
      type: file.type,
      width: bitmap.width,
      height: bitmap.height,
      center: pixel(600, 200),
      left: pixel(180, 200),
      brightInScoreRows: bright,
    };
  });
}

test('Share card hands the Recorder a 1200×1200 image through the share sheet', async ({ page }) => {
  await keepSharedFiles(page);
  await endAGame(page, PHOTO);
  const card = await tapShareCard(page);
  expect(card).toMatchObject({ type: 'image/png', width: 1200, height: 1200 });
});

test('a photo the browser cannot decode still shares a 1200×1200 card', async ({ page }) => {
  await keepSharedFiles(page);
  await endAGame(page, BAD_PHOTO);
  await expect(page.getByRole('button', { name: 'Share card' })).toBeEnabled();
  const card = await tapShareCard(page);
  expect(card).toMatchObject({ type: 'image/png', width: 1200, height: 1200 });
});

test('a card the worker cannot draw says so, and Share card stays disabled', async ({ page }) => {
  await page.addInitScript(() => {
    // a worker that fails on every card
    window.Worker = class {
      onerror: ((event: { message: string }) => void) | null = null;
      postMessage() {
        setTimeout(() => this.onerror?.({ message: 'stub worker failed' }), 0);
      }
      terminate() {}
    } as unknown as typeof Worker;
  });
  await endAGame(page);
  await expect(page.getByText('Share card could not be drawn')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Share card' })).toBeDisabled();
  await expect(page.getByRole('button', { name: 'Copy text' })).toBeEnabled();
});

test('a share sheet that refuses the card downloads it instead', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('refused', 'NotAllowedError');
      },
    });
  });
  await endAGame(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share card' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toBe('statelite-final.png');
  const png = readFileSync((await file.path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 1200]);
});

test('a share sheet the Recorder cancels downloads nothing', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, {
      canShare: () => true,
      share: async () => {
        throw new DOMException('cancelled', 'AbortError');
      },
    });
  });
  await endAGame(page);
  const downloaded = page.waitForEvent('download', { timeout: 1000 }).then(
    () => true,
    () => false,
  );
  await page.getByRole('button', { name: 'Share card' }).click();
  expect(await downloaded).toBe(false);
});

test('the card draws the photo, cropped from its middle', async ({ page }) => {
  await keepSharedFiles(page);
  await endAGame(page, await stripedPhoto(page));
  const card = await tapShareCard(page);
  // a stretched photo would put blue at x 180; a middle crop keeps red there
  expect(near(card.center, [255, 0, 0])).toBe(true);
  expect(near(card.left, [255, 0, 0])).toBe(true);
});

test('the card with no photo draws the background and the Final Score', async ({ page }) => {
  await keepSharedFiles(page);
  await endAGame(page);
  const card = await tapShareCard(page);
  expect(near(card.center, [0x0f, 0x12, 0x16])).toBe(true);
  expect(card.brightInScoreRows).toBeGreaterThan(1000);
});

test('where file sharing is unsupported, Share card downloads the 1200×1200 image', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
  });

  await endAGame(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share card' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toBe('statelite-final.png');
  // a PNG's IHDR chunk holds the width and height as 32-bit big-endian integers at bytes 16 and 20
  const png = readFileSync((await file.path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 1200]);
});
