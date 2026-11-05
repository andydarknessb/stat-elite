import type { Page } from '@playwright/test';

// the one place a spec opens the app at /: an empty phone opens on the sign-in screen (ADR 0007), so this signs the stand-in's Recorder in
export async function openApp(page: Page) {
  await page.goto('/');
  const email = page.getByLabel('Email');
  const athleteName = page.getByLabel('Athlete name');
  const startGame = page.getByRole('button', { name: 'Start Game' });
  // the first screen is sign-in on an empty phone; a phone already signed in opens on Add Athlete or on Home. Home can also show
  // "Sign in again" (ADR 0007) with a read-only Email beside Start Game, so one match is awaited, and only an editable Email signs in
  await email.or(athleteName).or(startGame).first().waitFor();
  if (!(await email.isVisible()) || !(await email.isEditable())) return;
  await email.fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
  // the spec goes on only once the sign-in has landed: a reload or an offline switch sooner would cut it short
  await athleteName.or(startGame).waitFor();
}
