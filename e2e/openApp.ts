import type { Page } from '@playwright/test';

// the one place a spec opens the app at /: an empty phone opens on the sign-in screen (ADR 0007), so this signs the stand-in's Recorder in
export async function openApp(page: Page) {
  await page.goto('/');
  const email = page.getByLabel('Email');
  // the first screen is sign-in on an empty phone, and Add Athlete once a phone is signed in; wait for whichever it is
  await email.or(page.getByLabel('Athlete name')).waitFor();
  if (!(await email.isVisible())) return;
  await email.fill('casey@example.com');
  await page.getByRole('button', { name: 'Send code' }).click();
  await page.getByLabel('Code').fill('123456');
  await page.getByRole('button', { name: 'Sign in' }).click();
}
