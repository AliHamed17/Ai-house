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
