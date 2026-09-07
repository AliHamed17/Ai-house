import { describe, expect, it } from 'vitest';
import { getIdempotentJobId, recordIdempotentJobId } from '@/lib/ai/idempotency.server';

describe('idempotency store (reconciles a retried submission instead of duplicating a billed job)', () => {
  it('returns undefined for a key that was never recorded', () => {
    expect(getIdempotentJobId('never-seen-key')).toBeUndefined();
  });

  it('returns undefined for an undefined key', () => {
    expect(getIdempotentJobId(undefined)).toBeUndefined();
  });

  it('returns the recorded jobId for a key that was recorded', () => {
    recordIdempotentJobId('key-a', 'job-abc');
    expect(getIdempotentJobId('key-a')).toBe('job-abc');
  });

  it('keeps distinct keys independent', () => {
    recordIdempotentJobId('key-b1', 'job-b1');
    recordIdempotentJobId('key-b2', 'job-b2');
    expect(getIdempotentJobId('key-b1')).toBe('job-b1');
    expect(getIdempotentJobId('key-b2')).toBe('job-b2');
  });

  it('recording with an undefined key is a no-op', () => {
    // Should not throw, and must not pollute lookups for a real key.
    expect(() => recordIdempotentJobId(undefined, 'job-should-not-be-stored')).not.toThrow();
  });
});
