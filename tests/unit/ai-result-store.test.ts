import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  _clearStoreForTests,
  getStoredResult,
  isResultStoreAtCapacity,
  isResultStoreAtCapacityError,
  putStoredResult,
  RESULT_STORE_AT_CAPACITY_MESSAGE,
  RESULT_URL_PREFIX,
  resultIdFromPath,
  touchStoredResult,
} from '@/lib/ai/resultStore.server';

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

    it('does not evict the next-oldest entry just because a touch moved another one past it (regression)', () => {
      // putStoredResult used to evict the single oldest entry once the store
      // reached MAX_ENTRIES — this test originally proved a touch protected
      // itself from that eviction. putStoredResult no longer evicts anything
      // (see isResultStoreAtCapacity below: capacity is refused BEFORE a
      // paid call starts, not by discarding an unpolled result afterward),
      // so the entry this touch used to displace into eviction must now
      // survive right alongside it.
      const touchedId = putStoredResult('image/png', 'first');
      const otherId = putStoredResult('image/png', 'second');
      for (let i = 2; i < 100; i++) putStoredResult('image/png', `entry-${i}`);

      expect(touchStoredResult(touchedId)).toBe(true);

      putStoredResult('image/png', 'one-past-capacity');

      expect(getStoredResult(touchedId)).toBeDefined();
      expect(getStoredResult(otherId)).toBeDefined();
    });
  });

  describe('isResultStoreAtCapacity / RESULT_STORE_AT_CAPACITY_MESSAGE (reserves capacity before a paid call, instead of evicting an unpolled result after one)', () => {
    beforeEach(() => {
      // Every other describe block above shares the module-level store and
      // never clears it, which is fine there since none of those tests
      // depend on an exact count — this one does, so it needs a clean slate
      // regardless of what earlier tests in this file already inserted.
      _clearStoreForTests();
    });

    it('is false below MAX_ENTRIES and true once it is reached', () => {
      expect(isResultStoreAtCapacity()).toBe(false);
      for (let i = 0; i < 99; i++) putStoredResult('image/png', `entry-${i}`);
      expect(isResultStoreAtCapacity()).toBe(false);
      putStoredResult('image/png', 'entry-99');
      expect(isResultStoreAtCapacity()).toBe(true);
    });

    it('does not count already-expired entries toward capacity', () => {
      vi.useFakeTimers();
      try {
        for (let i = 0; i < 100; i++) putStoredResult('image/png', `entry-${i}`);
        expect(isResultStoreAtCapacity()).toBe(true);
        vi.advanceTimersByTime(11 * 60_000); // past the 10-minute TTL
        expect(isResultStoreAtCapacity()).toBe(false);
      } finally {
        vi.useRealTimers();
      }
    });

    it('recognizes exactly the shared at-capacity message and nothing else', () => {
      expect(isResultStoreAtCapacityError(new Error(RESULT_STORE_AT_CAPACITY_MESSAGE))).toBe(true);
      expect(isResultStoreAtCapacityError(new Error('some other failure'))).toBe(false);
      expect(isResultStoreAtCapacityError('not an Error instance')).toBe(false);
      expect(isResultStoreAtCapacityError(undefined)).toBe(false);
    });
  });
});
