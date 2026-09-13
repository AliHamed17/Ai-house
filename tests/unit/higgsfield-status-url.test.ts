import { describe, expect, it } from 'vitest';
import { resolveHiggsfieldStatusUrl } from '@/lib/ai/higgsfield.server';

// Job ids are unsigned base64url and arrive from the client, so a forged
// `higgsfieldStatusUrl` would otherwise be fetched with the HF secret attached.
describe('resolveHiggsfieldStatusUrl — credential exfiltration guard', () => {
  const REQUEST_ID = 'req_abc123';
  const FALLBACK = `https://platform.higgsfield.ai/requests/${REQUEST_ID}/status`;

  it('accepts the canonical Higgsfield host', () => {
    const url = 'https://platform.higgsfield.ai/requests/req_abc123/status';
    expect(resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: url, higgsfieldRequestId: REQUEST_ID })).toBe(url);
  });

  it('accepts other higgsfield.ai subdomains', () => {
    const url = 'https://cloud.higgsfield.ai/v1/requests/req_abc123';
    expect(resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: url, higgsfieldRequestId: REQUEST_ID })).toBe(url);
  });

  it('rejects an attacker-controlled host and falls back to the canonical URL', () => {
    expect(
      resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: 'https://attacker.example/collect', higgsfieldRequestId: REQUEST_ID }),
    ).toBe(FALLBACK);
  });

  it('rejects a look-alike suffix host (higgsfield.ai.attacker.com)', () => {
    expect(
      resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: 'https://higgsfield.ai.attacker.com/x', higgsfieldRequestId: REQUEST_ID }),
    ).toBe(FALLBACK);
  });

  it('rejects a look-alike prefix host (evilhiggsfield.ai)', () => {
    expect(
      resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: 'https://evilhiggsfield.ai/x', higgsfieldRequestId: REQUEST_ID }),
    ).toBe(FALLBACK);
  });

  it('rejects plaintext http even on a trusted host', () => {
    expect(
      resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: 'http://platform.higgsfield.ai/x', higgsfieldRequestId: REQUEST_ID }),
    ).toBe(FALLBACK);
  });

  it('rejects non-http schemes that could read local state', () => {
    expect(
      resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: 'file:///etc/passwd', higgsfieldRequestId: REQUEST_ID }),
    ).toBe(FALLBACK);
  });

  it('rejects a malformed URL', () => {
    expect(resolveHiggsfieldStatusUrl({ higgsfieldStatusUrl: 'not a url', higgsfieldRequestId: REQUEST_ID })).toBe(FALLBACK);
  });

  it('builds the canonical URL when no status URL was returned', () => {
    expect(resolveHiggsfieldStatusUrl({ higgsfieldRequestId: REQUEST_ID })).toBe(FALLBACK);
  });

  it('throws rather than path-traverse when the request id is not a safe token', () => {
    expect(() => resolveHiggsfieldStatusUrl({ higgsfieldRequestId: '../../admin/keys' })).toThrow(/request id/i);
  });

  it('throws when there is neither a trusted URL nor a request id', () => {
    expect(() => resolveHiggsfieldStatusUrl({})).toThrow(/request id/i);
  });
});
