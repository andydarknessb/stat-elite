import { expect, test, type Page } from '@playwright/test';
import { openApp } from './openApp';

// Writes to the phone's IndexedDB ('stat-elite', as store.ts names it); the reload that follows reads them (ADR 0007).
async function editPhone(page: Page, edits: { store: string; put?: Record<string, unknown>; delete?: string }[]) {
  await page.evaluate(
    (list) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('stat-elite');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction([...new Set(list.map((edit) => edit.store))], 'readwrite');
          for (const edit of list) {
            if (edit.put) tx.objectStore(edit.store).put(edit.put);
            if (edit.delete) tx.objectStore(edit.store).delete(edit.delete);
          }
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    edits,
  );
}

// The stand-in refuses too-soon@example.com as Supabase's send rate limit does, so the wait message can be reached (#158).
test('a code asked for too soon says to wait and stays on the email step', async ({ page }) => {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill('too-soon@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Wait a minute before asking for another code.')).toBeVisible();
  await expect(page.getByLabel('Email')).toHaveValue('too-soon@example.com');
  await expect(page.getByLabel('Code')).toHaveCount(0);
});

test('a code that cannot be sent with the network off says so', async ({ page, context }) => {
  await page.goto('/?invite=not-a-token');
  await context.setOffline(true);
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByText('Could not send the code. Check the connection and try again.')).toBeVisible();
});

test('an empty phone opens on the sign-in screen, and the emailed code opens Add Athlete with the address and Sign out', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'StatElite' })).toBeVisible();
  await expect(page.getByText("Record your Athlete's Games from the sideline, even with no signal.")).toBeVisible();
  await expect(page.getByText("We only use your email to sign you in. If you join someone's Athlete, they'll see it.")).toBeVisible();

  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeVisible();
  await expect(page.getByText('Signed in as casey@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toBeVisible();
});

test('a Game open on a phone with no Account opens its live screen, and Done after End Game shows the sign-in screen', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByLabel('Email')).toBeVisible();
  // an Athlete and an open Game recorded before sign-in: neither has an owner or a Recorder
  const created = '2026-10-30T12:00:00.000Z';
  await editPhone(page, [
    { store: 'athletes', put: { id: 'seed-athlete', name: 'Casey', jersey_number: null, created_at: created, updated_at: created } },
    {
      store: 'games',
      put: {
        id: 'seed-game',
        athlete_id: 'seed-athlete',
        sport: 'basketball',
        period_format: 'quarters',
        opponent_name: 'Hawks',
        game_date: '2026-10-30',
        created_at: created,
        updated_at: created,
      },
    },
  ]);
  await page.reload();
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();
  await page.getByRole('button', { name: /^STL/ }).click();

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByLabel('Email')).toBeVisible();
});

test('a signed-in phone with no download recorded shows the retry screen with the network off, and no Add Athlete', async ({ page, context }) => {
  await openApp(page);
  // the service worker precaches the app shell while it installs; a reload hands the page to it
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await editPhone(page, [{ store: 'settings', delete: 'downloadedOnce' }]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Could not get your Athletes. Check the connection and try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  await expect(page.getByLabel('Athlete name')).toHaveCount(0);
});

test('Retry shows Getting your Athletes… while its attempt runs, and no Retry button is up then', async ({ page, context }) => {
  await openApp(page);
  // the service worker precaches the app shell while it installs; a reload hands the page to it
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await editPhone(page, [{ store: 'settings', delete: 'downloadedOnce' }]);
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByText('Could not get your Athletes. Check the connection and try again.')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
  // from here on, record whether the progress text shows and whether a Retry button is up while it does
  await page.evaluate(() => {
    const record = { gettingSeen: false, retryWhileGetting: false };
    Object.assign(window, { retryRecord: record });
    const observe = () => {
      if (!document.body.textContent?.includes('Getting your Athletes…')) return;
      record.gettingSeen = true;
      if (Array.from(document.querySelectorAll('button')).some((button) => button.textContent === 'Retry')) record.retryWhileGetting = true;
    };
    new MutationObserver(observe).observe(document.body, { subtree: true, childList: true, characterData: true });
  });
  await page.getByRole('button', { name: 'Retry' }).click();
  // the failure message comes back only after the attempt has failed, which is after the progress text showed
  await expect
    .poll(() => page.evaluate(() => (window as unknown as { retryRecord: { gettingSeen: boolean } }).retryRecord.gettingSeen))
    .toBe(true);
  await expect(page.getByText('Could not get your Athletes. Check the connection and try again.')).toBeVisible();
  const record = await page.evaluate(() => (window as unknown as { retryRecord: { gettingSeen: boolean; retryWhileGetting: boolean } }).retryRecord);
  expect(record.gettingSeen).toBe(true);
  expect(record.retryWhileGetting).toBe(false);
});
