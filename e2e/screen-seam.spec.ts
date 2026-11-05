import { expect, test, type Page } from '@playwright/test';
import { addFirstAthlete, endGame, recordBasketballGame, startGame } from './recorder';

// Makes every read of the phone's store throw, as a refused IndexedDB read does; writes still work.
// Each refused read counts in window.refusedReads. It runs in the page, so it is passed to evaluate or addInitScript.
function refuseReads() {
  const counted = window as unknown as { refusedReads: number };
  counted.refusedReads = 0;
  const refuse = () => {
    counted.refusedReads += 1;
    throw new DOMException('the store refused the read', 'UnknownError');
  };
  for (const proto of [IDBObjectStore.prototype, IDBIndex.prototype]) {
    proto.get = refuse;
    proto.getAll = refuse;
    proto.count = refuse;
    proto.openCursor = refuse;
  }
}

test('Remove in one tab: the other tab on the same summary leaves it, and the Game leaves its feed', async ({ page }) => {
  await addFirstAthlete(page);
  await recordBasketballGame(page);
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Opponent/ }).click();
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();

  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await other.getByRole('button', { name: 'Games', exact: true }).click();
  await other.getByRole('button', { name: /Opponent/ }).click();
  await expect(other.getByRole('heading', { name: 'Opponent' })).toBeVisible();

  await page.getByRole('button', { name: 'Remove', exact: true }).click();
  await page.getByRole('button', { name: 'Yes, remove' }).click();

  await expect(other.getByRole('heading', { name: 'Opponent' })).toHaveCount(0);
  await expect(other.getByText('No finished Games yet.')).toBeVisible();
});

test('Game Complete in one tab, Remove in the other: that tab goes Home', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);

  const other = await page.context().newPage();
  await other.goto('/');
  await expect(other.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await other.getByRole('button', { name: 'Games', exact: true }).click();
  await other.getByRole('button', { name: /Opponent/ }).click();
  await other.getByRole('button', { name: 'Remove', exact: true }).click();
  await other.getByRole('button', { name: 'Yes, remove' }).click();

  await expect(page.getByRole('region', { name: 'Game Complete' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
});

test('a read that fails before anything is on screen shows the alert and Reload', async ({ page }) => {
  await addFirstAthlete(page);
  await page.addInitScript(refuseReads);
  await page.reload();

  await expect(page.getByRole('alert')).toHaveText("Could not read this phone's data.");
  await expect(page.getByRole('button', { name: 'Reload' })).toBeVisible();
});

/** How many Games the phone's store holds, counted in the page, deleted or not. */
const gameCount = (page: Page) =>
  page.evaluate(async () => {
    const [{ name }] = await indexedDB.databases();
    return new Promise<number>((resolve, reject) => {
      const open = indexedDB.open(name!);
      open.onerror = () => reject(open.error);
      open.onsuccess = () => {
        const count = open.result.transaction('games').objectStore('games').count();
        count.onsuccess = () => {
          open.result.close();
          resolve(count.result);
        };
      };
    });
  });

// Start submitted on every task turn for three seconds, the stress that lands a second tap in the gap after the Game is written:
// one Game, not two. The first submit starts the Game; the rest must be refused by the form's block.
test('a double tap on Start makes one Game', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Start Game' }).click();
  await expect(page.getByRole('button', { name: 'Start', exact: true })).toBeVisible();

  await page.evaluate(async () => {
    const form = document.querySelector('form')!;
    const turn = () =>
      new Promise((resolve) => {
        const channel = new MessageChannel();
        channel.port1.onmessage = resolve;
        channel.port2.postMessage(0);
      });
    const end = performance.now() + 3000;
    while (document.contains(form) && performance.now() < end) {
      form.requestSubmit();
      await turn();
    }
  });

  await expect(page.getByRole('button', { name: /^STL/ })).toBeVisible();
  await page.waitForTimeout(500);
  expect(await gameCount(page)).toBe(1);
});

/** How many reads refuseReads has refused in the page. */
const refusedReads = (page: Page) =>
  page.evaluate(() => (window as unknown as { refusedReads: number }).refusedReads);

test('a read that fails with a Game on screen keeps the score strip and shows no alert', async ({ page }) => {
  await addFirstAthlete(page);
  await startGame(page);
  await page.evaluate(refuseReads);
  // the live screen re-reads each second, so a second has to pass for a read to fail on screen
  await page.waitForTimeout(1500);

  expect(await refusedReads(page)).toBeGreaterThan(0);
  await expect(page.locator('.strip')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});

// Makes reads of the athletePhotos store throw and leaves every other store alone.
function refuseAthletePhotoReads() {
  const get = IDBObjectStore.prototype.get;
  IDBObjectStore.prototype.get = function (this: IDBObjectStore, query: IDBValidKey | IDBKeyRange) {
    if (this.name === 'athletePhotos') throw new DOMException('the store refused the read', 'UnknownError');
    return get.call(this, query);
  };
}

test('a photo read that fails as a Game ends keeps Game Complete and logs the refused read', async ({ page }) => {
  // the logged error's text is read from its arguments: message.text() of an Error in the built app is not its message
  const logged: string[] = [];
  page.on('console', async (message) => {
    if (message.type() !== 'error') return;
    for (const arg of message.args()) logged.push(await arg.evaluate((value) => String((value as Error).message ?? value)));
  });
  await addFirstAthlete(page);
  await startGame(page);
  await page.evaluate(refuseAthletePhotoReads);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);

  await expect(page.getByRole('button', { name: 'Done', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
  await expect.poll(() => logged.some((text) => text.includes('the store refused the read'))).toBe(true);
});

type Refusal = { store: string; methods: string[]; keys?: string[] };

// Makes the named methods of one store's IDBObjectStore throw, for the given keys when `keys` is set; every other read is left alone.
// Each refused read counts in window.refusedReads, as refuseReads does. It runs in the page, so it is passed to evaluate or addInitScript.
function refuseStoreReads(refusals: Refusal[]) {
  const counted = window as unknown as { refusedReads: number };
  counted.refusedReads = 0;
  const proto = IDBObjectStore.prototype as unknown as Record<string, (...args: unknown[]) => unknown>;
  for (const { store, methods, keys } of refusals) {
    for (const method of methods) {
      const read = proto[method] as (...args: unknown[]) => unknown;
      proto[method] = function (this: IDBObjectStore, ...args: unknown[]) {
        if (this.name !== store || (keys && !keys.includes(args[0] as string))) return read.apply(this, args);
        counted.refusedReads += 1;
        throw new DOMException('the store refused the read', 'UnknownError');
      };
    }
  }
}

/** Waits for the refused read to run, then a beat for its failure to reach the screen, so an assertion cannot pass before Reload would show. */
async function settle(page: Page) {
  await expect.poll(() => refusedReads(page)).toBeGreaterThan(0);
  await page.waitForTimeout(500);
}

test('Summary: a refused read of the account keeps the summary, with Edit and Remove hidden', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Casey score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Back' }).click();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.evaluate(refuseStoreReads, [{ store: 'settings', methods: ['get'], keys: ['account'] }]);
  await page.getByRole('button', { name: /Lions/ }).click();
  await settle(page);

  await expect(page.getByRole('heading', { name: 'Lions', level: 1 })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Edit', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test('Home: a refused read of the athletes keeps Home, and Start Game stays up', async ({ page }) => {
  await addFirstAthlete(page);
  await page.evaluate(refuseStoreReads, [{ store: 'athletes', methods: ['get'] }]);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.getByRole('button', { name: 'Cancel' }).click();
  await settle(page);

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test('Live screen: refused Button Size and Field mode reads keep the live screen up', async ({ page }) => {
  await addFirstAthlete(page);
  await page.evaluate(refuseStoreReads, [{ store: 'settings', methods: ['get'], keys: ['buttonSize', 'fieldMode'] }]);
  await startGame(page);
  await settle(page);

  await expect(page.locator('.strip')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test('Cold load: a refused read of Field mode and the outbox keeps Home, with no not-synced badge', async ({ page }) => {
  await addFirstAthlete(page);
  await page.addInitScript(refuseStoreReads, [
    { store: 'settings', methods: ['get'], keys: ['fieldMode'] },
    { store: 'outbox', methods: ['getAll', 'openCursor'] },
  ]);
  await page.reload();
  await settle(page);

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.locator('.sync')).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test('Home: a refused read of the account keeps Home after a trip to Games', async ({ page }) => {
  await addFirstAthlete(page);
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.evaluate(refuseStoreReads, [{ store: 'settings', methods: ['get'], keys: ['account'] }]);
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await settle(page);

  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test('Settings: a refused read of the account keeps Settings, and Sign out is hidden', async ({ page }) => {
  await addFirstAthlete(page);
  await page.evaluate(refuseStoreReads, [{ store: 'settings', methods: ['get'], keys: ['account'] }]);
  await page.getByRole('button', { name: 'Settings' }).click();
  await settle(page);

  await expect(page.getByRole('group', { name: 'Button Size' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});

test('First run after an invite: a refused read of the account keeps the Athlete form, with no Sign out', async ({ page }) => {
  await page.goto('/?invite=not-a-token');
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText('This invite link is not valid.')).toBeVisible();
  await page.evaluate(refuseStoreReads, [{ store: 'settings', methods: ['get'], keys: ['account'] }]);
  await page.getByRole('button', { name: 'Continue' }).click();
  await settle(page);

  await expect(page.getByLabel('Athlete name')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Sign out', exact: true })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Reload' })).toHaveCount(0);
});
