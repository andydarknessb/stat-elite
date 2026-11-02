import { expect, test, type Page } from '@playwright/test';

async function addAthlete(page: Page) {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();
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

// the Home-to-Games-to-Settings walk, shared by all three audits: basketball then softball finish, so Home lists both
async function visitEveryScreen(page: Page, theme: string): Promise<string[]> {
  const failures: string[] = [];
  const check = async (screen: string) => {
    failures.push(...(await page.evaluate(auditScreen, `${theme}, ${screen}`)));
  };

  // the walk is audited at Standard; assert it, so a changed default cannot quietly audit Compact or Bleacher
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('group', { name: 'Button Size' }).getByRole('button', { name: 'Standard', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await page.getByRole('button', { name: 'Done' }).click();

  // the basketball live screen at Standard, with the End Game form open
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await expect(page.getByRole('button', { name: 'End Game' })).toBeVisible();
  await expect(page.getByRole('button', { name: /^OREB \d+$/ })).toBeVisible();
  await check('basketball live screen, Standard');
  await page.getByRole('button', { name: 'End Game' }).click();
  await expect(page.getByRole('heading', { name: 'Finish game?' })).toBeVisible();
  await check('basketball live screen, End Game form open');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await page.getByRole('button', { name: 'Done' }).click();

  // the softball live screen at Standard, with an Outcome armed; then the Game ends and Game Complete shows
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByLabel('Sport').selectOption('Softball');
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await expect(page.getByRole('button', { name: '2B', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await check('softball live screen, Outcome armed');
  await page.getByRole('button', { name: '0 RBI' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await page.getByLabel('Team final').fill('3');
  await page.getByLabel('Opponent final').fill('1');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
  await check('Game Complete');
  await page.getByRole('button', { name: 'Done' }).click();

  // Home with one finished basketball Game and one finished softball Game: wait for the Season card and Recent Games to load
  await expect(page.getByRole('region', { name: 'Season' })).toBeVisible();
  await expect(page.getByRole('region', { name: 'Recent Games' })).toBeVisible();
  await check('Home');

  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: 'Softball', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Softball', exact: true })).toHaveAttribute('aria-pressed', 'true');
  await expect(page.getByRole('button', { name: /H\/AB/ })).toBeVisible();
  await check('Games tab, Softball pressed');

  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await check('Insights tab');

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await expect(page.getByRole('heading', { name: 'Settings' })).toBeVisible();
  await check('Settings');
  return failures;
}

test.describe('dark', () => {
  test.use({ colorScheme: 'dark' });

  test('every screen meets contrast and 44px target size under the dark theme', async ({ page }) => {
    await addAthlete(page);
    const failures = await visitEveryScreen(page, 'dark');
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

test.describe('light phone', () => {
  test.use({ colorScheme: 'light' });

  test('every screen meets contrast and 44px target size on a light phone, which stays navy', async ({ page }) => {
    await addAthlete(page);
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(11, 16, 32)');
    const failures = await visitEveryScreen(page, 'light');
    expect(failures, failures.join('\n')).toEqual([]);
  });
});

test.describe('Field mode', () => {
  test.use({ colorScheme: 'dark' });

  test('every screen meets contrast and 44px target size in Field mode on a dark phone', async ({ page }) => {
    await addAthlete(page);
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('button', { name: 'Field mode', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Field mode', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('body')).toHaveCSS('background-color', 'rgb(255, 255, 255)');
    await page.getByRole('button', { name: 'Done' }).click();

    const failures = await visitEveryScreen(page, 'Field mode');
    expect(failures, failures.join('\n')).toEqual([]);
  });
});
