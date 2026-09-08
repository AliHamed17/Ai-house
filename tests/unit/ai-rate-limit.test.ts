import { describe, expect, it, vi } from 'vitest';
import { checkRateLimit, _trackedClientKeyCountForTests } from '@/lib/ai/rateLimit.server';

describe('checkRateLimit (in-memory sliding-window limiter)', () => {
  it('allows requests under the limit and blocks once the window is exhausted', () => {
    const key = `baseline-${Math.random()}`;
    for (let i = 0; i < 12; i++) {
      expect(checkRateLimit(key).allowed).toBe(true);
    }
    const blocked = checkRateLimit(key);
    expect(blocked.allowed).toBe(false);
    expect(blocked.retryAfterMs).toBeGreaterThan(0);
  });

  it('allows requests again once the window has elapsed', () => {
    vi.useFakeTimers();
    try {
      const key = `elapses-${Math.random()}`;
      for (let i = 0; i < 12; i++) checkRateLimit(key);
      expect(checkRateLimit(key).allowed).toBe(false);

      vi.advanceTimersByTime(61_000);
      expect(checkRateLimit(key).allowed).toBe(true);
    } finally {
      vi.useRealTimers();
    }
  });

  it('accepts a custom ceiling per key, defaulting to 12 when omitted (regression)', () => {
    const defaultKey = `default-ceiling-${Math.random()}`;
    for (let i = 0; i < 12; i++) expect(checkRateLimit(defaultKey).allowed).toBe(true);
    expect(checkRateLimit(defaultKey).allowed).toBe(false);

    const customKey = `custom-ceiling-${Math.random()}`;
    for (let i = 0; i < 20; i++) expect(checkRateLimit(customKey, 20).allowed).toBe(true);
    expect(checkRateLimit(customKey, 20).allowed).toBe(false);
  });

  it('does not grow without bound as distinct client keys age out (regression)', () => {
    vi.useFakeTimers();
    try {
      const before = _trackedClientKeyCountForTests();
      // 500 genuinely distinct client keys, each never seen again — the
      // realistic shape of the leak: many unique IPs/forwarded-for values
      // over a long-running instance's life, not one key hammered forever.
      for (let i = 0; i < 500; i++) checkRateLimit(`distinct-client-${i}-${Math.random()}`);
      expect(_trackedClientKeyCountForTests()).toBeGreaterThanOrEqual(before + 500);

      // Past every one of those windows. A single further call is what
      // triggers the sweep (see checkRateLimit's own comment) — without it,
      // the map would still hold all 500+ stale entries forever.
      vi.advanceTimersByTime(61_000);
      checkRateLimit(`trigger-sweep-${Math.random()}`);

      // Only the just-added triggering key (and whatever pre-existed
      // `before`) should remain — every one of the 500 aged-out keys must
      // actually have been removed, not merely have an empty timestamp array
      // sitting in the map forever.
      expect(_trackedClientKeyCountForTests()).toBeLessThanOrEqual(before + 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
