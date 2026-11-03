import { expect, test, type Locator, type Page } from '@playwright/test';
import { openApp } from './openApp';

async function addAthlete(page: Page, name: string) {
  await openApp(page);
  await page.getByLabel('Athlete name').fill(name);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
}

async function startGame(page: Page) {
  await page.getByRole('button', { name: 'Start Game' }).click();
  await page.getByRole('button', { name: 'Start', exact: true }).click();
}

async function endGame(page: Page, name: string) {
  await page.getByLabel(`${name} final`).fill('9');
  await page.getByLabel('Opponent final').fill('7');
  await page.getByRole('button', { name: 'End Game', exact: true }).click();
}

async function openSummary(page: Page) {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Opponent/ }).click();
}

test('the strip, the End Game form, Game Complete and the summary label the Team with the Athlete', async ({ page }) => {
  await addAthlete(page, 'Casey Smith');
  await startGame(page);

  const team = page.getByRole('group', { name: 'Casey Smith', exact: true });
  await expect(team.getByText('Casey Smith', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Casey Smith +1' }).click();
  await page.getByRole('button', { name: 'Casey Smith +1' }).click();
  await expect(team.locator('.count')).toHaveText('2');
  await expect(team.locator('.count')).toHaveCSS('color', 'rgb(245, 184, 65)');
  await expect(page.getByRole('group', { name: 'Team', exact: true })).toHaveCount(0);
  await expect(page.getByRole('group', { name: 'Opponent', exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, 'Casey Smith');
  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expect(page.getByText('Casey Smith 9 – Opponent 7')).toBeVisible();

  await openSummary(page);
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
  await expect(page.getByText('Casey Smith 9 – Opponent 7')).toBeVisible();
});

test('the Add past Game form labels the Team score with the Athlete, and its summary reads the same', async ({ page }) => {
  await addAthlete(page, 'Casey Smith');
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Casey Smith score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByRole('button', { name: 'Save', exact: true }).click();

  await expect(page.getByText('Casey Smith 40 – Opponent 32')).toBeVisible();
});

test("Edit past Game labels the score with the Game's Athlete, after another tab selects another Athlete", async ({ page, context }) => {
  await addAthlete(page, 'Casey Smith');
  await page.getByRole('button', { name: 'Add past Game' }).click();
  await page.getByLabel('Opponent', { exact: true }).fill('Lions');
  await page.getByLabel('Date', { exact: true }).fill('2026-01-15');
  await page.getByLabel('Casey Smith score').fill('40');
  await page.getByLabel('Opponent score').fill('32');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Casey Smith 40 – Opponent 32')).toBeVisible();

  const other = await context.newPage();
  await openApp(other);
  await other.getByRole('button', { name: 'Add Athlete' }).click();
  await other.getByLabel('Athlete name').fill('Sam Lee');
  await other.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(other.getByRole('heading', { name: 'Sam Lee' })).toBeVisible();

  await page.getByRole('button', { name: 'Edit' }).click();
  await expect(page.getByRole('heading', { name: 'Edit past Game' })).toBeVisible();
  await expect(page.getByLabel('Sam Lee score')).toHaveCount(0);
  await expect(page.getByLabel('Casey Smith score')).toHaveValue('40');
});

test("a result row's Final Score keeps its own width, leaving the row to the Opponent and the line", async ({ page }) => {
  await addAthlete(page, 'Casey Smith');
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, 'Casey Smith');
  await page.getByRole('button', { name: 'Done' }).click();

  const row = page.locator('.result-row');
  const text = (await row.locator('.result-text').boundingBox())!;
  const score = (await row.locator('.final').boundingBox())!;
  expect(score.width).toBeLessThan(text.width / 2);
});

test('"Casey Smith" fits whole beside a 9–7 score on Game Complete and the summary', async ({ page }) => {
  // the fit depends on the condensed font, so measure only once it has loaded
  const expectWhole = async (name: Locator) => {
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    const { scrollWidth, clientWidth } = await name.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(scrollWidth).toBe(clientWidth);
  };
  await addAthlete(page, 'Casey Smith');
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, 'Casey Smith');

  await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
  await expectWhole(page.locator('.result-head').getByText('Casey Smith', { exact: true }));

  await openSummary(page);
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
  await expectWhole(page.locator('.result-head').getByText('Casey Smith', { exact: true }));
});

test.describe('a 40-character name', () => {
  const NAME = 'Mohammed Wadsworth-Montgomery Bloomquist';

  /** The name is cut with "…" on one line, and the page does not scroll sideways. */
  async function expectNameCut(page: Page, scope: Locator) {
    const name = await scope.getByText(NAME, { exact: true }).evaluate((element) => {
      const style = getComputedStyle(element);
      return {
        textOverflow: style.textOverflow,
        height: element.getBoundingClientRect().height,
        lineHeight: parseFloat(style.lineHeight),
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
      };
    });
    expect(name.textOverflow).toBe('ellipsis');
    expect(name.height).toBeLessThan(name.lineHeight * 1.5);
    expect(name.scrollWidth).toBeGreaterThan(name.clientWidth);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(390);
  }

  /** What follows the name keeps its full width: red if the name and this text share one truncated element, since it then has no element of its own to find. */
  async function expectFullyVisible(text: Locator) {
    const { scrollWidth, clientWidth } = await text.evaluate((element) => ({ scrollWidth: element.scrollWidth, clientWidth: element.clientWidth }));
    expect(clientWidth).toBeGreaterThan(0);
    expect(scrollWidth).toBe(clientWidth);
  }

  test('is cut with "…" on all five screens, and only the name is cut', async ({ page }) => {
    await addAthlete(page, NAME);
    await startGame(page);

    // Live strip
    await expectNameCut(page, page.getByRole('group', { name: NAME, exact: true }));
    for (const plus of [NAME, 'Opponent']) {
      const box = (await page.getByRole('button', { name: `${plus} +1` }).boundingBox())!;
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(390);
    }

    // End Game form
    await page.getByRole('button', { name: 'End Game' }).click();
    const final = page.locator('label', { hasText: `${NAME} final` });
    await expectNameCut(page, final);
    await expectFullyVisible(final.getByText('final', { exact: true }));
    await endGame(page, NAME);

    // Game Complete
    await expect(page.getByRole('heading', { name: 'Final' })).toBeVisible();
    const complete = page.getByRole('region', { name: 'Game Complete' });
    await expectNameCut(page, complete);
    await expectFullyVisible(complete.getByText('9 – Opponent 7', { exact: true }));

    // Game summary
    await openSummary(page);
    await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
    await expectNameCut(page, page.locator('.result-head'));
    await expectFullyVisible(page.locator('.result-head').getByText('9 – Opponent 7', { exact: true }));

    // Add past Game form
    await page.getByRole('button', { name: 'Back' }).click();
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await page.getByRole('button', { name: 'Add past Game' }).click();
    const score = page.locator('label', { hasText: `${NAME} score` });
    await expectNameCut(page, score);
    await expectFullyVisible(score.getByText('score', { exact: true }));
  });
});
