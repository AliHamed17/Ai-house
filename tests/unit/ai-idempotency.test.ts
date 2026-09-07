import { describe, expect, it, vi } from 'vitest';
import { reserveIdempotentSubmission } from '@/lib/ai/idempotency.server';

describe('reserveIdempotentSubmission (reconciles a retried submission instead of duplicating a billed job)', () => {
  it('runs independently every time when no key is supplied', async () => {
    const run = vi.fn().mockResolvedValueOnce('job-a').mockResolvedValueOnce('job-b');
    expect(await reserveIdempotentSubmission(undefined, run)).toBe('job-a');
    expect(await reserveIdempotentSubmission(undefined, run)).toBe('job-b');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reuses a successful result for a later (already-settled) call with the same key', async () => {
    const run = vi.fn().mockResolvedValue('job-success-1');
    const first = await reserveIdempotentSubmission('settled-key', run);
    const second = await reserveIdempotentSubmission('settled-key', run);
    expect(first).toBe('job-success-1');
    expect(second).toBe('job-success-1');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct keys independent', async () => {
    const run = vi.fn().mockResolvedValueOnce('job-b1').mockResolvedValueOnce('job-b2');
    expect(await reserveIdempotentSubmission('key-b1', run)).toBe('job-b1');
    expect(await reserveIdempotentSubmission('key-b2', run)).toBe('job-b2');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('releases the reservation after a failed run so a later attempt can retry fresh', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('job-after-retry');
    await expect(reserveIdempotentSubmission('retry-key', run)).rejects.toThrow('boom');
    // The failed run's rejection is observed above; give its internal
    // cleanup .catch() a turn to run before the next call.
    await Promise.resolve();
    const result = await reserveIdempotentSubmission('retry-key', run);
    expect(result).toBe('job-after-retry');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('keeps the reservation after a failure the caller marks ambiguous, so a retry reconciles to the SAME rejection instead of running again (regression)', async () => {
    // Mirrors Higgsfield's uncancellable-timeout case: the failure does not
    // mean the underlying submission definitely never happened, so a retry
    // must not be allowed to start a second, separately billed one.
    const ambiguousError = new Error('ambiguous timeout');
    const run = vi.fn().mockRejectedValueOnce(ambiguousError).mockResolvedValueOnce('job-should-not-be-reached');
    const isAmbiguousFailure = (error: unknown) => error === ambiguousError;

    await expect(reserveIdempotentSubmission('ambiguous-key', run, { isAmbiguousFailure })).rejects.toThrow('ambiguous timeout');
    await Promise.resolve();
    await expect(reserveIdempotentSubmission('ambiguous-key', run, { isAmbiguousFailure })).rejects.toThrow('ambiguous timeout');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still releases the reservation for a failure the caller does not mark ambiguous, even when isAmbiguousFailure is supplied', async () => {
    const definiteError = new Error('bad credentials');
    const run = vi.fn().mockRejectedValueOnce(definiteError).mockResolvedValueOnce('job-after-definite-failure');
    const isAmbiguousFailure = () => false;

    await expect(reserveIdempotentSubmission('definite-key', run, { isAmbiguousFailure })).rejects.toThrow('bad credentials');
    await Promise.resolve();
    const result = await reserveIdempotentSubmission('definite-key', run, { isAmbiguousFailure });
    expect(result).toBe('job-after-definite-failure');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reserves the key before run() settles, so a concurrent call with the same key joins instead of starting a second run (regression)', async () => {
    let resolveRun: (value: string) => void = () => {};
    const runPromise = new Promise<string>((resolve) => {
      resolveRun = resolve;
    });
    const run = vi.fn(() => runPromise);

    // Both calls are issued before run() has settled — this is exactly the
    // window a lost-response retry (or a genuinely concurrent request) can
    // land in. The reservation must already be in place for the second call.
    const p1 = reserveIdempotentSubmission('race-key', run);
    const p2 = reserveIdempotentSubmission('race-key', run);
    expect(run).toHaveBeenCalledTimes(1);

    resolveRun('job-race-1');
    expect(await p1).toBe('job-race-1');
    expect(await p2).toBe('job-race-1');
    expect(run).toHaveBeenCalledTimes(1);
  });
});
