import { describe, expect, it, vi } from 'vitest';
import { assertSourceStillAvailable } from '@/lib/ai/higgsfield.server';
import {
  assertStoredResultRoom,
  getStoredResult,
  isSourceExpiredError,
  isSourceRoomMismatchError,
  putStoredResult,
  RESULT_URL_PREFIX,
} from '@/lib/ai/resultStore.server';

describe('assertSourceStillAvailable (reject an expired/missing stored source before a paid Higgsfield call)', () => {
  it('allows a static public asset path (never expires, no stored id)', () => {
    expect(() => assertSourceStillAvailable('/generated/concepts/living.svg')).not.toThrow();
    expect(() => assertSourceStillAvailable('/evidence/frames/00-00-16_open-social-zone.jpg')).not.toThrow();
    expect(() => assertSourceStillAvailable(undefined)).not.toThrow();
  });

  it('allows a stored result that still exists', () => {
    const id = putStoredResult('image/png', 'aGVsbG8=', 'living');
    expect(() => assertSourceStillAvailable(`${RESULT_URL_PREFIX}${id}`)).not.toThrow();
  });

  it('rejects a stored-result path whose id no longer exists (expired or never existed)', () => {
    expect(() => assertSourceStillAvailable(`${RESULT_URL_PREFIX}not-a-real-id`)).toThrow(/expired/i);
  });

  it('the rejection is recognized by isSourceExpiredError, so the route can turn it into a 410 (regression)', () => {
    try {
      assertSourceStillAvailable(`${RESULT_URL_PREFIX}not-a-real-id`);
      throw new Error('expected assertSourceStillAvailable to throw');
    } catch (error) {
      expect(isSourceExpiredError(error)).toBe(true);
    }
  });

  it('refreshes the stored result\'s TTL as a side effect, so a slower Higgsfield fetch does not race the original expiry (regression)', () => {
    // A preflight check that only READS whether the source still exists
    // isn't enough: a source with only seconds left could pass it and still
    // expire before Higgsfield's servers (on their own, separate schedule)
    // actually fetch the URL. This must also EXTEND the TTL, not just check it.
    vi.useFakeTimers();
    try {
      const id = putStoredResult('image/png', 'aGVsbG8=', 'living');
      vi.advanceTimersByTime(59 * 60_000); // close to, but not past, the 60-minute TTL
      expect(() => assertSourceStillAvailable(`${RESULT_URL_PREFIX}${id}`)).not.toThrow();

      // Past the ORIGINAL 60-minute TTL (118 min total) — still alive only if
      // the check above actually refreshed the clock rather than just reading it.
      vi.advanceTimersByTime(59 * 60_000);
      expect(getStoredResult(id)).toBeDefined();
      expect(() => assertSourceStillAvailable(`${RESULT_URL_PREFIX}${id}`)).not.toThrow();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe('assertStoredResultRoom (a billed clip may only animate ITS OWN room\'s image)', () => {
  it('allows a stored result generated for the same room', () => {
    const id = putStoredResult('image/png', 'aGVsbG8=', 'kitchen');
    expect(() => assertStoredResultRoom(id, 'kitchen')).not.toThrow();
  });

  it('rejects a stored result generated for a different room', () => {
    // The attack this closes: a directly-reachable route accepting a valid
    // living-room result while naming the kitchen, so a real billed job
    // animates the wrong image against the wrong prompt. Validating the
    // path's URL shape alone cannot tell these apart.
    const id = putStoredResult('image/png', 'aGVsbG8=', 'living');
    expect(() => assertStoredResultRoom(id, 'kitchen')).toThrow();
    try {
      assertStoredResultRoom(id, 'kitchen');
    } catch (error) {
      expect(isSourceRoomMismatchError(error)).toBe(true);
    }
  });

  it('defers to the availability preflight for a missing or absent id', () => {
    // Not this function's job to report expiry — assertSourceStillAvailable
    // owns that, and mislabelling it here would give the caller the wrong
    // error for a source that simply aged out.
    expect(() => assertStoredResultRoom(undefined, 'kitchen')).not.toThrow();
    expect(() => assertStoredResultRoom('not-a-real-id', 'kitchen')).not.toThrow();
  });
});
