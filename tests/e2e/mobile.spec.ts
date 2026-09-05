import { test, expect } from '@playwright/test';

test.describe('Mobile experience', () => {
  test('the landing page has no horizontal overflow', async ({ page }) => {
    await page.goto('/');
    const { scrollWidth, clientWidth } = await page.evaluate(() => ({
      scrollWidth: document.documentElement.scrollWidth,
      clientWidth: document.documentElement.clientWidth,
    }));
    expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
  });

  test('the page can be scrolled on a touch viewport', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, 800));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test('tapping a room in the floor plan opens the 3D explorer with a working exit', async ({ page }) => {
    await page.goto('/#floor-plan');
    await page.locator('#floor-plan svg polygon').first().tap();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();

    // The exit control and HUD must both be reachable on a touch viewport.
    await expect(page.getByRole('button', { name: /Exit 3D/i })).toBeVisible();
    await page.getByRole('button', { name: /Exit 3D/i }).tap();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toHaveCount(0);

    // Page scrolling must resume after exiting.
    await page.evaluate(() => window.scrollTo(0, 400));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test('the virtual joystick appears once inside the 3D explorer', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter 3D' }).first().tap();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
    await expect(page.getByLabel(/^Move/i)).toBeVisible();
  });
});
