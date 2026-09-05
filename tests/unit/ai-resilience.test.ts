import { describe, expect, it } from 'vitest';
import { withTimeout } from '@/lib/ai/resilience.server';

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
});
