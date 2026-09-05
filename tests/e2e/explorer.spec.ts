import { test, expect } from '@playwright/test';

async function enter3D(page: import('@playwright/test').Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D' }).first().click();
  await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
  // Let the canvas/controls finish mounting before driving further interaction.
  await page.waitForTimeout(500);
}

// Each test below drives its own real WebGL context and starts fresh, by
// design: chaining many mode switches or room jumps in a single test compounds
// render cost on software-rendered/sandboxed GPUs (a real browser on real
// hardware doesn't have this problem) far more than the equivalent number of
// independent tests does.
test.describe('3D explorer', () => {
  test('opens with every core HUD control present', async ({ page }) => {
    await enter3D(page);

    await expect(page.getByRole('button', { name: 'Walk', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Dollhouse', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Floor Plan', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: /Reset View/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Day/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Evening/ })).toBeVisible();
    await expect(page.getByRole('button', { name: /Materials/i })).toBeVisible();
    await expect(page.getByRole('button', { name: /Rooms/i })).toBeVisible();
    await expect(page.getByRole('img', { name: 'Minimap' })).toBeVisible();
  });

  test('the floor-plan overlay never blocks the HUD mode switcher (regression)', async ({ page }) => {
    await enter3D(page);
    await page.getByRole('button', { name: 'Floor Plan', exact: true }).click();
    await expect(page.getByText('Floor Plan View')).toBeVisible();
    await page.getByRole('button', { name: 'Walk', exact: true }).click();
    await expect(page.getByText('Floor Plan View')).toHaveCount(0);
  });

  test('dollhouse mode is reachable and reflects its pressed state', async ({ page }) => {
    await enter3D(page);
    await page.getByRole('button', { name: 'Dollhouse', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Dollhouse', exact: true })).toHaveAttribute('aria-pressed', 'true');
  });

  test('jumping to a room from the Rooms navigator updates the minimap label', async ({ page }) => {
    await enter3D(page);
    await page.getByRole('button', { name: /Rooms/i }).click();
    await page.locator('#room-navigator-panel').getByRole('button', { name: /^MAMAD/ }).click();
    await expect(page.getByRole('img', { name: 'Minimap' })).toContainText('MAMAD');
  });

  test('a second, independent room jump also reaches its target', async ({ page }) => {
    await enter3D(page);
    await page.getByRole('button', { name: /Rooms/i }).click();
    await page.locator('#room-navigator-panel').getByRole('button', { name: /^Twin Bedroom/ }).click();
    await expect(page.getByRole('img', { name: 'Minimap' })).toContainText('Twin Bedroom');
  });

  test('exiting the explorer restores normal page scrolling', async ({ page }) => {
    await enter3D(page);

    const overflowWhileOpen = await page.evaluate(() => document.body.style.overflow);
    expect(overflowWhileOpen).toBe('hidden');

    await page.getByRole('button', { name: /Exit 3D/i }).click();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toHaveCount(0);

    const overflowAfterClose = await page.evaluate(() => document.body.style.overflow);
    expect(overflowAfterClose).not.toBe('hidden');

    await page.evaluate(() => window.scrollTo(0, 900));
    const scrollY = await page.evaluate(() => window.scrollY);
    expect(scrollY).toBeGreaterThan(0);
  });

  test('the help panel documents desktop and mobile controls', async ({ page }) => {
    await enter3D(page);
    await page.getByRole('button', { name: /Help/i }).click();
    await expect(page.getByText(/WASD/i)).toBeVisible();
    await expect(page.getByText(/joystick/i)).toBeVisible();
    await page.getByRole('button', { name: 'Got it' }).click();
    await expect(page.getByText(/Explorer Controls/i)).toHaveCount(0);
  });
});
