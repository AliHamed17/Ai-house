import { test, expect } from '@playwright/test';

test.describe('Interactive floor plan', () => {
  test('hovering a room reveals its dimensions and confidence', async ({ page }) => {
    await page.goto('/#floor-plan');
    const firstPolygon = page.locator('#floor-plan svg polygon').first();
    await firstPolygon.hover();
    await expect(page.getByText(/confidence/i).first()).toBeVisible();
  });

  test('the MAMAD room is visually flagged as protected', async ({ page }) => {
    await page.goto('/#floor-plan');
    const mamadPolygon = page.locator('#floor-plan svg polygon[aria-label*="MAMAD"]');
    await expect(mamadPolygon).toHaveCount(1);
    await mamadPolygon.hover();
    await expect(page.getByText(/protected room/i).first()).toBeVisible();
  });

  test('activating a room from the floor plan opens the 3D explorer', async ({ page }) => {
    await page.goto('/#floor-plan');
    await page.locator('#floor-plan svg polygon').first().click();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
  });
});
