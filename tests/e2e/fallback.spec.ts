import { test, expect } from '@playwright/test';

// When WebGL is unavailable the explorer renders a 2D fallback. Because it
// mounts outside the fixed modal and locks body scroll, it must be fixed to
// the viewport — otherwise, opened from lower down the page, it would sit at
// the document origin (off-screen) and its Exit button would be unreachable.
test.describe('WebGL 2D fallback', () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const original = window.HTMLCanvasElement.prototype.getContext;
      // @ts-expect-error - narrowing the overloaded signature is unnecessary for the stub
      window.HTMLCanvasElement.prototype.getContext = function patched(type, ...args) {
        if (typeof type === 'string' && type.toLowerCase().includes('webgl')) return null;
        return original.call(this, type, ...args);
      };
    });
  });

  test('is reachable (Exit within the viewport) when opened after scrolling down', async ({ page }) => {
    await page.goto('/');
    await page.evaluate(() => window.scrollTo(0, Math.round(document.body.scrollHeight * 0.6)));
    await page.getByRole('button', { name: 'Enter 3D' }).first().click();

    await expect(page.getByText('House Explorer — 2D Mode')).toBeVisible();

    const exit = page.getByRole('button', { name: /^✕ Exit/ });
    await expect(exit).toBeInViewport();
    await exit.click();
    await expect(page.getByText('House Explorer — 2D Mode')).toHaveCount(0);
  });
});
