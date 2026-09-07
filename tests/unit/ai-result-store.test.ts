import { describe, expect, it, vi } from 'vitest';
import { getStoredResult, putStoredResult, RESULT_URL_PREFIX, resultIdFromPath, touchStoredResult } from '@/lib/ai/resultStore.server';

describe('in-memory generation result store', () => {
  it('round-trips stored bytes by id', () => {
    const id = putStoredResult('image/png', 'aGVsbG8=');
    const got = getStoredResult(id);
    expect(got?.mimeType).toBe('image/png');
    expect(got?.base64).toBe('aGVsbG8=');
  });

  it('returns undefined for unknown or empty ids', () => {
    expect(getStoredResult('does-not-exist')).toBeUndefined();
    expect(getStoredResult(undefined)).toBeUndefined();
  });

  it('extracts the id only from a result URL path', () => {
    const id = putStoredResult('image/png', 'aGVsbG8=');
    expect(resultIdFromPath(`${RESULT_URL_PREFIX}${id}`)).toBe(id);
    expect(resultIdFromPath(`${RESULT_URL_PREFIX}${id}?x=1`)).toBe(id);
    expect(resultIdFromPath('/generated/concepts/living.svg')).toBeUndefined();
    expect(resultIdFromPath('/evidence/frames/foo.jpg')).toBeUndefined();
  });

  describe('touchStoredResult (refreshes an entry\'s TTL so a slower external fetch does not race its expiry)', () => {
    it('refreshes the TTL clock so the entry survives past its original expiry', () => {
      vi.useFakeTimers();
      try {
        const id = putStoredResult('image/png', 'aGVsbG8=');
        vi.advanceTimersByTime(9 * 60_000); // close to, but not past, the 10-minute TTL
        expect(touchStoredResult(id)).toBe(true);
        // Without the touch above, this would be 18 minutes total — well
        // past the ORIGINAL TTL. The touch reset the clock 9 minutes ago,
        // so the entry should still be alive.
        vi.advanceTimersByTime(9 * 60_000);
        expect(getStoredResult(id)).toBeDefined();
      } finally {
        vi.useRealTimers();
      }
    });

    it('returns false, without throwing, for a missing or already-expired id', () => {
      vi.useFakeTimers();
      try {
        expect(touchStoredResult(undefined)).toBe(false);
        expect(touchStoredResult('not-a-real-id')).toBe(false);

        const id = putStoredResult('image/png', 'aGVsbG8=');
        vi.advanceTimersByTime(11 * 60_000); // past the 10-minute TTL
        expect(touchStoredResult(id)).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });
  });
});
