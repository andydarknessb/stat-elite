import type { Page } from '@playwright/test';

// the one place a spec opens the app at /: the sign-in screen (#152) changes this helper, not each spec
export async function openApp(page: Page) {
  await page.goto('/');
}
