import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _clearStoreForTests,
  IDEMPOTENCY_KEY_MISMATCH_MESSAGE,
  IDEMPOTENCY_STORE_AT_CAPACITY_MESSAGE,
  isIdempotencyKeyMismatchError,
  reserveIdempotentSubmission,
} from '@/lib/ai/idempotency.server';

// Most tests below don't exercise fingerprint matching itself — they reuse
// the same literal fingerprint across paired calls so that behavior isn't
// what's under test. Dedicated fingerprint-mismatch tests are at the bottom.
const FP = 'fp';

describe('reserveIdempotentSubmission (reconciles a retried submission instead of duplicating a billed job)', () => {
  it('runs independently every time when no key is supplied', async () => {
    const run = vi.fn().mockResolvedValueOnce('job-a').mockResolvedValueOnce('job-b');
    expect(await reserveIdempotentSubmission(undefined, FP, run)).toBe('job-a');
    expect(await reserveIdempotentSubmission(undefined, FP, run)).toBe('job-b');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('reuses a successful result for a later (already-settled) call with the same key', async () => {
    const run = vi.fn().mockResolvedValue('job-success-1');
    const first = await reserveIdempotentSubmission('settled-key', FP, run);
    const second = await reserveIdempotentSubmission('settled-key', FP, run);
    expect(first).toBe('job-success-1');
    expect(second).toBe('job-success-1');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('keeps distinct keys independent', async () => {
    const run = vi.fn().mockResolvedValueOnce('job-b1').mockResolvedValueOnce('job-b2');
    expect(await reserveIdempotentSubmission('key-b1', FP, run)).toBe('job-b1');
    expect(await reserveIdempotentSubmission('key-b2', FP, run)).toBe('job-b2');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('releases the reservation after a failed run so a later attempt can retry fresh', async () => {
    const run = vi.fn().mockRejectedValueOnce(new Error('boom')).mockResolvedValueOnce('job-after-retry');
    await expect(reserveIdempotentSubmission('retry-key', FP, run)).rejects.toThrow('boom');
    // The failed run's rejection is observed above; give its internal
    // cleanup .catch() a turn to run before the next call.
    await Promise.resolve();
    const result = await reserveIdempotentSubmission('retry-key', FP, run);
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

    await expect(reserveIdempotentSubmission('ambiguous-key', FP, run, { isAmbiguousFailure })).rejects.toThrow('ambiguous timeout');
    await Promise.resolve();
    await expect(reserveIdempotentSubmission('ambiguous-key', FP, run, { isAmbiguousFailure })).rejects.toThrow('ambiguous timeout');
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('still releases the reservation for a failure the caller does not mark ambiguous, even when isAmbiguousFailure is supplied', async () => {
    const definiteError = new Error('bad credentials');
    const run = vi.fn().mockRejectedValueOnce(definiteError).mockResolvedValueOnce('job-after-definite-failure');
    const isAmbiguousFailure = () => false;

    await expect(reserveIdempotentSubmission('definite-key', FP, run, { isAmbiguousFailure })).rejects.toThrow('bad credentials');
    await Promise.resolve();
    const result = await reserveIdempotentSubmission('definite-key', FP, run, { isAmbiguousFailure });
    expect(result).toBe('job-after-definite-failure');
    expect(run).toHaveBeenCalledTimes(2);
  });

  it('extends an ambiguous reservation well past the ordinary TTL, so a visitor who steps away can still come back and reconcile (regression)', async () => {
    vi.useFakeTimers();
    try {
      const ambiguousError = new Error('ambiguous timeout');
      const run = vi.fn().mockRejectedValueOnce(ambiguousError).mockResolvedValueOnce('job-should-not-be-reached');
      const isAmbiguousFailure = (error: unknown) => error === ambiguousError;

      const first = reserveIdempotentSubmission('ambiguous-ttl-key', FP, run, { isAmbiguousFailure });
      await expect(first).rejects.toThrow('ambiguous timeout');
      // Let the internal .catch() cleanup upgrade the entry's TTL.
      await vi.runAllTimersAsync();

      // Past the ordinary 10-minute TTL, but well within the extended
      // ambiguous-failure window — the reservation must still be held.
      vi.advanceTimersByTime(20 * 60_000);
      const second = reserveIdempotentSubmission('ambiguous-ttl-key', FP, run, { isAmbiguousFailure });
      await expect(second).rejects.toThrow('ambiguous timeout');
      expect(run).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
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
    const p1 = reserveIdempotentSubmission('race-key', FP, run);
    const p2 = reserveIdempotentSubmission('race-key', FP, run);
    expect(run).toHaveBeenCalledTimes(1);

    resolveRun('job-race-1');
    expect(await p1).toBe('job-race-1');
    expect(await p2).toBe('job-race-1');
    expect(run).toHaveBeenCalledTimes(1);
  });
});

describe('reserveIdempotentSubmission fingerprint binding (a reused key must never return the WRONG job)', () => {
  it('rejects a reused key whose fingerprint does not match the original request, instead of returning the earlier job', async () => {
    const run = vi.fn().mockResolvedValueOnce('job-room-a').mockResolvedValueOnce('job-should-not-run');
    const first = await reserveIdempotentSubmission('mismatch-settled-key', 'room-a-fingerprint', run);
    expect(first).toBe('job-room-a');

    // A different request (different room/body) reusing the SAME key must
    // not be silently handed room A's job, and must not silently start a
    // second submission either — it is rejected outright.
    await expect(reserveIdempotentSubmission('mismatch-settled-key', 'room-b-fingerprint', run)).rejects.toThrow(IDEMPOTENCY_KEY_MISMATCH_MESSAGE);
    expect(run).toHaveBeenCalledTimes(1);
  });

  it('rejects a mismatched fingerprint even while the original request is still in flight (concurrent case)', async () => {
    let resolveRun: (value: string) => void = () => {};
    const runPromise = new Promise<string>((resolve) => {
      resolveRun = resolve;
    });
    const run = vi.fn(() => runPromise);

    const first = reserveIdempotentSubmission('mismatch-inflight-key', 'fingerprint-1', run);
    const mismatched = reserveIdempotentSubmission('mismatch-inflight-key', 'fingerprint-2', run);
    await expect(mismatched).rejects.toThrow(IDEMPOTENCY_KEY_MISMATCH_MESSAGE);
    expect(run).toHaveBeenCalledTimes(1);

    resolveRun('job-first');
    expect(await first).toBe('job-first');
  });

  it('isIdempotencyKeyMismatchError recognizes exactly the mismatch error and nothing else', () => {
    expect(isIdempotencyKeyMismatchError(new Error(IDEMPOTENCY_KEY_MISMATCH_MESSAGE))).toBe(true);
    expect(isIdempotencyKeyMismatchError(new Error('some other error'))).toBe(false);
    expect(isIdempotencyKeyMismatchError(undefined)).toBe(false);
  });
});

describe('reserveIdempotentSubmission at capacity (MAX_ENTRIES=200) — a new key is rejected outright, nothing existing is ever evicted', () => {
  // Each test below fills the store to exactly MAX_ENTRIES itself — a clean
  // slate is required, or leftover entries from an earlier test (or an
  // earlier describe block above) would make that fill overshoot capacity
  // partway through and reject unexpectedly.
  beforeEach(() => {
    _clearStoreForTests();
  });

  it('rejects a new key at capacity without touching an existing UNSETTLED entry', async () => {
    // A run() that never settles, standing in for a submission still
    // genuinely in flight when a load spike fills the store to capacity.
    const neverResolve = () => new Promise<string>(() => {});
    const firstPromise = reserveIdempotentSubmission('capacity-unsettled-key-0', 'fp-0', neverResolve);
    for (let i = 1; i < 200; i++) {
      reserveIdempotentSubmission(`capacity-unsettled-key-${i}`, `fp-${i}`, neverResolve);
    }

    // A 201st, distinct key while all 200 are still pending — this pushes
    // past MAX_ENTRIES. Evicting the oldest (key-0) to make room would let
    // a lost-response retry for it start a genuinely concurrent second
    // submission; rejecting the new key outright is the safe outcome.
    const freshRun = vi.fn().mockResolvedValue('job-201');
    await expect(reserveIdempotentSubmission('capacity-unsettled-key-200', 'fp-200', freshRun)).rejects.toThrow(
      IDEMPOTENCY_STORE_AT_CAPACITY_MESSAGE,
    );
    expect(freshRun).not.toHaveBeenCalled();

    // key-0 must still be exactly the same in-flight reservation — not
    // evicted, not re-run.
    const retryRun = vi.fn().mockResolvedValue('should-not-run');
    const rejoined = reserveIdempotentSubmission('capacity-unsettled-key-0', 'fp-0', retryRun);
    expect(retryRun).not.toHaveBeenCalled();
    expect(rejoined).toBe(firstPromise);
  });

  it('rejects a new key at capacity without touching an existing SETTLED (but not yet expired) entry (regression)', async () => {
    // Regression target: an earlier version of this store evicted the
    // oldest SETTLED entry to make room, regardless of how much of its TTL
    // remained. A retry for that evicted key — reconciling a successful
    // job it never got a response for, or an ambiguous failure still
    // within its extended window — would then find no reservation at all
    // and silently start a genuinely new, separately billed submission.
    for (let i = 0; i < 200; i++) {
      await reserveIdempotentSubmission(`capacity-settled-key-${i}`, `fp-${i}`, () => Promise.resolve(`job-${i}`));
    }
    const freshRun = vi.fn().mockResolvedValue('job-201-settled');
    await expect(reserveIdempotentSubmission('capacity-settled-key-200', 'fp-200', freshRun)).rejects.toThrow(
      IDEMPOTENCY_STORE_AT_CAPACITY_MESSAGE,
    );
    expect(freshRun).not.toHaveBeenCalled();

    // key-0's settled reservation must still reconcile a retry to its
    // ORIGINAL job — not have been evicted and silently re-run.
    const retryRun = vi.fn().mockResolvedValue('job-0-rerun');
    const result = await reserveIdempotentSubmission('capacity-settled-key-0', 'fp-0', retryRun);
    expect(retryRun).not.toHaveBeenCalled();
    expect(result).toBe('job-0');
  });

  it('is not a permanent lockout — a new key succeeds again once genuinely expired entries free up room', async () => {
    vi.useFakeTimers();
    try {
      for (let i = 0; i < 200; i++) {
        await reserveIdempotentSubmission(`capacity-expiring-key-${i}`, `fp-${i}`, () => Promise.resolve(`job-${i}`));
      }
      // Past the ordinary TTL_MS (10 min) — every one of those 200 entries
      // is now genuinely expired, so prune() (run at the top of the next
      // call) removes them before the capacity check even runs.
      vi.advanceTimersByTime(11 * 60_000);

      const freshRun = vi.fn().mockResolvedValue('job-after-expiry');
      const result = await reserveIdempotentSubmission('capacity-after-expiry-key', 'fp-fresh', freshRun);
      expect(result).toBe('job-after-expiry');
      expect(freshRun).toHaveBeenCalledTimes(1);
    } finally {
      vi.useRealTimers();
    }
  });
});
