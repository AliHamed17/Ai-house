import { describe, expect, it } from 'vitest';
import { safeErrorSummary } from '@/lib/ai/errorLogging.server';

describe('safeErrorSummary', () => {
  it("reduces an Error to just its name and message, never any other property it carries (regression: a raw provider SDK error object can carry the full outgoing request, including an installed credential, and must never reach a log line directly)", () => {
    const error = new Error('Request failed with status code 500') as Error & {
      config?: { headers?: Record<string, string> };
      response?: unknown;
    };
    error.config = { headers: { Authorization: 'Key super-secret-credential' } };
    error.response = { data: 'also should never be logged' };

    const summary = safeErrorSummary(error);

    expect(summary).toBe('Error: Request failed with status code 500');
    expect(summary).not.toContain('super-secret-credential');
    expect(summary).not.toContain('Authorization');
  });

  it('preserves a custom Error subclass name', () => {
    // Subclassing Error does not set .name to the subclass name on its own
    // (it inherits Error.prototype.name = 'Error' unless overridden) — this
    // mirrors how this codebase's own custom errors set it explicitly.
    class ProviderTimeoutError extends Error {
      constructor(message: string) {
        super(message);
        this.name = 'ProviderTimeoutError';
      }
    }
    const error = new ProviderTimeoutError('timed out after 30000ms');

    expect(safeErrorSummary(error)).toBe('ProviderTimeoutError: timed out after 30000ms');
  });

  it('falls back to a plain string for a non-Error thrown value, and to a generic message for anything else', () => {
    expect(safeErrorSummary('a plain string failure')).toBe('a plain string failure');
    expect(safeErrorSummary({ some: 'object' })).toBe('Unknown error');
    expect(safeErrorSummary(undefined)).toBe('Unknown error');
  });
});
