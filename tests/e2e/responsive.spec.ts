import { test, expect } from '@playwright/test';

const BREAKPOINTS = [
  { name: 'small mobile', width: 360, height: 740 },
  { name: 'tablet', width: 768, height: 1024 },
  { name: 'laptop', width: 1366, height: 800 },
  { name: 'wide desktop', width: 1920, height: 1080 },
];

test.describe('Responsive layout', () => {
  for (const bp of BREAKPOINTS) {
    test(`no horizontal overflow at ${bp.name} (${bp.width}px)`, async ({ page }) => {
      await page.setViewportSize({ width: bp.width, height: bp.height });
      await page.goto('/');
      const { scrollWidth, clientWidth } = await page.evaluate(() => ({
        scrollWidth: document.documentElement.scrollWidth,
        clientWidth: document.documentElement.clientWidth,
      }));
      expect(scrollWidth).toBeLessThanOrEqual(clientWidth + 1);
      await expect(page.getByRole('heading', { level: 1 })).toBeVisible();
    });
  }

  test('the 3D explorer fills the viewport at a small mobile size', async ({ page }) => {
    await page.setViewportSize({ width: 360, height: 740 });
    await page.goto('/');
    await page.getByRole('button', { name: 'Enter 3D' }).first().click();
    const dialog = page.getByRole('dialog', { name: /Interactive 3D house explorer/i });
    await expect(dialog).toBeVisible();
    const box = await dialog.boundingBox();
    expect(box?.width).toBeGreaterThanOrEqual(359);
    expect(box?.height).toBeGreaterThanOrEqual(739);
  });
});
