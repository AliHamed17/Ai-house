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

  it('rejects a noncanonical path carrying an extra segment after the id (regression)', () => {
    // A caller could submit "<prefix><id>/missing" hoping the extracted id
    // still passes every "is this a real stored result?" gate, while the
    // FULL sourceAssetPath (not just the id) is what actually gets fetched
    // by a provider — which would 404 after a paid job already started.
    const id = putStoredResult('image/png', 'aGVsbG8=');
    expect(resultIdFromPath(`${RESULT_URL_PREFIX}${id}/missing`)).toBeUndefined();
    expect(resultIdFromPath(`${RESULT_URL_PREFIX}${id}/`)).toBeUndefined();
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

    it('protects a touched entry from capacity eviction by moving it out of "oldest" position (regression)', () => {
      // MAX_ENTRIES is 100. Fill the store to exactly capacity, then touch
      // the very first entry inserted — the one capacity eviction would
      // otherwise remove first. If touch only refreshed createdAt without
      // also moving the entry in the Map's iteration order, it would still
      // be evicted immediately by the very next insert despite the fresh
      // TTL, letting an already-started billed job 404 against it.
      const victimId = putStoredResult('image/png', 'first');
      const nextOldestId = putStoredResult('image/png', 'second');
      for (let i = 2; i < 100; i++) putStoredResult('image/png', `entry-${i}`);

      expect(touchStoredResult(victimId)).toBe(true);

      putStoredResult('image/png', 'one-past-capacity');

      expect(getStoredResult(victimId)).toBeDefined();
      expect(getStoredResult(nextOldestId)).toBeUndefined();
    });
  });
});
