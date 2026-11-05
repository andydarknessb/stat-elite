import { expect, test } from '@playwright/test';
import { openApp } from './openApp';
import { addFirstAthlete } from './recorder';

type PersistWindow = { persistCalls: number };
// PROBE (temporary, #222): readings the failure message carries
type ProbeWindow = PersistWindow & { stubFn?: unknown; initState?: string; initRoot?: boolean };

test('first run asks the browser to keep storage permanently', async ({ page }) => {
  // stub before the app loads, so the call the first-run screen makes lands on the counter
  await page.addInitScript(() => {
    const w = window as unknown as PersistWindow;
    w.persistCalls = 0;
    StorageManager.prototype.persist = async () => {
      w.persistCalls += 1;
      return true;
    };
  });

  await openApp(page);
  await expect(page.getByRole('heading', { name: 'Add Athlete' })).toBeVisible();

  const calls = await page.evaluate(() => (window as unknown as PersistWindow).persistCalls);
  expect(calls).toBeGreaterThanOrEqual(1);
});

// PROBE (temporary, #222): the test at the old :25, as copies; pressure copies carry the churn snippet
function everyLaunch(title: string, pressure: boolean): void {
  test(title, async ({ page }) => {
    await page.addInitScript((pressureOn: boolean) => {
      const w = window as unknown as ProbeWindow;
      w.persistCalls = 0;
      w.initState = document.readyState;
      w.initRoot = !!document.getElementById('root');
      const stub = async () => {
        w.persistCalls += 1;
        return true;
      };
      StorageManager.prototype.persist = stub;
      w.stubFn = stub;
      if (pressureOn) {
        document.addEventListener('readystatechange', () => {
          let keep: unknown[] = [];
          for (let round = 0; round < 12; round++) {
            keep = [];
            for (let i = 0; i < 400000; i++) keep.push({ i });
          }
        }, { once: true });
      }
    }, pressure);

    await addFirstAthlete(page);
    await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();

    // the init script resets the counter on every load, so this counts the reloaded page alone
    await page.reload();
    await expect(page.getByRole('heading', { name: 'Casey' })).toBeVisible();
    const timeOriginAtHeading = await page.evaluate(() => performance.timeOrigin);

    const reading = await page.evaluate(() => {
      const w = window as unknown as ProbeWindow;
      return {
        calls: w.persistCalls,
        timeOriginBesideCounter: performance.timeOrigin,
        stubIntact: navigator.storage.persist === w.stubFn,
        stubOwn: Object.prototype.hasOwnProperty.call(navigator.storage, 'persist'),
        initState: w.initState,
        initRoot: w.initRoot,
        readyStateNow: document.readyState,
      };
    });
    const message = JSON.stringify({ pressure, timeOriginAtHeading, ...reading });

    expect(reading.calls, message).toBeGreaterThanOrEqual(1);
  });
}

for (let i = 1; i <= 40; i++) everyLaunch(`probe natural ${i}`, false);
for (let i = 1; i <= 5; i++) everyLaunch(`probe pressure ${i}`, true);
