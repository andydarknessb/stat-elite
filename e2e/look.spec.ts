import { expect, test, type Locator, type Page } from '@playwright/test';
import { addFirstAthlete, startGame } from './recorder';

// the px between a section's first two result rows: Recent Games and the Games feed space their rows alike (#243)
function rowGap(section: Locator): Promise<number> {
  return section.locator('.result-row').evaluateAll((rows) => rows[1].getBoundingClientRect().top - rows[0].getBoundingClientRect().bottom);
}

// runs in the page: one line per failing text element (contrast) or tap target (size)
function auditScreen(screen: string): string[] {
  const failures: string[] = [];
  // only rgb()/rgba() is read; any other notation (oklch, color()) comes back NaN and is reported
  const rgba = (value: string): number[] => {
    if (!/^rgba?\(/.test(value)) return [NaN, NaN, NaN, NaN];
    const parts = (value.match(/[\d.]+/g) ?? []).map(Number);
    return [parts[0], parts[1], parts[2], parts.length > 3 ? parts[3] : 1];
  };
  const over = (top: number[], below: number[]) => [0, 1, 2].map((i) => top[i] * top[3] + below[i] * (1 - top[3]));
  const luminance = (rgb: number[]) => {
    const [r, g, b] = rgb.map((c) => {
      const s = c / 255;
      return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    });
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  };
  const contrast = (a: number[], b: number[]) => {
    const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
    return (hi + 0.05) / (lo + 0.05);
  };
  // the element's own and ancestors' backgrounds, each blended over the next, down to the white canvas
  const backdrop = (el: Element): number[] => {
    const layers: number[][] = [];
    for (let n: Element | null = el; n; n = n.parentElement) {
      const c = rgba(getComputedStyle(n).backgroundColor);
      if (c[3] > 0 || Number.isNaN(c[3])) layers.push(c);
      if (c[3] >= 1) break;
    }
    return layers.reduceRight((below, top) => over(top, below), [255, 255, 255]);
  };
  // opacity 0 counts as hidden; a disabled control at 0.5 is still audited at its full computed colour
  const opacityOf = (el: Element) => {
    let o = 1;
    for (let n: Element | null = el; n; n = n.parentElement) o *= parseFloat(getComputedStyle(n).opacity);
    return o;
  };
  const shown = (el: Element) => {
    const s = getComputedStyle(el);
    const r = el.getBoundingClientRect();
    return s.visibility === 'visible' && s.display !== 'none' && r.width > 0 && r.height > 0 && opacityOf(el) > 0;
  };
  const clean = (text: string) => text.replace(/\s+/g, ' ').trim().slice(0, 40);

  for (const el of Array.from(document.body.querySelectorAll('*'))) {
    const ownText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent ?? '')
      .join('');
    if (!clean(ownText) || !shown(el)) continue;
    const bg = backdrop(el);
    const fg = over(rgba(getComputedStyle(el).color), bg);
    const style = getComputedStyle(el);
    const size = parseFloat(style.fontSize);
    const weight = parseInt(style.fontWeight, 10);
    const large = size >= 24 || (size >= 18.66 && weight >= 700);
    const need = large ? 3 : 4.5;
    const ratio = contrast(fg, bg);
    if (Number.isNaN(ratio)) {
      failures.push(`${screen}: "${clean(ownText)}" (${el.tagName.toLowerCase()}) has a colour the guard cannot read`);
    } else if (ratio < need) {
      failures.push(`${screen}: "${clean(ownText)}" (${el.tagName.toLowerCase()}) is ${ratio.toFixed(2)}:1, needs ${need}:1`);
    }
  }

  // every second-level heading is set in Barlow Condensed, the card, form and Games-feed headings alike (#243)
  for (const el of Array.from(document.querySelectorAll('h2'))) {
    if (!shown(el)) continue;
    const family = getComputedStyle(el).fontFamily;
    if (!/^"?Barlow Condensed"?/.test(family)) failures.push(`${screen}: "${clean(el.textContent ?? '')}" (h2) is set in ${family}, needs Barlow Condensed`);
  }

  for (const el of Array.from(document.querySelectorAll('button, a[href], input:not([type=hidden]), select'))) {
    if (!shown(el)) continue;
    const r = el.getBoundingClientRect();
    if (r.width >= 44 && r.height >= 44) continue;
    const label = el.getAttribute('aria-label') ?? (el as HTMLInputElement).labels?.[0]?.textContent ?? (el.textContent || (el as HTMLInputElement).value || '');
    failures.push(
      `${screen}: "${clean(label) || el.tagName.toLowerCase()}" (${el.tagName.toLowerCase()}) is ${r.width.toFixed(1)}×${r.height.toFixed(1)} px, needs 44×44`,
    );
  }
  return failures;
}

// the sign-in screen an empty phone opens on: its email step, then its code step (ADR 0007)
async function auditSignIn(page: Page, theme: string): Promise<string[]> {
  await page.goto('/');
  await expect(page.getByLabel('Email')).toBeVisible();
  const email = await page.evaluate(auditScreen, `${theme}, sign-in email step`);
  await page.getByLabel('Email').fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await expect(page.getByLabel('Code')).toBeVisible();
  return [...email, ...(await page.evaluate(auditScreen, `${theme}, sign-in code step`))];
}

// the Home-to-Games-to-Settings walk, shared by all three audits: basketball then softball finish, so Home lists both
async function visitEveryScreen(page: Page, theme: string): Promise<string[]> {
  const failures: string[] = [];
  const check = async (screen: string) => {
    failures.push(...(await page.evaluate(auditScreen, `${theme}, ${screen}`)));
  };

  // the tab bar's bottom edge is the phone's bottom edge on the three tab screens, however short they are (#243)
  const tabBarRests = async (screen: string) => {
    const bottom = await page.locator('nav.tabs').evaluate((bar) => bar.getBoundingClientRect().bottom);
    const viewport = await page.evaluate(() => window.innerHeight);
    expect(bottom, `${screen}: the tab bar ends at ${bottom}, not at the viewport's ${viewport}`).toBeCloseTo(viewport, 0);
  };

  // the walk is audited at Standard; assert it, so a changed default cannot quietly audit Compact or Bleacher
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('group', { name: 'Button Size' }).getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Done' }).click();

  // the basketball live screen at Standard, with the End Game form open
  await startGame(page);
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^OREB \d+$/ })).toBeVisible();
  await check('basketball live screen, Standard');
  await page.getByRole('button', { name: 'End Game' }).click();
  await expect(page.getByRole('heading', { name: 'Finish game?' })).toBeVisible();
  await check('basketball live screen, End Game form open');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // the softball live screen at Standard, with an Outcome armed; then the Game ends and Game Complete shows
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('button', { name: '2B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await check('softball live screen, Outcome armed');
  await page.getByRole('button', { name: '0 RBI' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Casey final').fill('3');
  await page.getByLabel('Opponent final').fill('1');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
  await check('Game Complete');
  await page.getByRole('button', { name: 'Done' }).click();

  // Home with one finished basketball Game and one finished softball Game: wait for the Season card and Recent Games to load
  await expect(page.getByRole('region', { name: 'Season' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent Games' })).toBeVisible();
  await check('Home');
  await tabBarRests('Home');
  const recent = page.getByRole('region', { name: 'Recent Games' });
  await expect(recent.locator('.result-row')).toHaveCount(2);
  const recentGap = await rowGap(recent);

  // both finished Games are Today, so the feed's Today group holds both rows: its rows must space as Recent Games' do
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  const today = page.getByRole('region', { name: 'Today' });
  await expect(today.locator('.result-row')).toHaveCount(2);
  await tabBarRests('Games tab');
  expect(await rowGap(today), 'Games rows space as Recent Games rows do').toBeCloseTo(recentGap, 1);

  await page.getByRole('button', { name: 'Softball', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Softball', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /H\/AB/ })).toBeVisible();
  await check('Games tab, Softball pressed');

  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await check('Insights tab');
  await tabBarRests('Insights tab');

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await check('Settings');
  return failures;
}

test.describe('dark', () => {
  test.use({ colorScheme: 'dark' });

  test('every screen meets contrast and 44px target size under the dark theme', async ({ page }) => {
    await addFirstAthlete(page);
    const failures = await visitEveryScreen(page, 'dark');
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('the sign-in screen meets contrast and 44px target size under the dark theme', async ({ page }) => {
    const failures = await auditSignIn(page, 'dark');
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

test.describe('light phone', () => {
  test.use({ colorScheme: 'light' });

  test('every screen meets contrast and 44px target size on a light phone, which stays navy', async ({ page }) => {
    await addFirstAthlete(page);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
    const failures = await visitEveryScreen(page, 'light');
    expect(failures, failures.join('\n')).toEqual([]);
  });

  test('the sign-in screen meets contrast and 44px target size on a light phone', async ({ page }) => {
    const failures = await auditSignIn(page, 'light');
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

test.describe('Field mode', () => {
  test.use({ colorScheme: 'dark' });

  test('every screen meets contrast and 44px target size in Field mode on a dark phone', async ({ page }) => {
    await addFirstAthlete(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Field mode', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Field mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Done' }).click();

    const failures = await visitEveryScreen(page, 'Field mode');
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
