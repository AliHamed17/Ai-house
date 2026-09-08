import { test, expect, type Page } from '@playwright/test';

// Mirrors AIStudioPanel's own keyed-collection storage shape (a job's own
// jobId, or a submission's own idempotencyKey, as the record's key) rather
// than a single shared slot — see jobRecoveryId/submissionRecoveryId there.
async function writeRawRecoveryEntry(page: Page, entry: Record<string, unknown>) {
  await page.addInitScript((e) => {
    const id = e.kind === 'job' ? `job:${e.jobId}` : `submission:${e.idempotencyKey}`;
    localStorage.setItem('ai-studio:unresolved-generation', JSON.stringify({ [id]: e }));
  }, entry);
}

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

  test('a submit-response outage keeps the submission recoverable and locks room/output selection (regression)', async ({ page }) => {
    // The generate POST never gets a response back (a dropped connection),
    // even though a real server could have already accepted and billed it —
    // the submission must stay recoverable (never silently discarded), and
    // room/output selection must lock so an eventual result can't get
    // displayed or approved against a room switched to in the meantime.
    let blockGenerate = true;
    await page.route('**/api/nano-banana/generate', (route) => (blockGenerate ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();

    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();

    blockGenerate = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeEnabled();
  });

  test('a Higgsfield 504 (ambiguous submit timeout) also keeps the submission recoverable, not just a dropped connection (regression)', async ({ page }) => {
    // The route returns a normal, well-formed 504 response (not a dropped
    // connection) specifically when a live Higgsfield submit times out in a
    // way that may still have been accepted and billed (see isSubmitTimeout
    // in higgsfield.server.ts). That response DOES reach the client, so it
    // is easy to mistake for a definite failure — but it must be treated
    // exactly like a lost connection: recoverable, not a safe-to-retry-fresh
    // error.
    let simulateTimeout = true;
    await page.route('**/api/higgsfield/generate', (route) => {
      if (!simulateTimeout) return route.continue();
      return route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({
          error:
            'The request to Higgsfield timed out. It may have already been accepted and could still be running (and billed) — please wait a minute and check before submitting again, to avoid a possible duplicate charge.',
        }),
      });
    });

    await page.goto('/#ai-studio');
    await page.locator('select').first().selectOption('living');
    await page.getByRole('button', { name: /Cinematic clip/i }).click();
    await expect(page.getByRole('button', { name: /Generate cinematic clip/i })).toBeEnabled({ timeout: 10_000 });
    await page.getByRole('button', { name: /Generate cinematic clip/i }).click();

    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Generate cinematic clip/i })).toBeDisabled();

    simulateTimeout = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeEnabled();
  });

  test('a recoverable submission survives a page reload, not just staying in memory (regression)', async ({ page }) => {
    // recoverableSubmission is plain React state — a reload wipes it unless
    // it is also mirrored to localStorage (see writeRecoveryEntry in
    // AIStudioPanel). Without that, closing or reloading the tab after a
    // lost-connection submit would silently forget a possibly-billed job.
    let blockGenerate = true;
    await page.route('**/api/nano-banana/generate', (route) => (blockGenerate ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    await page.reload();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeDisabled();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();

    blockGenerate = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeEnabled();
  });

  test('a recoverable (status-polling-exhausted) job survives a page reload (regression)', async ({ page }) => {
    let blockStatus = true;
    await page.route('**/api/generation/status/**', (route) => (blockStatus ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/Lost connection while checking on a generation/i)).toBeVisible({ timeout: 15_000 });

    await page.reload();
    await expect(page.getByText(/Lost connection while checking on a generation/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();

    blockStatus = false;
    await page.getByRole('button', { name: 'Resume checking status' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
  });

  test('an expired approved source (410) is never treated as recoverable, and clears so the next attempt uses a fresh source (regression)', async ({ page }) => {
    // Unlike a lost connection or a Higgsfield timeout, a 410 is a definite,
    // pre-billing failure (see SOURCE_EXPIRED_MESSAGE) — nothing to resume,
    // and retrying the identical request would just fail the same way
    // forever unless the stale approvedSource is cleared client-side.
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    await page.getByRole('button', { name: 'Approve' }).click();
    await expect(page.getByRole('button', { name: '✓ Approved' })).toBeVisible();

    let requestCount = 0;
    let thirdRequestSourcePath: string | undefined;
    await page.route('**/api/nano-banana/generate', (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        return route.fulfill({
          status: 410,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'The approved source image has expired from the server cache. Please regenerate and re-approve it, then try again.',
          }),
        });
      }
      thirdRequestSourcePath = route.request().postDataJSON()?.sourceAssetPath;
      return route.continue();
    });

    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/expired from the server cache/i)).toBeVisible({ timeout: 10_000 });
    // A definite failure — not recoverable, and does not lock selection.
    await expect(page.getByRole('button', { name: 'Resume submission' })).toHaveCount(0);
    await expect(page.locator('select').first()).toBeEnabled();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();

    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    // The stale approvedSource (a /api/generation/result/... path) must not
    // have been reused — the fresh attempt falls back to the room's static
    // evidence frame instead.
    expect(thirdRequestSourcePath).toBe('/evidence/frames/00-00-16_open-social-zone.jpg');
  });

  test('a rate limit (429) on Resume preserves the recoverable submission instead of discarding it (regression)', async ({ page }) => {
    // A 429 on a Resume click means only that THIS attempt was throttled —
    // it says nothing about whether the original ambiguous submission it
    // was resuming succeeded or failed. Treating it as conclusive would
    // discard the only way back to that submission.
    let mode: 'drop' | 'rate-limited' | 'ok' = 'drop';
    await page.route('**/api/nano-banana/generate', (route) => {
      if (mode === 'drop') return route.abort();
      if (mode === 'rate-limited') {
        return route.fulfill({
          status: 429,
          headers: { 'Retry-After': '5' },
          contentType: 'application/json',
          body: JSON.stringify({ error: 'Too many generation requests. Please wait a moment and try again.' }),
        });
      }
      return route.continue();
    });

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    mode = 'rate-limited';
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.getByText(/Too many attempts.*wait 5s/i)).toBeVisible({ timeout: 10_000 });
    // Still recoverable — the banner must not have been lost, and selection
    // must still be locked, exactly as before the rate-limited click.
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();
    await expect(page.locator('select').first()).toBeDisabled();

    mode = 'ok';
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toBeEnabled();
  });

  test('an ambiguous (504-timeout) submission recovery entry older than the server\'s AMBIGUOUS_TTL_MS is not offered after reload (regression)', async ({ page }) => {
    // idempotency.server's AMBIGUOUS_TTL_MS is 60 minutes — a persisted
    // recovery entry older than that (minus a small safety margin) could be
    // resuming a reservation the server has already forgotten, which would
    // silently start a genuinely new, separately billed submission instead
    // of reconciling to the original one.
    const staleEntry = {
      kind: 'submission',
      ambiguous: true,
      idempotencyKey: 'stale-ambiguous-recovery-key',
      endpoint: '/api/higgsfield/generate',
      body: { roomId: 'living', idempotencyKey: 'stale-ambiguous-recovery-key', simulate: 'success' },
      roomId: 'living',
      outputType: 'video',
      createdAt: Date.now() - 56 * 60_000,
    };
    await writeRawRecoveryEntry(page, staleEntry);

    await page.goto('/#ai-studio');
    await expect(page.getByRole('button', { name: 'Resume submission' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
  });

  test('an ambiguous (504-timeout) submission recovery entry still within AMBIGUOUS_TTL_MS is offered after reload (baseline for the ceiling above)', async ({ page }) => {
    const freshEntry = {
      kind: 'submission',
      ambiguous: true,
      idempotencyKey: 'fresh-ambiguous-recovery-key',
      endpoint: '/api/higgsfield/generate',
      body: { roomId: 'living', idempotencyKey: 'fresh-ambiguous-recovery-key', simulate: 'success' },
      roomId: 'living',
      outputType: 'video',
      createdAt: Date.now() - 50 * 60_000,
    };
    await writeRawRecoveryEntry(page, freshEntry);

    await page.goto('/#ai-studio');
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();
  });

  test('a non-ambiguous (network-failure) submission recovery entry does NOT get the longer ambiguous ceiling (regression)', async ({ page }) => {
    // A network-level failure never upgrades the server-side reservation —
    // if the request actually reached the server and succeeded, that
    // reservation is bounded by the ordinary (short) TTL_MS, not
    // AMBIGUOUS_TTL_MS. 12 minutes is past the ordinary ceiling but well
    // within the ambiguous one — this is exactly the gap where treating
    // every 'submission' entry the same way risked a silent double-billed
    // resubmission.
    const staleOrdinaryEntry = {
      kind: 'submission',
      ambiguous: false,
      idempotencyKey: 'stale-ordinary-recovery-key',
      endpoint: '/api/nano-banana/generate',
      body: { roomId: 'living', idempotencyKey: 'stale-ordinary-recovery-key', simulate: 'success' },
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now() - 12 * 60_000,
    };
    await writeRawRecoveryEntry(page, staleOrdinaryEntry);

    await page.goto('/#ai-studio');
    await expect(page.getByRole('button', { name: 'Resume submission' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
  });

  test('a non-ambiguous (network-failure) submission recovery entry within its own (shorter) ceiling is still offered (baseline for the ceiling above)', async ({ page }) => {
    const freshOrdinaryEntry = {
      kind: 'submission',
      ambiguous: false,
      idempotencyKey: 'fresh-ordinary-recovery-key',
      endpoint: '/api/nano-banana/generate',
      body: { roomId: 'living', idempotencyKey: 'fresh-ordinary-recovery-key', simulate: 'success' },
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now() - 5 * 60_000,
    };
    await writeRawRecoveryEntry(page, freshOrdinaryEntry);

    await page.goto('/#ai-studio');
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();
  });

  test('a job-recovery entry uses its own, more generous ceiling than a submission entry (regression)', async ({ page }) => {
    // Checking on a job is a read (never resubmits or bills anything), so it
    // is safe to keep offering for much longer than a submission entry —
    // this proves the ceiling is genuinely keyed by entry kind, not a single
    // value that happens to cover both.
    const jobEntry = {
      kind: 'job',
      jobId: 'recovery-ceiling-test-job-id',
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now() - 2 * 60 * 60_000,
    };
    await writeRawRecoveryEntry(page, jobEntry);

    await page.goto('/#ai-studio');
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toBeVisible();
  });

  test('a fresh submission is recoverable even if the page reloads before the request itself ever settles (regression)', async ({ page }) => {
    // The request never resolves at all here — simulating the browser
    // context disappearing (a reload, a crash, a closed tab) WHILE the POST
    // is still genuinely in flight, before the client has any chance to
    // learn the outcome one way or the other (no response, no thrown
    // error). Recovery state written only after the fetch settles would
    // leave no trace anywhere — not even in memory — that this submission
    // ever happened, even though the server may have already accepted (and
    // could still be running, or have already run and billed) it.
    await page.route('**/api/nano-banana/generate', () => new Promise(() => {}));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    // Give the click's fetch a moment to actually start before reloading.
    await page.waitForTimeout(500);
    await page.reload();

    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();
    await expect(page.locator('select').first()).toBeDisabled();

    // Confirm it isn't just a stranded banner — unblocking and resuming
    // still completes normally.
    await page.unroute('**/api/nano-banana/generate');
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
  });

  test('two independently-tracked recovery entries do not clobber or destroy each other in storage (regression)', async ({ page }) => {
    // Entries share one origin-wide localStorage key. Before they were keyed
    // by their own generation's identity (a job's jobId, or a submission's
    // idempotencyKey), either one's write — or either one's terminal-state
    // clear — could silently overwrite or destroy the OTHER's still-active
    // record. (With the live cross-tab sync this session also added, a
    // SECOND tab normally can't even reach this state via its own Generate
    // click anymore — see the "learns LIVE" test above — so this seeds two
    // entries directly to exercise the storage layer's own keying in
    // isolation, the same way it could still arise, e.g., from a genuinely
    // concurrent write on a slow/throttled tab the live sync hasn't reached
    // yet.)
    await page.goto('/#ai-studio');

    const olderEntry = {
      kind: 'job',
      jobId: 'untouched-sibling-job-id',
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now() - 60_000,
    };
    const newerEntry = {
      kind: 'submission',
      ambiguous: false,
      idempotencyKey: 'active-entry-key',
      endpoint: '/api/nano-banana/generate',
      body: { roomId: 'living', styleVariant: 'warm-oak', simulate: 'success', idempotencyKey: 'active-entry-key' },
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now(),
    };
    // A one-time page.evaluate (not addInitScript, which would re-fire and
    // resurrect this seed on the later reload below) writing both entries
    // in one merged blob, matching the app's own keyed-collection shape.
    await page.evaluate(
      ({ older, newer }) => {
        const asJob = older as { kind: string; jobId: string };
        const asSubmission = newer as { kind: string; idempotencyKey: string };
        const olderId = `job:${asJob.jobId}`;
        const newerId = `submission:${asSubmission.idempotencyKey}`;
        localStorage.setItem('ai-studio:unresolved-generation', JSON.stringify({ [olderId]: older, [newerId]: newer }));
      },
      { older: olderEntry, newer: newerEntry },
    );

    await page.route('**/api/nano-banana/generate', (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    // Reload so the mount effect reads the seeded storage — it restores the
    // newer (submission) entry as this tab's own tracked one.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();

    const storedBeforeResolve = await page.evaluate(() => localStorage.getItem('ai-studio:unresolved-generation'));
    expect(Object.keys(JSON.parse(storedBeforeResolve ?? '{}'))).toHaveLength(2);

    // Resolving the tracked entry to a definite, terminal outcome must clear
    // ONLY its own key.
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.getByText('boom')).toBeVisible({ timeout: 10_000 });

    const storedAfterResolve = await page.evaluate(() => localStorage.getItem('ai-studio:unresolved-generation'));
    expect(Object.keys(JSON.parse(storedAfterResolve ?? '{}'))).toEqual(['job:untouched-sibling-job-id']);

    // And the untouched sibling is genuinely usable, not just inert JSON
    // left behind — a reload restores its own recovery banner.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toBeVisible();
  });

  test('a tab already open learns LIVE that another tab has an outstanding generation, and blocks its own Generate (regression)', async ({
    page,
    context,
  }) => {
    // The mount-time recovery restore only ever runs once — a tab that was
    // ALREADY open before a genuinely different tab starts its own
    // generation would otherwise never learn one now exists, leaving its
    // Generate button wrongly enabled and free to start a second,
    // separately billed submission for the same default room the instant
    // it's clicked.
    const page2 = await context.newPage();
    await page2.route('**/api/nano-banana/generate', () => new Promise(() => {}));
    await page2.goto('/#ai-studio');
    await expect(page2.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();

    await page.route('**/api/nano-banana/generate', (route) => route.abort());
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // Tab 2, still on its original mount (never reloaded), must pick this up
    // live via the browser's `storage` event and disable its own Generate.
    await expect(page2.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();
  });

  test('abandoning a recoverable job clears its recovery record and unlocks Generate (regression)', async ({ page }) => {
    // A permanently uncheckable job (e.g. provider credentials removed after
    // submission) would otherwise leave Generate disabled forever — Resume
    // just fails the same way every time, and the 24h ceiling is only
    // evaluated at mount. Abandon is the only escape hatch for that case.
    await page.route('**/api/generation/status/**', (route) => route.abort());
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/Lost connection while checking on a generation/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Abandon and start over' }).click();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.locator('select').first()).toBeEnabled();

    // Not just hidden in memory — actually gone from storage, or a reload
    // would resurrect the same deadlock.
    const stored = await page.evaluate(() => localStorage.getItem('ai-studio:unresolved-generation'));
    expect(stored).toBeNull();
  });

  test('abandoning a recoverable submission clears its recovery record and unlocks Generate (regression)', async ({ page }) => {
    await page.route('**/api/nano-banana/generate', (route) => route.abort());
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Abandon and start over' }).click();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.locator('select').first()).toBeEnabled();

    const stored = await page.evaluate(() => localStorage.getItem('ai-studio:unresolved-generation'));
    expect(stored).toBeNull();
  });
});
