import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, endGame, endGameForShareCard, startGame, type Photo } from './recorder';

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

// each channel within tol of the target
const near = (rgb: number[], target: number[], tol = 8) => rgb.every((c, i) => Math.abs(c - target[i]) <= tol);

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
    // the Final Score's gold, #f5b841, each channel within 8
    let gold = 0;
    for (let i = 0; i < band.length; i += 4) {
      if (Math.abs(band[i] - 0xf5) <= 8 && Math.abs(band[i + 1] - 0xb8) <= 8 && Math.abs(band[i + 2] - 0x41) <= 8) gold++;
    }
    return {
      type: file.type,
      width: bitmap.width,
      height: bitmap.height,
      corner: pixel(0, 0),
      center: pixel(600, 200),
      left: pixel(180, 200),
      goldInScoreRows: gold,
    };
  });
}

test('Share card hands the Recorder a 1200×1200 image through the share sheet', async ({ page }) => {
  await keepSharedFiles(page);
  await endGameForShareCard(page, PHOTO);
  const card = await tapShareCard(page);
  expect(card).toMatchObject({ type: 'image/png', width: 1200, height: 1200 });
});

// Casey's basketball Game against Lady Hawks, ended at 42–37 on Game Complete, where the card is drawn
async function endLadyHawksGame(page: Page) {
  await addFirstAthlete(page, { name: 'Casey' });
  await startGame(page, { opponent: 'Lady Hawks' });
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, { teamLabel: 'Casey', teamScore: '42', opponentScore: '37' });
}

test('the drawn card shows as a 240px preview between the result card and Share card', async ({ page }) => {
  await endLadyHawksGame(page);

  const preview = page.getByRole('img', { name: 'Share card: Casey vs Lady Hawks, 42–37' });
  await expect(preview).toBeVisible();
  await expect.poll(() => preview.evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight])).toEqual([1200, 1200]);
  const box = (await preview.boundingBox())!;
  const result = (await page.getByRole('region', { name: 'Game Complete' }).boundingBox())!;
  const share = (await page.getByRole('button', { name: 'Share card' }).boundingBox())!;
  expect(Math.abs(box.width - 240)).toBeLessThanOrEqual(1);
  expect(Math.abs(box.height - 240)).toBeLessThanOrEqual(1);
  expect(box.y).toBeGreaterThanOrEqual(result.y + result.height);
  expect(box.y + box.height).toBeLessThanOrEqual(share.y);
  expect(Math.abs(box.x + box.width / 2 - 195)).toBeLessThanOrEqual(1);
});

test('the preview holds its space while the card draws, so Share card does not move', async ({ page }) => {
  // the card's Worker answers only when the test releases it, with the 1x1 PNG
  await page.addInitScript((png: string) => {
    const replies: Array<() => void> = [];
    (window as Window & { releaseCard?: () => void }).releaseCard = () => replies.splice(0).forEach((reply) => reply());
    window.Worker = class {
      onmessage: ((event: { data: unknown }) => void) | null = null;
      onerror: ((event: { message: string }) => void) | null = null;
      postMessage() {
        const bytes = Uint8Array.from(atob(png), (char) => char.charCodeAt(0));
        replies.push(() => this.onmessage?.({ data: { png: new Blob([bytes], { type: 'image/png' }) } }));
      }
      terminate() {}
    } as unknown as typeof Worker;
  }, PHOTO.buffer.toString('base64'));
  await endLadyHawksGame(page);

  const share = page.getByRole('button', { name: 'Share card' });
  await expect(share).toBeDisabled();
  const before = (await share.boundingBox())!.y;
  await page.evaluate(() => (window as Window & { releaseCard?: () => void }).releaseCard?.());
  await expect(page.getByRole('img', { name: 'Share card: Casey vs Lady Hawks, 42–37' })).toBeVisible();
  await expect(share).toBeEnabled();
  const after = (await share.boundingBox())!.y;
  expect(Math.abs(after - before)).toBeLessThanOrEqual(1);
});

test('after a basketball win, Game Complete does not scroll vertically at 390×844', async ({ page }) => {
  await endLadyHawksGame(page);
  await expect(page.getByRole('img', { name: 'Share card: Casey vs Lady Hawks, 42–37' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollHeight)).toBeLessThanOrEqual(844);
});

test('a photo the browser cannot decode still shares a 1200×1200 card', async ({ page }) => {
  await keepSharedFiles(page);
  await endGameForShareCard(page, BAD_PHOTO);
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
  await endGameForShareCard(page);
  await expect(page.getByText('Share card could not be drawn')).toBeVisible();
  await expect(page.getByRole('img', { name: /^Share card:/ })).toHaveCount(0);
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
  await endGameForShareCard(page);
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
  await endGameForShareCard(page);
  const downloaded = page.waitForEvent('download', { timeout: 1000 }).then(
    () => true,
    () => false,
  );
  await page.getByRole('button', { name: 'Share card' }).click();
  expect(await downloaded).toBe(false);
});

test('the card draws the photo, cropped from its middle', async ({ page }) => {
  await keepSharedFiles(page);
  await endGameForShareCard(page, await stripedPhoto(page));
  const card = await tapShareCard(page);
  // a stretched photo would put blue at x 180; a middle crop keeps red there
  expect(near(card.center, [255, 0, 0])).toBe(true);
  expect(near(card.left, [255, 0, 0])).toBe(true);
});

test('the card with no photo draws the background and the Final Score', async ({ page }) => {
  await keepSharedFiles(page);
  await endGameForShareCard(page);
  const card = await tapShareCard(page);
  // the corner is the background; within 4 a channel tells #0b1020 from the old #0f1216
  expect(near(card.corner, [0x0b, 0x10, 0x20], 4)).toBe(true);
  expect(card.goldInScoreRows).toBeGreaterThan(1000);
});

test.describe('with the Barlow Condensed files blocked', () => {
  // the service worker answers the font from precache where page.route never sees it, so it is blocked here
  test.use({ serviceWorkers: 'block' });

  test('the card still draws', async ({ page }) => {
    await keepSharedFiles(page);
    await page.route(/barlow-condensed/, (route) => route.abort());
    await endGameForShareCard(page);
    const card = await tapShareCard(page);
    expect(card).toMatchObject({ type: 'image/png', width: 1200, height: 1200 });
  });
});

test('where file sharing is unsupported, Share card downloads the 1200×1200 image', async ({ page }) => {
  await page.addInitScript(() => {
    Object.assign(navigator, { share: undefined, canShare: undefined });
  });

  await endGameForShareCard(page);
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Share card' }).click();

  const file = await download;
  expect(file.suggestedFilename()).toBe('statelite-final.png');
  // a PNG's IHDR chunk holds the width and height as 32-bit big-endian integers at bytes 16 and 20
  const png = readFileSync((await file.path())!);
  expect([png.readUInt32BE(16), png.readUInt32BE(20)]).toEqual([1200, 1200]);
});
