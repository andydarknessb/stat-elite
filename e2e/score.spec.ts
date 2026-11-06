import { expect, test } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

test('a Recorder adjusts the strip, reloads and still sees the score, then ends the Game with a Final Score', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  await page.getByRole('button', { name: 'Casey +1' }).click();
  await page.getByRole('button', { name: 'Casey +1' }).click();
  await page.getByRole('button', { name: 'Opponent +1' }).click();
  await expect(page.getByRole('group', { name: 'Casey' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Opponent' }).getByText('1', { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole('group', { name: 'Casey' }).getByText('2', { exact: true })).toBeVisible();
  await expect(page.getByRole('group', { name: 'Opponent' }).getByText('1', { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Casey final').fill('');
  await expect(page.getByRole('button', { name: 'Save Final Score', exact: true })).toBeDisabled();
  await page.getByLabel('Casey final').fill('9');
  await page.getByLabel('Opponent final').fill('7');
  await page.getByRole('button', { name: 'Save Final Score', exact: true }).click();

  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Casey 9 – Opponent 7')).toBeVisible();
  await expect(page.getByRole('button', { name: /^STL/ })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Casey +1' })).toHaveCount(0);

  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('End Game opens the Final Score form inline, and Keep playing closes it with the Game still live', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  await page.getByRole('button', { name: 'End Game' }).click();
  await expect(page.getByRole('heading', { name: 'Final Score' })).toBeVisible();
  const title = page.getByRole('heading', { name: 'Final Score' });
  await expect(title).toHaveCSS('font-size', '22px');
  await expect(title).toHaveCSS('font-family', /Barlow Condensed/);
  await expect(title).toHaveCSS('margin-top', '0px');
  await expect(page.getByRole('dialog')).toHaveCount(0);

  await page.getByRole('button', { name: 'Keep playing' }).click();
  await expect(page.getByRole('heading', { name: 'Final Score' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();

  await page.getByRole('button', { name: 'Casey +1' }).click();
  await expect(page.getByRole('group', { name: 'Casey' }).getByText('1', { exact: true })).toBeVisible();
});

test('End Game refuses a Final Score above 999 with the whole-number message, and takes 999', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Casey final').fill('1000');
  await expect(page.getByRole('button', { name: 'Save Final Score', exact: true })).toBeDisabled();
  await expect(page.getByText('Scores are whole numbers from 0 to 999.')).toBeVisible();
  await page.getByLabel('Casey final').fill('999');
  await expect(page.getByRole('button', { name: 'Save Final Score', exact: true })).toBeEnabled();
});

test("the strip seeded at 999 disables Casey's +1", async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);

  // the strip at 999, written to the phone's store as removal-arrives.spec.ts writes its own, then reloaded to read it
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const request = indexedDB.open('stat-elite');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const db = request.result;
          const tx = db.transaction(['games', 'events'], 'readwrite');
          const all = tx.objectStore('games').getAll();
          all.onsuccess = () => {
            tx.objectStore('events').put({
              id: crypto.randomUUID(),
              game_id: all.result[0].id,
              seq: 100,
              client_ts: new Date().toISOString(),
              period: 1,
              type: 'score',
              retracts_id: null,
              court_x: null,
              court_y: null,
              shot_value: null,
              made: null,
              team_score: 999,
              opponent_score: 0,
              outcome: null,
              rbi: null,
              pitch: null,
              base: null,
              stolen: null,
            });
          };
          tx.oncomplete = () => {
            db.close();
            resolve();
          };
          tx.onerror = () => reject(tx.error);
        };
      }),
  );
  await page.reload();

  await expect(page.getByRole('group', { name: 'Casey' }).getByText('999', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Casey +1' })).toBeDisabled();
});
