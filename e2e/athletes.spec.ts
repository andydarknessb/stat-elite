import { expect, test, type Page } from '@playwright/test';
import { openApp } from './openApp';
import { addFirstAthlete, type Photo } from './recorder';

// A 1x1 PNG, enough for the photo to render.
const PHOTO = {
  name: 'casey.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

// a solid PNG of the given size, drawn in the page with a canvas, so the test picks a real image of that size
async function picture(page: Page, width: number, height: number): Promise<Photo> {
  const base64 = await page.evaluate(
    ([w, h]) => {
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      canvas.getContext('2d')!.fillRect(0, 0, w, h);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    [width, height],
  );
  return { name: `${width}x${height}.png`, mimeType: 'image/png', buffer: Buffer.from(base64, 'base64') };
}

// Home's photo has this natural size once the image it shows has loaded
async function expectPhotoSize(page: Page, width: number, height: number) {
  await expect
    .poll(() => page.locator('.photo img').evaluate((img: HTMLImageElement) => [img.naturalWidth, img.naturalHeight]), {
      timeout: 10_000,
    })
    .toEqual([width, height]);
}

test('first run asks for an Athlete, then leads to Home and stays there after a reload', async ({ page }) => {
  await openApp(page);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByLabel('Number').fill('12');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();

  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
  await expect(page.getByText('#12')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeHidden();
});

test('an Athlete with no photo shows its initial in place of one', async ({ page }) => {
  await addFirstAthlete(page, { name: 'Casey', number: '12' });

  await expect(page.locator('.photo-placeholder')).toHaveText('C');
  await expect(page.locator('.photo img')).toBeHidden();
});

test('an Athlete with no photo shows the initials of its first two names', async ({ page }) => {
  await addFirstAthlete(page, { name: 'Casey Jones' });

  await expect(page.locator('.photo-placeholder')).toHaveText('CJ');
});

test('initials come from the first two names, upper-cased, whatever the rest', async ({ page }) => {
  await addFirstAthlete(page, { name: 'casey ann jones' });

  await expect(page.locator('.photo-placeholder')).toHaveText('CA');
});

test('the photo shows on Home and nothing is uploaded', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });

  await openApp(page);
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByLabel('Photo (optional)').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Add Athlete' }).click();

  await expect(page.locator('.photo img')).toBeVisible();
  expect(writes).toEqual([]);
});

test('a picked photo is stored at 1200px on its short side, never up, and a portrait stays upright', async ({ page }) => {
  await addFirstAthlete(page, { name: 'Casey', photo: await picture(page, 4000, 3000) });
  await expectPhotoSize(page, 1600, 1200);

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Photo (optional)').setInputFiles(await picture(page, 3000, 4000));
  await page.getByRole('button', { name: 'Save' }).click();
  await expectPhotoSize(page, 1200, 1600);

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Photo (optional)').setInputFiles(await picture(page, 1000, 800));
  await page.getByRole('button', { name: 'Save' }).click();
  await expectPhotoSize(page, 1000, 800);
});

test('editing an Athlete changes name and number on Home and keeps them after a reload', async ({ page }) => {
  await addFirstAthlete(page, { name: 'Casey', number: '12' });

  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Athlete name').fill('Casey Jones');
  await page.getByLabel('Number').fill('7');
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.getByRole('heading', { name: 'Casey Jones' })).toBeVisible();
  await expect(page.getByText('#7')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Casey Jones' })).toBeVisible();
  await expect(page.getByText('#7')).toBeVisible();
});

test('an Athlete added with no photo takes one in Edit Athlete, and nothing is uploaded', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });

  await addFirstAthlete(page, { name: 'Casey', number: '12' });
  await page.getByRole('button', { name: 'Edit' }).click();
  await page.getByLabel('Photo (optional)').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Save' }).click();

  await expect(page.locator('.photo img')).toBeVisible();
  await expect(page.locator('.photo-placeholder')).toBeHidden();
  expect(writes).toEqual([]);
});

test('with two Athletes, Add Athlete from Home shows the new one, tapping the photo switches, and Start Game records the one shown', async ({ page }) => {
  await addFirstAthlete(page, { name: 'Casey' });

  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await page.getByLabel('Athlete name').fill('Sam');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('heading', { name: 'Sam' })).toBeVisible();
  await expect(page.locator('.photo-placeholder')).toHaveText('S');

  await page.getByRole('button', { name: 'Switch to Casey' }).click();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: /^STL/ })).toBeVisible();
});
