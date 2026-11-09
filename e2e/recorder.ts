import { expect, type Page } from '@playwright/test';
import { openApp } from './openApp';

// The Recorder's common flows, for the specs that need a Game in place before they test something else.
// A spec that tests a flow keeps its own clicks for it and calls these only to get ready. Each function that
// changes screens waits for the screen it lands on before it returns.

export type Photo = { name: string; mimeType: string; buffer: Buffer };

export type Athlete = { name?: string; number?: string; photo?: Photo };

/** On a phone already signed in, with no Athlete yet: fills the first-run form and waits for Home. */
export async function addAthlete(page: Page, { name = 'Casey', number, photo }: Athlete = {}) {
  await page.getByLabel('Athlete name').fill(name);
  if (number) await page.getByLabel('Number').fill(number);
  if (photo) await page.getByLabel('Photo (optional)').setInputFiles(photo);
  await page.getByRole('button', { name: 'Add Athlete' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
}

/** The first Athlete on a fresh stand-in phone: opens the app, which signs the Recorder in, then adds one. */
export async function addFirstAthlete(page: Page, athlete: Athlete = {}) {
  await openApp(page);
  await addAthlete(page, athlete);
}

type StartOptions = {
  sport?: 'basketball' | 'softball' | 'baseball';
  periodFormat?: 'Quarters' | 'Halves' | '8 Periods';
  /** Three-pointers in Game setup; left as prefilled when not given. */
  threePointers?: 'On' | 'Off';
  /** The Button Size, set in Settings before the Game starts. */
  buttonSize?: 'Compact' | 'Bleacher';
};

/** Starts a Game from Home, basketball unless a sport is given, and waits for its live screen. */
export async function startGame(page: Page, { sport = 'basketball', periodFormat, threePointers, buttonSize }: StartOptions = {}) {
  if (buttonSize) {
    await page.getByRole('button', { name: 'Settings' }).click();
    await page.getByRole('group', { name: 'Button Size' }).getByRole('button', { name: buttonSize, exact: true }).click();
    await page.getByRole('button', { name: 'Done', exact: true }).click();
  }
  await page.getByRole('button', { name: 'Start Game' }).click();
  // always set: the setup form keeps the last sport, so a basketball Game after a softball one would start as softball
  await page.getByLabel('Sport').selectOption(sport);
  if (periodFormat) await page.getByLabel('Period format').selectOption(periodFormat);
  if (threePointers) await page.getByLabel('Three-pointers').selectOption(threePointers);
  await page.getByRole('button', { name: 'Start', exact: true }).click();
  if (sport === 'basketball') await expect(page.getByRole('button', { name: /^STL/ })).toBeVisible();
  else await expect(page.getByText('Inn 1', { exact: true })).toBeVisible();
}

/** Taps the half court at a spot, given as 0–100 on each axis. */
export async function tapCourt(page: Page, x: number, y: number) {
  const court = page.getByRole('img', { name: 'Half court' });
  const box = await court.boundingBox();
  if (!box) throw new Error('the half court is not on screen');
  await court.click({ position: { x: (box.width * x) / 100, y: (box.height * y) / 100 } });
}

/**
 * Saves the Final Score form, which the caller has open from the live screen: fills the Final Score when one
 * is given, then waits for Game Complete. Without a Final Score the form keeps the Game's own score.
 */
export async function endGame(page: Page, final?: { teamLabel: string; teamScore: string; opponentScore: string }) {
  if (final) {
    await page.getByLabel(`${final.teamLabel} final`).fill(final.teamScore);
    await page.getByLabel('Opponent final').fill(final.opponentScore);
  }
  await page.getByRole('button', { name: 'Save Final Score', exact: true }).click();
  await expect(page.getByRole('region', { name: 'Game Complete' })).toBeVisible();
}

/** A Game for the share card: an Athlete, with an optional photo, a basketball Game ended to Game Complete. */
export async function endGameForShareCard(page: Page, photo?: Photo) {
  await addFirstAthlete(page, { photo });
  await startGame(page);
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);
}

/** From Game Complete: Done, then the Games tab, then the Game against the Opponent. Waits for its summary. */
export async function openSummary(page: Page) {
  await page.getByRole('button', { name: 'Done' }).click();
  await page.getByRole('button', { name: 'Games', exact: true }).click();
  await page.getByRole('button', { name: /Opponent/ }).click();
  await expect(page.getByRole('heading', { name: 'Opponent' })).toBeVisible();
}

/** A whole basketball Game: one made 2, a made Free Throw, an offensive rebound and an assist, ending 3–0. Ends on Home. */
export async function recordBasketballGame(page: Page) {
  await startGame(page);
  await page.getByRole('button', { name: 'Sub In' }).click();
  await tapCourt(page, 50, 11);
  await page.getByRole('group', { name: 'Shot result' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('group', { name: 'Free Throw' }).getByRole('button', { name: 'MAKE' }).click();
  await page.getByRole('button', { name: /^OREB \d+$/ }).click();
  await page.getByRole('button', { name: /^AST \d+$/ }).click();
  await page.getByRole('button', { name: 'Sub Out' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page);
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
}

/** A whole softball Game: one double with 2 RBI, ending 3–1 with the Athlete named `athlete`. Ends on Home. */
export async function recordSoftballGame(page: Page, athlete = 'Casey') {
  await startGame(page, { sport: 'softball' });
  await page.getByRole('button', { name: '2B', exact: true }).click();
  await page.getByRole('button', { name: '2 RBI' }).click();
  await page.getByRole('button', { name: 'End Game' }).click();
  await endGame(page, { teamLabel: athlete, teamScore: '3', opponentScore: '1' });
  await page.getByRole('button', { name: 'Done' }).click();
  await expect(page.getByRole('button', { name: 'Start Game' })).toBeVisible();
}
