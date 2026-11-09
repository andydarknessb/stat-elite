import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addAthlete, addFirstAthlete } from './recorder';
import { openApp } from './openApp';

/** Adds a Backlogged Game against Lions for the Athlete the phone shows, and waits on the summary Save opens. */
async function addLionsGame(page: Page) {
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Casey score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Casey 40 – Opponent 32')).toBeVisible();
}

/** Adds Casey and a Backlogged Game against Lions, and waits on the summary Save opens. */
async function addBackloggedGame(page: Page) {
  await addFirstAthlete(page);
  await addLionsGame(page);
}

/** A second tab shares this phone's store, so its removal arrives here as a download would. */
async function removeFromOtherTab(context: BrowserContext) {
  const other = await context.newPage();
  // goto, not openApp: this tab shares the first tab's store and its remembered account, so it has no sign-in to drive
  await other.goto('/');
  await other.getByRole('button', { name: 'Games', exact: true }).click();
  await other.getByRole('button', { name: /Lions/ }).click();
  await other.getByRole('button', { name: 'Remove', exact: true }).click();
  await other.getByRole('button', { name: 'Yes, remove', exact: true }).click();
  await expect(other.getByRole('button', { name: 'Start Game' })).toBeVisible();
}

/** Opens a second tab on this store with Casey's Athlete owned by another Account, so Leave shows there. */
async function seedCaseyOwnedByAnother(context: BrowserContext): Promise<Page> {
  const other = await context.newPage();
  // goto, not openApp: this tab shares the store and the remembered account. Another account owns Casey's Athlete here, so Leave shows
  await other.goto('/');
  await other.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('stat-elite');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction('athletes', 'readwrite');
          const store = tx.objectStore('athletes');
          const all = store.getAll();
          all.onsuccess = () => {
            const casey = all.result.find((row: { name: string }) => row.name === 'Casey');
            store.put({ ...casey, owner_id: 'another-account' });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await other.reload();
  return other;
}

test('a removal arriving on a summary opened from Games returns to the Games tab, with the Game gone', async ({ page, context }) => {
  await addBackloggedGame(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Lions/ }).click();
  await expect(page.getByText('Casey 40 – Opponent 32')).toBeVisible();

  await removeFromOtherTab(context);

  await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Games', exact: true })).toHaveAttribute('aria-current', 'page');
  await expect(page.getByRole('button', { name: /Lions/ })).toHaveCount(0);
});

test('a removal arriving on a summary opened from Home returns to Home', async ({ page, context }) => {
  await addBackloggedGame(page);

  await removeFromOtherTab(context);

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('a removal arriving on an open Edit form keeps its entry, and Cancel then leaves the summary', async ({ page, context }) => {
  await addBackloggedGame(page);
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit past Game' })).toBeVisible();

  await removeFromOtherTab(context);

  await expect(page.getByLabel('Casey score')).toHaveValue('40');
  await page.getByRole('button', { name: 'Cancel' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('Leave in another tab while an Edit form is open leaves the form, and the Games tab shows', async ({ page, context }) => {
  await addFirstAthlete(page, { name: 'Sam' });
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await addAthlete(page, { name: 'Casey' });
  await addLionsGame(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Lions/ }).click();
  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit past Game' })).toBeVisible();

  const other = await seedCaseyOwnedByAnother(context);
  await other.getByRole('button', { name: 'Leave', exact: true }).click();
  await other.getByRole('button', { name: 'Yes, leave', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Games', exact: true })).toHaveAttribute('aria-current', 'page');
});

test('Leave asks first: Cancel keeps Casey on the Phone, and Yes, leave removes it', async ({ page, context }) => {
  await addFirstAthlete(page, { name: 'Sam' });
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await addAthlete(page, { name: 'Casey' });

  const other = await seedCaseyOwnedByAnother(context);
  await other.getByRole('button', { name: 'Leave', exact: true }).click();
  await expect(
    other.getByText("Leave Casey? Casey, its Games and this phone's photo leave this phone, and coming back takes a new Invite.", { exact: true }),
  ).toBeVisible();
  await other.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Casey', level: 1 })).toBeVisible();

  await other.getByRole('button', { name: 'Leave', exact: true }).click();
  await other.getByRole('button', { name: 'Yes, leave', exact: true }).click();
  await expect(other.getByRole('heading', { name: 'Casey', level: 1 })).toHaveCount(0);
});

// the Owner removed this account while the phone was away: its Athlete is in the store under a shared marker and not on the stand-in
test('an Athlete removed while the phone was away drops at a reconnect, its line shows, OK clears it, and it stays gone after a reload', async ({ page, context }) => {
  const line = "You're no longer a Member of Casey. Anything not synced is gone.";
  await openApp(page);
  // the service worker precaches the app shell while it installs; the offline switch below must not cut that short
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('stat-elite');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['athletes', 'settings'], 'readwrite');
          const id = 'a0000000-0000-0000-0000-000000000206';
          tx.objectStore('athletes').put({ id, name: 'Casey', owner_id: 'another-account', jersey_number: null, created_at: '2026-01-01T00:00:00.000Z', updated_at: '2026-01-01T00:00:00.000Z' });
          tx.objectStore('settings').put({ key: `shared:${id}`, value: 'shared' });
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );

  // the reconnect runs the download, which no longer sends the Athlete
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByText(line)).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByText(line)).toHaveCount(0);

  // as test 3 does: the reload lands on the Phone's screen, and the cleared line stays down
  await context.setOffline(true);
  await page.reload();
  await expect(page.getByLabel('Athlete name')).toBeVisible();
  await expect(page.getByText(line)).toHaveCount(0);
});

/** The rows of one of the phone's IndexedDB stores, read as the seed above reads its own. */
const readStore = (page: Page, name: string) =>
  page.evaluate(
    (name) =>
      new Promise<Record<string, string>[]>((resolve, reject) => {
        const request = indexedDB.open('stat-elite');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const all = db.transaction(name).objectStore(name).getAll();
          all.onsuccess = () => {
            db.close();
            resolve(all.result);
          };
          all.onerror = () => reject(all.error);
        };
      }),
    name,
  );

/** Writes one row into one of the phone's IndexedDB stores, as the seed above does. */
const writeRow = (page: Page, name: string, row: Record<string, string>) =>
  page.evaluate(
    ({ name, row }) =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('stat-elite');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(name, 'readwrite');
          tx.objectStore(name).put(row);
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
    { name, row },
  );

test("an Owner's phone is told once when a Member is gone, and OK clears the line", async ({ page, context }) => {
  const line = 'Sam is no longer a Member of Casey.';
  await addFirstAthlete(page);
  // the service worker precaches the app shell while it installs; the offline switch below must not cut that short
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  const casey = (await readStore(page, 'athletes')).find((row) => row.name === 'Casey')!.id;

  // the reconnect's download compares the Members of Casey, an Athlete this phone owns, with the list it keeps
  await context.setOffline(true);
  await context.setOffline(false);
  await expect.poll(async () => (await readStore(page, 'settings')).some((row) => row.key === `members:${casey}`)).toBe(true);

  // a Member the phone kept and the server no longer sends, as a Leave or an Owner's other phone's Remove leaves it
  await writeRow(page, 'settings', { key: `members:${casey}`, value: JSON.stringify([{ id: 'gone-member', label: 'Sam' }]) });
  await context.setOffline(true);
  await context.setOffline(false);
  await expect(page.getByText(line)).toBeVisible();
  await page.getByRole('button', { name: 'OK', exact: true }).click();
  await expect(page.getByText(line)).toHaveCount(0);
});
