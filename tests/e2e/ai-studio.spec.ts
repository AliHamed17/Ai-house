import { test, expect, type Page } from '@playwright/test';

// Mirrors AIStudioPanel's own per-entry storage shape: each entry lives under
// its own key (this prefix plus its own id — a job's jobId, or a
// submission's idempotencyKey — see jobRecoveryId/submissionRecoveryId/
// recoveryStorageKey there), never sharing one key's JSON blob with any
// other entry.
const RECOVERY_STORAGE_PREFIX = 'ai-studio:unresolved-generation:';

async function writeRawRecoveryEntry(page: Page, entry: Record<string, unknown>) {
  await page.addInitScript(
    ({ e, prefix }) => {
      const id = e.kind === 'job' ? `job:${e.jobId}` : `submission:${e.idempotencyKey}`;
      localStorage.setItem(`${prefix}${id}`, JSON.stringify(e));
    },
    { e: entry, prefix: RECOVERY_STORAGE_PREFIX },
  );
}

// Every currently-stored recovery entry's own id (the part after the shared
// prefix) — replaces reading one shared key's JSON blob and inspecting its
// keys, since each entry is now its own independent localStorage key.
async function recoveryEntryIds(page: Page): Promise<string[]> {
  return page.evaluate((prefix) => {
    const ids: string[] = [];
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i);
      if (key?.startsWith(prefix)) ids.push(key.slice(prefix.length));
    }
    return ids;
  }, RECOVERY_STORAGE_PREFIX);
}

// The raw createdAt persisted under one specific entry id (e.g.
// 'submission:some-key'), or null if nothing is stored there.
async function readRecoveryEntryCreatedAt(page: Page, id: string): Promise<number | null> {
  return page.evaluate(
    ({ id, prefix }) => {
      const raw = localStorage.getItem(`${prefix}${id}`);
      if (!raw) return null;
      return (JSON.parse(raw) as { createdAt: number }).createdAt;
    },
    { id, prefix: RECOVERY_STORAGE_PREFIX },
  );
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

  test('a submission recovery banner left open past its own staleness ceiling refuses to Resume (regression)', async ({ page }) => {
    // recoverableSubmission is plain React state with no timestamp of its
    // own, so a tab that leaves this banner open longer than the PERSISTED
    // entry's own ceiling — well past the point the server's idempotency
    // reservation could already be gone — used to still POST it on Resume,
    // risking a second, separately billed submission. Age the persisted
    // entry directly (no reload — a reload's own mount-time read would
    // correctly prune it, which isn't what this is testing) so the banner
    // stays showing while the click-time re-check is what must catch it.
    let blockGenerate = true;
    await page.route('**/api/nano-banana/generate', (route) => (blockGenerate ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // Past even the longer (ambiguous, 55-minute) ceiling, so this is stale
    // regardless of which ambiguous flag this particular entry carries.
    await page.evaluate((prefix) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(`${prefix}submission:`)) continue;
        const entry = JSON.parse(localStorage.getItem(key)!);
        entry.createdAt = Date.now() - 56 * 60_000;
        localStorage.setItem(key, JSON.stringify(entry));
      }
    }, RECOVERY_STORAGE_PREFIX);

    // Unblock the route — if the fix were absent, Resume would still
    // succeed here, the exact silent-double-submission risk this closes.
    blockGenerate = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();

    await expect(page.getByText(/expired/i)).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toHaveCount(0);
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.locator('select').first()).toBeEnabled();
    expect(await recoveryEntryIds(page)).toEqual([]);
  });

  test('a stale submission recovery, once resumed-and-found-expired, adopts a remaining sibling instead of unlocking Generate (regression)', async ({ page }) => {
    // readAllRecoveryEntries prunes the expired entry as a side effect of
    // the very read handleResumeSubmission uses to check staleness — but
    // that's a same-document write, which never fires this tab's own
    // storage listener. Without also re-checking what's left, a genuinely
    // different, still-outstanding sibling entry would stay unadopted and
    // Generate would incorrectly re-enable while it's still unresolved.
    let blockGenerate = true;
    await page.route('**/api/nano-banana/generate', (route) => (blockGenerate ? route.abort() : route.continue()));

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // A genuinely different, still-outstanding job entry, well within ITS
    // OWN recovery ceiling.
    await page.evaluate((prefix) => {
      localStorage.setItem(
        `${prefix}job:sibling-still-outstanding-job-id`,
        JSON.stringify({ kind: 'job', jobId: 'sibling-still-outstanding-job-id', roomId: 'living', outputType: 'image', createdAt: Date.now() }),
      );
    }, RECOVERY_STORAGE_PREFIX);

    // Age THIS tab's own tracked submission past even the longer ceiling.
    await page.evaluate((prefix) => {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key?.startsWith(`${prefix}submission:`)) continue;
        const entry = JSON.parse(localStorage.getItem(key)!);
        entry.createdAt = Date.now() - 56 * 60_000;
        localStorage.setItem(key, JSON.stringify(entry));
      }
    }, RECOVERY_STORAGE_PREFIX);

    blockGenerate = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();

    await expect(page.getByText(/expired/i)).toBeVisible({ timeout: 10_000 });
    // The sibling must be surfaced in its place — Generate stays disabled
    // and ITS OWN recovery banner comes up, not silently dropped.
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();
    expect(await recoveryEntryIds(page)).toEqual(['job:sibling-still-outstanding-job-id']);
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

  test('a 428 (server-side live-run confirmation required) is never treated as recoverable, and does not lock out a fresh attempt (regression)', async ({ page }) => {
    // The server returns this when its own demoMode resolution disagrees
    // with what this tab's cached mode probe believed (see
    // LIVE_RUN_NOT_CONFIRMED_MESSAGE) — nothing was billed, so like a 410
    // this is a definite, pre-billing failure with nothing to resume.
    let requestCount = 0;
    await page.route('**/api/nano-banana/generate', (route) => {
      requestCount += 1;
      if (requestCount === 1) {
        return route.fulfill({
          status: 428,
          contentType: 'application/json',
          body: JSON.stringify({
            error: 'This request would start a live, billed generation, but no cost confirmation was received for it. Please try again.',
          }),
        });
      }
      return route.continue();
    });

    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/no cost confirmation was received/i)).toBeVisible({ timeout: 10_000 });
    // A definite failure — not recoverable, and does not lock selection.
    await expect(page.getByRole('button', { name: 'Resume submission' })).toHaveCount(0);
    await expect(page.locator('select').first()).toBeEnabled();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();

    // Not a permanent lockout — a later attempt (once the deployment's mode
    // is genuinely reconciled) still completes normally.
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
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

  test('a resume attempt that also fails preserves the ORIGINAL entry\'s timestamp instead of restamping to now (regression)', async ({ page }) => {
    // The server's idempotency reservation clock starts when the original
    // request first arrives, not when a later resume happens to fail — so
    // submitOnce must carry the true original createdAt through a failed
    // resume rather than computing a fresh one. Getting this wrong would let
    // a resume, offered because the persisted entry looked young enough,
    // silently reset the client's own clock to "now" — making a still-later
    // resume look freshly valid long after the server's real (much shorter)
    // TTL has actually expired, risking a second, separately billed
    // submission at that point.
    const originalCreatedAt = Date.now() - 5 * 60_000;
    const idempotencyKey = 'resume-preserves-original-timestamp-key';
    const staleOriginalEntry = {
      kind: 'submission',
      ambiguous: false,
      idempotencyKey,
      endpoint: '/api/nano-banana/generate',
      body: { roomId: 'living', idempotencyKey, simulate: 'success' },
      roomId: 'living',
      outputType: 'image',
      createdAt: originalCreatedAt,
    };
    await writeRawRecoveryEntry(page, staleOriginalEntry);

    // This resume attempt also fails at the network level (the same
    // ambiguous outcome as the original) — the exact case where submitOnce
    // re-writes the entry rather than leaving it untouched.
    await page.route('**/api/nano-banana/generate', (route) => route.abort());
    await page.goto('/#ai-studio');
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();

    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.getByText(/Could not reach the generation service/i)).toBeVisible({ timeout: 10_000 });

    const persistedCreatedAt = await readRecoveryEntryCreatedAt(page, `submission:${idempotencyKey}`);
    expect(persistedCreatedAt).toBe(originalCreatedAt);
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
    // resurrect this seed on the later reload below) writing each entry
    // under its own key, matching the app's own per-entry storage shape.
    await page.evaluate(
      ({ older, newer, prefix }) => {
        const asJob = older as { kind: string; jobId: string };
        const asSubmission = newer as { kind: string; idempotencyKey: string };
        localStorage.setItem(`${prefix}job:${asJob.jobId}`, JSON.stringify(older));
        localStorage.setItem(`${prefix}submission:${asSubmission.idempotencyKey}`, JSON.stringify(newer));
      },
      { older: olderEntry, newer: newerEntry, prefix: RECOVERY_STORAGE_PREFIX },
    );

    await page.route('**/api/nano-banana/generate', (route) =>
      route.fulfill({ status: 502, contentType: 'application/json', body: JSON.stringify({ error: 'boom' }) }),
    );

    // Reload so the mount effect reads the seeded storage — it restores the
    // newer (submission) entry as this tab's own tracked one.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();

    expect(await recoveryEntryIds(page)).toHaveLength(2);

    // Resolving the tracked entry to a definite, terminal outcome must clear
    // ONLY its own key.
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.getByText('boom')).toBeVisible({ timeout: 10_000 });

    expect(await recoveryEntryIds(page)).toEqual(['job:untouched-sibling-job-id']);

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

  test('abandoning a recoverable job unlocks Generate locally without ever deleting the shared record (regression)', async ({ page }) => {
    // A permanently uncheckable job (e.g. provider credentials removed after
    // submission) would otherwise leave Generate disabled forever — Resume
    // just fails the same way every time, and the 24h ceiling is only
    // evaluated at mount. Abandon is the only escape hatch for that case.
    // It must stay purely local, though: the underlying provider job may
    // still be running (and already billed), and a completely different tab
    // may have adopted this exact entry and still depend on it (see
    // abandonRecoveryEntry in AIStudioPanel) — only a genuine terminal
    // settlement is allowed to remove the shared storage record.
    await page.route('**/api/generation/status/**', (route) => route.abort());
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/Lost connection while checking on a generation/i)).toBeVisible({ timeout: 15_000 });

    await page.getByRole('button', { name: 'Abandon and start over' }).click();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.locator('select').first()).toBeEnabled();

    // The shared record survives Abandon — it is not this tab's alone to delete.
    expect(await recoveryEntryIds(page)).toHaveLength(1);

    // Reloading this SAME tab must not resurrect the banner it just
    // dismissed — the locally-ignored id persists via sessionStorage across
    // the reload even though the storage entry itself is still there.
    await page.reload();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toHaveCount(0);
  });

  test('abandoning a recoverable submission unlocks Generate locally without ever deleting the shared record (regression)', async ({ page }) => {
    await page.route('**/api/nano-banana/generate', (route) => route.abort());
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    await page.getByRole('button', { name: 'Abandon and start over' }).click();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.locator('select').first()).toBeEnabled();

    expect(await recoveryEntryIds(page)).toHaveLength(1);

    await page.reload();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
    await expect(page.getByRole('button', { name: 'Resume submission' })).toHaveCount(0);
  });

  test('abandoning a recoverable job while a genuinely different tab\'s entry is still outstanding surfaces THAT entry instead of unlocking Generate (regression)', async ({ page }) => {
    // clearRecoveryEntry alone only ever removed the abandoned entry from
    // storage — a same-document write never fires this same tab's own
    // `storage` listener (see handleStorageEvent in AIStudioPanel), so
    // without also re-checking what's left (clearOwnRecoveryEntry), Generate
    // would incorrectly re-enable here even though a genuinely different
    // tab's own, possibly-billed job is still unresolved.
    await page.goto('/#ai-studio');

    const siblingEntry = {
      kind: 'job',
      jobId: 'sibling-still-outstanding-job-id',
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now() - 60_000,
    };
    const ownEntry = {
      kind: 'job',
      jobId: 'own-job-about-to-be-abandoned-id',
      roomId: 'living',
      outputType: 'image',
      createdAt: Date.now(),
    };
    // One-time seed of both entries (see the two-independently-tracked test
    // above for why page.evaluate, not addInitScript, is used here).
    await page.evaluate(
      ({ sibling, own, prefix }) => {
        const asSibling = sibling as { jobId: string };
        const asOwn = own as { jobId: string };
        localStorage.setItem(`${prefix}job:${asSibling.jobId}`, JSON.stringify(sibling));
        localStorage.setItem(`${prefix}job:${asOwn.jobId}`, JSON.stringify(own));
      },
      { sibling: siblingEntry, own: ownEntry, prefix: RECOVERY_STORAGE_PREFIX },
    );

    // Reload so the mount effect adopts the newer (own) entry as this tab's
    // own tracked one — the sibling entry is older but still well within its
    // recovery ceiling, exactly like the single-entry seeding tests above.
    await page.reload();
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toBeVisible();

    await page.getByRole('button', { name: 'Abandon and start over' }).click();

    // The sibling's own entry must be surfaced in its place, not silently
    // dropped — Generate must stay disabled and the recovery banner must
    // stay up (under the old behavior this would flip: the banner would
    // disappear and Generate would re-enable).
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toBeVisible();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();

    // Abandon is purely local: the abandoned entry stays in storage right
    // alongside the sibling's (see abandonRecoveryEntry in AIStudioPanel) —
    // only a genuine terminal settlement ever removes a shared record.
    const ids = await recoveryEntryIds(page);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('job:sibling-still-outstanding-job-id');
    expect(ids).toContain('job:own-job-about-to-be-abandoned-id');
  });

  test('a genuinely different tab\'s recovery write is ignored while THIS tab has its own submission in flight, so it can never hijack the room mid-request (regression)', async ({
    page,
    context,
  }) => {
    // submitOnce only ever mirrors a fresh/resumed submission into
    // recoverableSubmission/recoverableJobId once something has gone
    // wrong — while it is genuinely still in flight (submitting === true),
    // both stay null. Without treating that as "already owned" in the
    // storage listener's guard, a different tab's own write during that
    // exact window would adopt its (unrelated) room and recovery state
    // right out from under this tab's own in-flight, possibly paid request.
    await page.route('**/api/nano-banana/generate', () => new Promise(() => {})); // never resolves
    await page.goto('/#ai-studio');
    await page.locator('select').first().selectOption('kitchen');
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    // The button's own label switches to "Working…" once submitting is
    // true, before anything is recoverable yet — this is exactly the
    // in-flight window the fix protects.
    await expect(page.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await expect(page.locator('select').first()).toBeDisabled();
    await expect(page.locator('select').first()).toHaveValue('kitchen');

    // A genuinely different tab (sharing this origin's localStorage) writes
    // its own, unrelated recovery entry directly — firing a real
    // cross-document `storage` event on tab 1. (Going through page2's own
    // UI instead — clicking Generate there — doesn't exercise this: page2's
    // OWN mount-time adoptRecoveryEntry() would immediately adopt tab 1's
    // still-outstanding entry and disable page2's Generate button before it
    // could ever create a genuinely different entry of its own.)
    const page2 = await context.newPage();
    await page2.goto('/#ai-studio');
    await page2.evaluate((prefix) => {
      localStorage.setItem(
        `${prefix}job:unrelated-other-tab-job-id`,
        JSON.stringify({
          kind: 'job',
          jobId: 'unrelated-other-tab-job-id',
          roomId: 'living',
          outputType: 'image',
          createdAt: Date.now(),
        }),
      );
    }, RECOVERY_STORAGE_PREFIX);

    // Tab 1's own in-flight request must be completely unaffected — still
    // showing "Working…", still locked to its OWN room ('kitchen'), never
    // hijacked to the other tab's entry ('living') or its banner.
    await expect(page.getByRole('button', { name: 'Working…' })).toBeDisabled();
    await expect(page.locator('select').first()).toHaveValue('kitchen');
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toHaveCount(0);
  });

  test('a settled job clears its displayed result before adopting a sibling for a different room, so Approve can never mismatch rooms (regression)', async ({
    page,
    context,
  }) => {
    // The Approve handler pairs job.resultUrl with the panel's CURRENT
    // roomId state, not the completed job's own — so if adoptRecoveryEntry
    // switches roomId to a sibling's room right as this job reaches a
    // terminal state, a stale (but still displayed) completed job would let
    // Approve record its image's URL under the wrong, newly adopted room.
    await page.goto('/#ai-studio');
    await page.getByRole('button', { name: /Generate concept image/i }).click();

    // A genuinely different tab writes a sibling job-kind entry for a
    // DIFFERENT room while this tab's own job is still in flight, so it is
    // already present in storage by the time this tab's poll reaches the
    // terminal "completed" state.
    const page2 = await context.newPage();
    await page2.goto('/#ai-studio');
    await page2.evaluate((prefix) => {
      localStorage.setItem(
        `${prefix}job:sibling-different-room-job-id`,
        JSON.stringify({ kind: 'job', jobId: 'sibling-different-room-job-id', roomId: 'kitchen', outputType: 'image', createdAt: Date.now() }),
      );
    }, RECOVERY_STORAGE_PREFIX);

    // The sibling gets adopted instead of leaving the now-stale completed
    // job (and an Approve button for it) displayed.
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toBeVisible({ timeout: 10_000 });
    await expect(page.locator('select').first()).toHaveValue('kitchen');
    await expect(page.getByRole('button', { name: 'Approve' })).toHaveCount(0);
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toHaveCount(0);
  });

  test('a tab that adopted a sibling entry unlocks once the OWNING tab genuinely settles it, without needing to reload or manually resume/abandon (regression)', async ({
    page,
    context,
  }) => {
    // Tab 2 adopting tab 1's entry makes tab 2's OWN recoverable state
    // non-null, which — before tracking the adopted entry's own identity —
    // meant tab 2's storage listener would then ignore ALL further events,
    // including tab 1 later removing that exact key by genuinely settling
    // it. Tab 2 would stay stuck showing a Resume banner for a record that
    // no longer exists anywhere, until manually resumed or abandoned.
    let blockGenerate = true;
    await page.route('**/api/nano-banana/generate', (route) => (blockGenerate ? route.abort() : route.continue()));
    const page2 = await context.newPage();
    await page.goto('/#ai-studio');
    await page2.goto('/#ai-studio');

    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // Tab 2, already open and idle, picks this up live and shows its own banner.
    await expect(page2.getByRole('button', { name: 'Resume submission' })).toBeVisible();

    // Tab 1 (the true owner) reaches a genuine terminal outcome — the one
    // thing allowed to remove the shared record (see clearOwnRecoveryEntry
    // in AIStudioPanel). Abandoning alone must NOT do this — see the test
    // right below.
    blockGenerate = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });

    // Tab 2 must notice the removal live and unlock on its own.
    await expect(page2.getByRole('button', { name: 'Resume submission' })).toHaveCount(0, { timeout: 10_000 });
    await expect(page2.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();
  });

  test('abandoning the OWNING tab\'s job does NOT unlock a sibling tab that adopted it — only genuine settlement does (regression)', async ({
    page,
    context,
  }) => {
    // The bug this guards against: Abandon deleted the shared storage entry
    // outright whenever this tab happened to be the one that originally
    // wrote it, which fired a completely different, adopting tab's own
    // storage listener and made it believe the job was resolved — even
    // though the provider-side job may still be running (and already
    // billed), letting that tab start a fresh, potentially duplicate-billed
    // generation. Abandon must stay purely local for every tab, including
    // the original owner; only a genuine terminal outcome may remove the
    // shared record (see abandonRecoveryEntry in AIStudioPanel).
    const page2 = await context.newPage();
    await page.route('**/api/nano-banana/generate', (route) => route.abort());
    await page.goto('/#ai-studio');
    await page2.goto('/#ai-studio');

    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // Tab 2, already open and idle, adopts it live.
    await expect(page2.getByRole('button', { name: 'Resume submission' })).toBeVisible();

    // Tab 1 (the true owner) merely abandons — no terminal outcome is known.
    await page.getByRole('button', { name: 'Abandon and start over' }).click();
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();

    // Tab 2 must stay exactly as it was: still showing its own banner, still
    // locked, with the shared record still there for it to depend on.
    await expect(page2.getByRole('button', { name: 'Resume submission' })).toBeVisible();
    await expect(page2.getByRole('button', { name: /Generate concept image/i })).toBeDisabled();
    expect(await recoveryEntryIds(page2)).toHaveLength(1);
  });

  test('abandoning an ADOPTED sibling entry never disturbs the OWNING tab\'s own tracking (regression)', async ({ page, context }) => {
    // The mirror image of the test above: here it's the ADOPTER (tab 2, not
    // the true owner) that clicks Abandon. Before this fix, Abandon always
    // deleted the shared storage entry outright — which fired the TRUE
    // owner's (tab 1's) own storage listener and silently cleared its
    // tracking too, even though tab 1's own submission outcome was still
    // genuinely unresolved, letting both tabs believe it was safe to start
    // a fresh (possibly duplicate-billed) generation.
    let blockGenerate = true;
    await page.route('**/api/nano-banana/generate', (route) => (blockGenerate ? route.abort() : route.continue()));

    const page2 = await context.newPage();
    await page.goto('/#ai-studio');
    await page2.goto('/#ai-studio');

    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // Tab 2, already open and idle, picks this up live and shows its own banner.
    await expect(page2.getByRole('button', { name: 'Resume submission' })).toBeVisible();

    // Tab 2 — the ADOPTER, not the true owner — abandons it.
    await page2.getByRole('button', { name: 'Abandon and start over' }).click();
    await expect(page2.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();

    // Tab 1 (the true owner) is completely unaffected: still shows its own
    // banner, its shared storage entry still exists, and it can still
    // genuinely Resume and complete — proving its OWN tracking, not just
    // the storage key, survived.
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();
    await expect(page.locator('select').first()).toBeDisabled();
    expect(await recoveryEntryIds(page)).toHaveLength(1);

    blockGenerate = false;
    await page.getByRole('button', { name: 'Resume submission' }).click();
    await expect(page.locator('span').filter({ hasText: 'Complete' })).toBeVisible({ timeout: 10_000 });
  });

  test('a 504 (ambiguous submit timeout) does not adopt a sibling while upgrading its own entry in place (regression)', async ({ page }) => {
    // clearOwnRecoveryEntry's adoption is correct after a genuinely
    // definite, terminal outcome, but a 504 immediately re-writes this SAME
    // submission's own entry (upgraded to ambiguous: true) rather than
    // settling to idle — adopting a sibling in between would switch
    // roomId/outputType to the sibling's while recoverableSubmission stayed
    // this request's own, so the job this resume eventually produces could
    // get recorded and displayed under the wrong room.
    await page.goto('/#ai-studio');
    // Confirms the mount effect has already run (and found nothing) BEFORE
    // seeding — otherwise a same-document write landing before that
    // one-time read (a genuine race against hydration) would have this
    // tab's OWN mount adopt the sibling immediately, disabling Generate
    // before the test could ever reach the 504 path this is meant to check.
    await expect(page.getByRole('button', { name: /Generate concept image/i })).toBeEnabled();

    // A same-document write never fires this page's OWN `storage` listener
    // either, so this is otherwise fully invisible to this tab's state —
    // present only as raw storage content to verify against afterward.
    await page.evaluate((prefix) => {
      localStorage.setItem(
        `${prefix}job:sibling-different-room-job-id`,
        JSON.stringify({ kind: 'job', jobId: 'sibling-different-room-job-id', roomId: 'kitchen', outputType: 'image', createdAt: Date.now() }),
      );
    }, RECOVERY_STORAGE_PREFIX);

    await page.route('**/api/nano-banana/generate', (route) =>
      route.fulfill({
        status: 504,
        contentType: 'application/json',
        body: JSON.stringify({
          error:
            'The request to Nano Banana timed out. It may have already been accepted and could still be running (and billed) — please wait a minute and check before submitting again, to avoid a possible duplicate charge.',
        }),
      }),
    );
    await page.getByRole('button', { name: /Generate concept image/i }).click();
    await expect(page.getByText(/The outcome of this generation is unclear/i)).toBeVisible({ timeout: 10_000 });

    // Still tracking ITS OWN resumable submission for the room it actually
    // submitted (the default, 'living') — not silently switched to the
    // sibling's room/entry.
    await expect(page.getByRole('button', { name: 'Resume submission' })).toBeVisible();
    await expect(page.locator('select').first()).toHaveValue('living');
    await expect(page.getByRole('button', { name: 'Resume checking status' })).toHaveCount(0);

    // Neither entry was lost.
    const ids = await recoveryEntryIds(page);
    expect(ids).toHaveLength(2);
    expect(ids).toContain('job:sibling-different-room-job-id');
    expect(ids.some((id) => id.startsWith('submission:'))).toBe(true);
  });
});
