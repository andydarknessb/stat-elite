import { expect, test, type Page } from '@playwright/test';

// A 1x1 PNG, enough for the photo to render.
const PHOTO = {
  name: 'casey.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

async function firstRunAdd(page: Page, name: string, number?: string) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill(name);
  if (number) await page.getByLabel('Number').fill(number);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
}

test('first run asks for an Athlete, then leads to Home and stays there after a reload', async ({ page }) => {
  await firstRunAdd(page, 'Casey', '12');

  await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
  await expect(page.getByText('#12')).toBeVisible();

  await page.reload();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeHidden();
});

test('an Athlete with no photo shows its initial in place of one', async ({ page }) => {
  await firstRunAdd(page, 'Casey', '12');

  await expect(page.locator('.photo-placeholder')).toHaveText('C');
  await expect(page.locator('.photo img')).toBeHidden();
});

test('an Athlete with no photo shows the initials of its first two names', async ({ page }) => {
  await firstRunAdd(page, 'Casey Jones');

  await expect(page.locator('.photo-placeholder')).toHaveText('CJ');
});

test('initials come from the first two names, upper-cased, whatever the rest', async ({ page }) => {
  await firstRunAdd(page, 'casey ann jones');

  await expect(page.locator('.photo-placeholder')).toHaveText('CA');
});

test('the photo shows on Home and nothing is uploaded', async ({ page }) => {
  const writes: string[] = [];
  page.on('request', (request) => {
    if (request.method() !== 'GET') writes.push(request.url());
  });

  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByLabel('Photo (optional)').setInputFiles(PHOTO);
  await page.getByRole('button', { name: 'Add Athlete' }).click();

  await expect(page.locator('.photo img')).toBeVisible();
  expect(writes).toEqual([]);
});

test('editing an Athlete changes name and number on Home and keeps them after a reload', async ({ page }) => {
  await firstRunAdd(page, 'Casey', '12');

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

test('with two Athletes, Add Athlete from Home shows the new one, tapping the photo switches, and Start Game records the one shown', async ({ page }) => {
  await firstRunAdd(page, 'Casey');

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
