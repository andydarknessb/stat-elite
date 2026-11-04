import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { addAthlete, addFirstAthlete } from './recorder';

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

test('a removal arriving on a summary opened from Games returns to the Games tab, with the Game gone', async ({ page, context }) => {
  await addBackloggedGame(page);
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Lions/ }).click();
  await expect(page.getByText('Casey 40 – Opponent 32')).toBeVisible();

  await removeFromOtherTab(context);

  await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Games', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /Lions/ })).toHaveCount(0);
});

test('a removal arriving on a summary opened from Home returns to Home', async ({ page, context }) => {
  await addBackloggedGame(page);

  await removeFromOtherTab(context);

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Home', exact: true })).toHaveAttribute('aria-pressed', 'true');
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

  // goto, not openApp: this tab shares the store and the remembered account. Another account owns Casey's Athlete here, so Leave shows
  const other = await context.newPage();
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
  await other.getByRole('button', { name: 'Leave', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Games', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Games', exact: true })).toHaveAttribute('aria-pressed', 'true');
});
