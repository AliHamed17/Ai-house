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

  test('video generation stays gated (never silently unblocked) while the provider-mode probe cannot confirm, and Check again recovers it (regression)', async ({ page }) => {
    // Force /api/generation/mode to keep failing so the probe can never
    // genuinely confirm the deployment's mode, exercising the safe-default
    // fallback path — the video-approval gate must default to *requiring*
    // approval while unconfirmed, never silently relax it — and its manual
    // "Check again" recovery action.
    let blockProbe = true;
    await page.route('**/api/generation/mode', (route) => (blockProbe ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.locator('select').first().selectOption('living');
    await page.getByRole('button', { name: /Cinematic clip/i }).click();

    await expect(page.getByText(/Still confirming whether cinematic clips are live-billed/i)).toBeVisible({ timeout: 15_000 });
    // The button's own label reads "Checking provider status..." until the
    // automatic retries exhaust (a few seconds, by design — see the probe
    // effect), then switches to "Generate cinematic clip" while staying
    // disabled throughout; allow time for that transition.
    await expect(page.getByRole('button', { name: /Generate cinematic clip/i })).toBeDisabled({ timeout: 10_000 });

    blockProbe = false;
    await page.getByRole('button', { name: 'Check again' }).click();
    await expect(page.getByText(/Still confirming whether cinematic clips are live-billed/i)).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Generate cinematic clip/i })).toBeEnabled();
  });

  test('a demo cinematic clip completes and renders as an animated still, never a broken <video> element (regression)', async ({ page }) => {
    await page.goto('/#ai-studio');
    await page.locator('select').first().selectOption('living');
    await page.getByRole('button', { name: /Cinematic clip/i }).click();
    await expect(page.getByRole('button', { name: /Generate cinematic clip/i })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('button', { name: /Generate cinematic clip/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    // A mock job's resultUrl is never a real video, regardless of its shape
    // (see isPlayableVideo) — it must always get the Ken-Burns-pan <Image>
    // treatment, never mount a <video> tag pointed at a non-video URL.
    await expect(page.locator('video')).toHaveCount(0);
    await expect(page.getByText(/Demo mode simulates the cinematic move/i)).toBeVisible();
  });

  test('a status-polling outage keeps the job recoverable instead of losing it (regression)', async ({ page }) => {
    // Every status poll fails from the start, exhausting the retry budget
    // (see startPolling) — the job must stay recoverable rather than being
    // silently dropped, and Generate must stay disabled (never risking a
    // duplicate submission) until the visitor explicitly resumes it.
    let blockStatus = true;
    await page.route('**/api/generation/status/**', (route) => (blockStatus ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();

    await expect(page.getByText(/Lost connection while checking on a generation/i)).toBeVisible({ timeout: 15_000 });
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();

    blockStatus = false;
    await page.getByRole('button', { name: 'Resume checking status' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
  });
});
