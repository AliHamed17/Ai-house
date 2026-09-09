import { describe, expect, it } from 'vitest';
import { withTimeout } from '@/lib/ai/resilience.server';

describe('withTimeout', () => {
  it('resolves normally when run finishes before the deadline', async () => {
    await expect(withTimeout(async () => 'ok', 50)).resolves.toBe('ok');
  });

  it("propagates run's own rejection when it fails for a reason unrelated to the timeout", async () => {
    await expect(
      withTimeout(async () => {
        throw new Error('some other failure');
      }, 50),
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

  it('still aborts the signal it hands to run once the deadline passes, so an abort-aware call is actually cancelled', async () => {
    let observedAborted = false;
    await withTimeout(
      (signal) =>
        new Promise((_, reject) => {
          signal.addEventListener('abort', () => {
            observedAborted = true;
            reject(new DOMException('aborted', 'AbortError'));
          });
        }),
      10,
    ).catch(() => {
      // Expected — only the abort flag matters for this assertion.
    });
    expect(observedAborted).toBe(true);
  });
});
