import { describe, expect, it, vi } from 'vitest';
import { mockProvider } from '@/lib/ai/mockProvider.server';
import { decodeJobId, encodeJobId } from '@/lib/ai/jobId';
import { putStoredResult, RESULT_URL_PREFIX } from '@/lib/ai/resultStore.server';

describe('mock generation provider', () => {
  it('round-trips a job id through encode/decode', () => {
    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'test prompt',
      createdAt: 1700000000000,
    });
    const decoded = decodeJobId(jobId);
    expect(decoded.roomId).toBe('living');
    expect(decoded.provider).toBe('mock');
  });

  it('rejects a corrupted job id', () => {
    expect(() => decodeJobId('not-a-real-job-id')).toThrow();
  });

  it('walks queued -> in_progress -> completed for the default (success) simulation', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'image',
      roomId: 'kitchen',
      styleVariant: 'warm-oak',
      prompt: 'p',
    });

    vi.setSystemTime(start + 100);
    expect((await mockProvider.status(jobId)).status).toBe('queued');

    vi.setSystemTime(start + 1500);
    expect((await mockProvider.status(jobId)).status).toBe('in_progress');

    vi.setSystemTime(start + 3000);
    const completed = await mockProvider.status(jobId);
    expect(completed.status).toBe('completed');
    expect(completed.resultUrl).toBe('/generated/concepts/kitchen.svg');
    vi.useRealTimers();
  });

  it('resolves to failed when simulate=failure is requested', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'image',
      roomId: 'mamad',
      styleVariant: 'warm-oak',
      prompt: 'p',
      simulate: 'failure',
    });
    vi.setSystemTime(start + 3000);
    const job = await mockProvider.status(jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toBeTruthy();
    vi.useRealTimers();
  });

  it('resolves to moderated when simulate=moderated is requested', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'video',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      simulate: 'moderated',
    });
    vi.setSystemTime(start + 3000);
    const job = await mockProvider.status(jobId);
    expect(job.status).toBe('moderated');
    expect(job.error).toBeTruthy();
    vi.useRealTimers();
  });

  it('animates a genuinely live-generated (stored) source for a video job instead of the generic placeholder (regression)', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const storedId = putStoredResult('image/png', 'aGVsbG8=');
    const storedPath = `${RESULT_URL_PREFIX}${storedId}`;
    const { jobId } = await mockProvider.submit({
      provider: 'higgsfield',
      outputType: 'video',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      sourceAssetPath: storedPath,
    });
    vi.setSystemTime(start + 3000);
    const completed = await mockProvider.status(jobId);
    expect(completed.resultUrl).toBe(storedPath);
    vi.useRealTimers();
  });

  it('falls back to the placeholder when the stored source has already expired by submit time, instead of baking in a dead URL (regression)', async () => {
    // resultIdFromPath alone only confirms the PATH shape — a stored result
    // approved a while before the visitor finally clicks "Generate cinematic
    // clip" can have already fallen out of the TTL-bounded store by submit
    // time. Without checking existence too, this job would later report
    // "completed" with a resultUrl that 404s.
    vi.useFakeTimers();
    const start = Date.now();
    const storedId = putStoredResult('image/png', 'aGVsbG8=');
    const storedPath = `${RESULT_URL_PREFIX}${storedId}`;
    vi.setSystemTime(start + 11 * 60_000); // past resultStore's 10-minute TTL
    const { jobId } = await mockProvider.submit({
      provider: 'higgsfield',
      outputType: 'video',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      sourceAssetPath: storedPath,
    });
    vi.setSystemTime(start + 11 * 60_000 + 3000);
    const completed = await mockProvider.status(jobId);
    expect(completed.resultUrl).toBe('/generated/concepts/living.svg');
    vi.useRealTimers();
  });

  it('keeps a source alive through job completion even if it had only seconds left on its TTL at submit time (regression)', async () => {
    // A source with almost no TTL left still legitimately EXISTS at the
    // instant submit() checks it, but the mock job itself takes up to
    // IN_PROGRESS_UNTIL_MS (2.6s) before status() reports "completed" — a
    // plain existence check at submit time does not survive that gap, so
    // the source could genuinely expire in between, and status() would
    // still bake the (by-then-404) path into a job it reports as
    // successful. submit() must refresh the source's TTL, not just check it.
    vi.useFakeTimers();
    const start = Date.now();
    const storedId = putStoredResult('image/png', 'aGVsbG8=');
    const storedPath = `${RESULT_URL_PREFIX}${storedId}`;
    // 1 second short of resultStore's 10-minute TTL — still valid now, but
    // would expire well before the mock job's own 2.6s completion delay
    // elapses, if submit() only checked existence instead of refreshing it.
    vi.setSystemTime(start + 9 * 60_000 + 59_000);
    const { jobId } = await mockProvider.submit({
      provider: 'higgsfield',
      outputType: 'video',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      sourceAssetPath: storedPath,
    });
    vi.setSystemTime(start + 9 * 60_000 + 59_000 + 3000);
    const completed = await mockProvider.status(jobId);
    expect(completed.resultUrl).toBe(storedPath);
    vi.useRealTimers();
  });

  it('falls back to the placeholder if the stored source expires between submission and a much-later (recovered) status check, not just checked once at submit time (regression)', async () => {
    // touchStoredResult at submit time only refreshes the TTL enough to
    // survive THIS job's own short completion delay (a few seconds) — it
    // says nothing about a status check delayed or resumed much later, e.g.
    // via "Resume checking status" after a page reload (whose own recovery
    // ceiling allows up to 24h — RECOVERY_MAX_AGE_MS.job in AIStudioPanel).
    // By then the source has almost certainly fallen out of the 10-minute
    // TTL store; status() must re-check existence at THAT moment too,
    // instead of blindly trusting the path baked into the job id at submit
    // time and reporting "completed" with a since-expired, broken URL.
    vi.useFakeTimers();
    const start = Date.now();
    const storedId = putStoredResult('image/png', 'aGVsbG8=');
    const storedPath = `${RESULT_URL_PREFIX}${storedId}`;
    const { jobId } = await mockProvider.submit({
      provider: 'higgsfield',
      outputType: 'video',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      sourceAssetPath: storedPath,
    });
    // Past even touchStoredResult's freshly-refreshed 10-minute TTL.
    vi.setSystemTime(start + 11 * 60_000);
    const completed = await mockProvider.status(jobId);
    expect(completed.resultUrl).toBe('/generated/concepts/living.svg');
    vi.useRealTimers();
  });

  it('does not reuse a stored source for an IMAGE job (the placeholder concept art is the intended demo result there)', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const storedId = putStoredResult('image/png', 'aGVsbG8=');
    const storedPath = `${RESULT_URL_PREFIX}${storedId}`;
    const { jobId } = await mockProvider.submit({
      provider: 'nano-banana',
      outputType: 'image',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      sourceAssetPath: storedPath,
    });
    vi.setSystemTime(start + 3000);
    const completed = await mockProvider.status(jobId);
    expect(completed.resultUrl).toBe('/generated/concepts/living.svg');
    vi.useRealTimers();
  });

  it('never includes a model name that looks like a leaked credential', async () => {
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'image',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
    });
    const job = await mockProvider.status(jobId);
    const serialized = JSON.stringify(job);
    expect(serialized).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/); // Google API key shape
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
  });
});
