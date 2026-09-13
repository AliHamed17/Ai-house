import { test, expect, type Page } from '@playwright/test';

// Mirrors explorer.spec.ts's own enter3D helper — kept local rather than
// shared/imported since these spec files intentionally stay independent
// (see explorer.spec.ts's own comment on why each test starts fresh).
async function enter3D(page: Page) {
  await page.goto('/');
  await page.getByRole('button', { name: 'Enter 3D' }).first().click();
  await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
  await page.waitForTimeout(500);
}

async function jumpToRoom(page: Page, roomButtonName: RegExp) {
  await page.getByRole('button', { name: /Rooms/i }).click();
  await page.locator('#room-navigator-panel').getByRole('button', { name: roomButtonName }).click();
}

// Furniture (textured floors/walls, procedural furniture meshes, and their
// click-to-shop hotspots) is new scene content added to every room in
// src/data/furniture.ts. Real in-scene click targeting isn't attempted here
// — consistent with every other hotspot in this codebase (door markers,
// room labels), navigation/interaction is always exercised through the DOM
// (Room Navigator, HUD) rather than raw WebGL canvas coordinates, since a
// software-rendered/sandboxed GPU makes precise 3D-projected clicks flaky in
// a way a real browser on real hardware wouldn't be. What matters here is
// that adding textured materials plus furniture meshes and their pointer
// event handlers to every room doesn't break rendering, navigation, or the
// MAMAD protected-room invariants that are already tested elsewhere.
test.describe('furnished rooms (textures + furniture)', () => {
  test('a furnished room (Living Room) renders with no console/page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await enter3D(page);
    await jumpToRoom(page, /^Living Room/);
    await expect(page.getByRole('img', { name: 'Minimap' })).toContainText('Living Room');
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test('MAMAD stays fully navigable with furniture present (protected-room regression)', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await enter3D(page);
    await jumpToRoom(page, /^MAMAD/);
    await expect(page.getByRole('img', { name: 'Minimap' })).toContainText('MAMAD');
    await page.waitForTimeout(500);

    expect(errors).toEqual([]);
  });

  test('Dollhouse mode still renders every room with textures and furniture with no errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (err) => errors.push(err.message));
    page.on('console', (msg) => {
      if (msg.type() === 'error') errors.push(msg.text());
    });

    await enter3D(page);
    await page.getByRole('button', { name: 'Dollhouse', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Dollhouse', exact: true })).toHaveAttribute('aria-pressed', 'true');
    await page.waitForTimeout(800);

    expect(errors).toEqual([]);
  });
});
