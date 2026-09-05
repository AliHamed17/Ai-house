import { test, expect } from '@playwright/test';

test.describe('AI Design Studio (demo mode)', () => {
  test('generates a concept image and reaches the completed state', async ({ page }) => {
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText('Demo mode — no API credentials')).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
  });

  test('the simulate-failure control reaches the failed state with a visible error', async ({ page }) => {
    await page.goto('/#ai-studio');
    // First generation reveals the demo-mode "simulate outcome" control.
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('select').filter({ hasText: 'Success' })).toBeVisible({ timeout: 10_000 });
    await page.locator('select').filter({ hasText: 'Success' }).selectOption('failure');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Failed' })).toBeVisible({ timeout: 10_000 });
  });

  test('the simulate-moderated control reaches the moderated state', async ({ page }) => {
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('select').filter({ hasText: 'Success' })).toBeVisible({ timeout: 10_000 });
    await page.locator('select').filter({ hasText: 'Success' }).selectOption('moderated');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Moderated' })).toBeVisible({ timeout: 10_000 });
  });

  test('cinematic clip output is only offered for the principal rooms', async ({ page }) => {
    await page.goto('/#ai-studio');
    await page.locator('select').first().selectOption('wc_guest');
    await expect(page.getByRole('button', { name: /Cinematic clip/i })).toBeDisabled();
    await page.locator('select').first().selectOption('living');
    await expect(page.getByRole('button', { name: /Cinematic clip/i })).toBeEnabled();
  });
});
