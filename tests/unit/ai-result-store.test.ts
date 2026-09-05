import { describe, expect, it } from 'vitest';
import { getStoredResult, putStoredResult, RESULT_URL_PREFIX, resultIdFromPath } from '@/lib/ai/resultStore.server';

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
});
