import { describe, expect, it } from 'vitest';
import { assertSourceStillAvailable } from '@/lib/ai/higgsfield.server';
import { isSourceExpiredError, putStoredResult, RESULT_URL_PREFIX } from '@/lib/ai/resultStore.server';

describe('assertSourceStillAvailable (reject an expired/missing stored source before a paid Higgsfield call)', () => {
  it('allows a static public asset path (never expires, no stored id)', () => {
    expect(() => assertSourceStillAvailable('/generated/concepts/living.svg')).not.toThrow();
    expect(() => assertSourceStillAvailable('/evidence/frames/00-00-16_open-social-zone.jpg')).not.toThrow();
    expect(() => assertSourceStillAvailable(undefined)).not.toThrow();
  });

  it('allows a stored result that still exists', () => {
    const id = putStoredResult('image/png', 'aGVsbG8=');
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
});
