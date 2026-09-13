import { describe, expect, it } from 'vitest';
import { OrphanedTimeoutError, withTimeout } from '@/lib/ai/resilience.server';

describe('withTimeout', () => {
  it('resolves with the run result when it finishes in time', async () => {
    const result = await withTimeout(async () => 'ok', 1000);
    expect(result).toBe('ok');
  });

  it('rejects with the message and aborts the signal on timeout', async () => {
    let aborted = false;
    const pending = withTimeout(
      (signal) =>
        new Promise<string>((resolve) => {
          signal.addEventListener('abort', () => {
            aborted = true;
          });
          setTimeout(() => resolve('late'), 1000);
        }),
      20,
      'timed out',
    );
    await expect(pending).rejects.toThrow('timed out');
    expect(aborted).toBe(true);
  });

  it("propagates run's own rejection when it fails for a reason unrelated to the timeout", async () => {
    await expect(
      withTimeout(async () => {
        throw new Error('some other failure');
      }, 1000),
    ).rejects.toThrow('some other failure');
  });

  it(
    "rejects with its OWN timeout error, not an aborted run's own rejection, even when run reacts to the abort signal by rejecting synchronously (regression)",
    async () => {
      // Mirrors an abort-aware provider call (fetch, the Gemini SDK): reacts
      // to the AbortSignal firing by immediately rejecting its own promise
      // with a generic abort error, not this timeout's specific message.
      // Callers like isSubmitTimeout match on error.message, so if that
      // generic error won the Promise.race instead of this function's own,
      // an ambiguous (possibly already-billed) timeout would be
      // misclassified as a definite, safe-to-retry failure.
      const result = withTimeout(
        (signal) =>
          new Promise((_, reject) => {
            signal.addEventListener('abort', () => {
              reject(new DOMException('aborted', 'AbortError'));
            });
          }),
        10,
        'my own timeout message',
      );
      await expect(result).rejects.toThrow('my own timeout message');
    },
  );

  it('rejects with an OrphanedTimeoutError carrying the raw underlying promise, so a caller can reconcile its eventual real outcome later (regression)', async () => {
    let resolveRaw!: (value: string) => void;
    const raw = new Promise<string>((resolve) => {
      resolveRaw = resolve;
    });
    const pending = withTimeout(() => raw, 10, 'deadline hit');
    await expect(pending).rejects.toBeInstanceOf(OrphanedTimeoutError);
    await expect(pending).rejects.toThrow('deadline hit');

    // The underlying (uncancellable, or abort-ignoring) operation is still
    // running after the timeout won the race — resolving it later must be
    // observable via the rejected error's own `orphaned` promise.
    let caught: unknown;
    try {
      await pending;
    } catch (error) {
      caught = error;
    }
    expect(caught).toBeInstanceOf(OrphanedTimeoutError);
    resolveRaw('late-but-real-result');
    await expect((caught as OrphanedTimeoutError).orphaned).resolves.toBe('late-but-real-result');
  });
});
