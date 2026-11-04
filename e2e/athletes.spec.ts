import { expect, test } from '@playwright/test';
import { openApp } from './openApp';
import { addFirstAthlete } from './recorder';

// A 1x1 PNG, enough for the photo to render.
const PHOTO = {
  name: 'casey.png',
  mimeType: 'image/png',
  buffer: Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=',
    'base64',
  ),
};

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

test('the photo shows on Home and nothing is uploaded', async ({ page, browserName }) => {
  test.fixme(browserName === 'webkit', 'WebKit: bug #217');
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

test('an Athlete added with no photo takes one in Edit Athlete, and nothing is uploaded', async ({ page, browserName }) => {
  test.fixme(browserName === 'webkit', 'WebKit: bug #217');
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
