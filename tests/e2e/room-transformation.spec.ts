import { test, expect } from '@playwright/test';

/**
 * The transformation section's contract is that the film and the 3D room are
 * two views of ONE design state. These tests exercise that contract through
 * the DOM only — same convention as furniture-hotspots.spec.ts, since raw
 * WebGL canvas coordinates are flaky under a software renderer.
 */

test.describe('room transformation section', () => {
  test('renders the stage list and scrub control with no page errors', async ({ page }) => {
    const errors: string[] = [];
    page.on('pageerror', (e) => errors.push(String(e)));
    page.on('console', (m) => {
      if (m.type() === 'error') errors.push(m.text());
    });

    await page.goto('/');
    const section = page.locator('#transformation');
    await section.scrollIntoViewIfNeeded();
    await expect(section.getByRole('heading', { name: /bare shell to finished kitchen/i })).toBeVisible();
    await expect(section.getByRole('slider', { name: /scrub the transformation/i })).toBeVisible();

    // The first and last beats should both be reachable from the stage list.
    await expect(section.getByRole('button', { name: /Bare shell/ })).toBeVisible();
    await expect(section.getByRole('button', { name: /Warm reveal/ })).toBeVisible();

    expect(errors).toEqual([]);
  });

  test('picking a stage updates the caption, so the sequence is usable without playback', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#transformation');
    await section.scrollIntoViewIfNeeded();

    await section.getByRole('button', { name: /Island/ }).click();
    await expect(section.getByText(/the room gains real depth/i)).toBeVisible();

    await section.getByRole('button', { name: /Warm reveal/ }).click();
    await expect(section.getByText(/integrated 2700K lighting/i)).toBeVisible();
  });

  test('"Enter this moment in 3D" opens the explorer showing that same stage', async ({ page }) => {
    await page.goto('/');
    const section = page.locator('#transformation');
    await section.scrollIntoViewIfNeeded();

    await section.getByRole('button', { name: /Suspended shelf/ }).click();
    await section.getByRole('button', { name: /Enter this moment in 3D/i }).click();

    const dialog = page.getByRole('dialog', { name: /Interactive 3D house explorer/i });
    await expect(dialog).toBeVisible();
    // The explorer must say it is showing a part-built room, and offer the
    // way back — entering mid-build silently would read as missing furniture.
    await expect(page.getByText(/Showing the kitchen mid-build/i)).toBeVisible();
    await expect(page.getByText(/suspended-feature/)).toBeVisible();

    await page.getByRole('button', { name: /Show finished kitchen/i }).click();
    await expect(page.getByText(/Showing the kitchen mid-build/i)).toHaveCount(0);
  });

  test('the stage drives the room lighting, so the day/evening toggle is not silently overridden', async ({ page }) => {
    // The handoff preserves the whole moment, lighting included: the explorer
    // renders the film's own authored rig (StageLighting) rather than
    // collapsing four states into the viewer's day/evening presets. The
    // toggle therefore cannot take effect while a stage is showing, so it is
    // disabled and explained instead of left live and ignored.
    await page.goto('/');
    const section = page.locator('#transformation');
    await section.scrollIntoViewIfNeeded();
    await section.getByRole('button', { name: /Warm reveal/ }).click();
    await section.getByRole('button', { name: /Enter this moment in 3D/i }).click();

    await expect(page.getByText(/Showing the kitchen mid-build/i)).toBeVisible();
    await expect(page.getByRole('button', { name: /☀ Day/ })).toBeDisabled();
    await expect(page.getByRole('button', { name: /☾ Evening/ })).toBeDisabled();

    // Clearing the stage hands lighting back to the visitor.
    await page.getByRole('button', { name: /Show finished kitchen/i }).click();
    await expect(page.getByRole('button', { name: /☀ Day/ })).toBeEnabled();
    await expect(page.getByRole('button', { name: /☾ Evening/ })).toBeEnabled();
  });

  test('an ordinary explorer entry afterwards opens the FINISHED kitchen, not the mid-build one (regression)', async ({ page }) => {
    // The stage lives in a module-level store that outlives the explorer's
    // unmount, so entering through the film and closing left it set. A later
    // entry through the header/hero/floor plan then reopened the kitchen
    // partially built, mid-build banner and all, from a click that never
    // asked for that handoff.
    await page.goto('/');
    const section = page.locator('#transformation');
    await section.scrollIntoViewIfNeeded();
    await section.getByRole('button', { name: /Suspended shelf/ }).click();
    await section.getByRole('button', { name: /Enter this moment in 3D/i }).click();
    await expect(page.getByText(/Showing the kitchen mid-build/i)).toBeVisible();

    // Leave, then come back the ordinary way — through the floor plan, which
    // never asks for a stage.
    await page.getByRole('button', { name: /Exit 3D/i }).click();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toHaveCount(0);

    await page.locator('#floor-plan svg polygon').first().click();
    await expect(page.getByRole('dialog', { name: /Interactive 3D house explorer/i })).toBeVisible();
    await expect(page.getByText(/Showing the kitchen mid-build/i)).toHaveCount(0);
  });

  test('never autoplays for a visitor who asked for reduced motion (regression)', async ({ browser }) => {
    // This has been wrong twice: first because the preference was read from a
    // store only the 3D explorer populates (and the explorer is not mounted on
    // the landing page), then because enabling it mid-playback returned early
    // without pausing. The CSS reduced-motion rule does not pause video, so
    // nothing else catches either case.
    const context = await browser.newContext({ reducedMotion: 'reduce' });
    const page = await context.newPage();
    await page.goto('/');
    const section = page.locator('#transformation');
    await section.scrollIntoViewIfNeeded();
    await page.waitForTimeout(1500);

    const paused = await section.locator('video').evaluate((v: HTMLVideoElement) => v.paused);
    expect(paused, 'the transformation video must not autoplay under reduced motion').toBe(true);

    // The sequence must still be fully usable without motion: the stage list
    // and captions carry the same information.
    await section.getByRole('button', { name: /Warm reveal/ }).click();
    await expect(section.getByText(/integrated 2700K lighting/i)).toBeVisible();
    await context.close();
  });

  test('the published master video and poster are actually served', async ({ page }) => {
    for (const asset of [
      '/transformation/kitchen-transformation.mp4',
      '/transformation/kitchen-transformation-poster.jpg',
      '/transformation/stages/warm-reveal.jpg',
    ]) {
      const response = await page.request.get(asset);
      expect(response.status(), `${asset} should be served`).toBe(200);
      expect(Number(response.headers()['content-length'] ?? '1')).toBeGreaterThan(0);
    }
  });

  test('the manifest endpoint reports a valid, contiguous sequence', async ({ page }) => {
    const response = await page.request.get('/api/transformation/manifest');
    expect(response.status()).toBe(200);
    const manifest = await response.json();
    expect(manifest.valid).toBe(true);
    expect(manifest.problems).toEqual([]);
    expect(manifest.durationSec).toBe(13.37);
    // Objects accumulate and are never removed.
    let previous = -1;
    for (const stage of manifest.stages) {
      expect(stage.visibleFurnitureIds.length).toBeGreaterThanOrEqual(previous);
      previous = stage.visibleFurnitureIds.length;
    }
  });

  test('the clip route never starts a generation without an explicit request', async ({ page }) => {
    // GET only describes the plan — it must not submit anything.
    const plan = await page.request.get('/api/transformation/clip');
    expect(plan.status()).toBe(200);
    const body = await plan.json();
    expect(Array.isArray(body.clips)).toBe(true);
    expect(body.clips.length).toBeGreaterThan(0);
    for (const clip of body.clips) {
      // Every clip animates FROM a published still and forbids change.
      expect(clip.sourceAssetPath).toMatch(/^\/transformation\/stages\//);
      expect(clip.prompt).toMatch(/must not move/i);
    }

    // A POST naming a stage that does not introduce objects is rejected.
    const bad = await page.request.post('/api/transformation/clip', {
      data: { stageId: 'dusk', idempotencyKey: 'test-key-12345678' },
    });
    expect(bad.status()).toBe(400);
  });
});
