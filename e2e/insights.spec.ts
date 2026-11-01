import { expect, test } from '@playwright/test';

test('the Insights tab opens with no Games and says nothing stands out', async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Athlete name').fill('Casey');
  await page.getByRole('button', { name: 'Add Athlete' }).click();

  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible();
  await expect(page.getByText('Nothing stands out in the last 5 Games.')).toBeVisible();
});
