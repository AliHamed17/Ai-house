import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

// clientKeyFromRequest is the one thing standing between the 12-per-minute
// generation rate limit and a caller who can freely rotate X-Forwarded-For
// to obtain a fresh key on every request. These tests exercise both the
// safe default (no trusted proxy configured) and the configured-hop-count
// behavior directly, since a mistake here silently defeats the limiter
// rather than throwing.
describe('clientKeyFromRequest (rate-limit key must not be caller-forgeable)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('ignores X-Forwarded-For entirely when no trusted proxy hop is configured, and rotating it never yields a fresh key (regression)', async () => {
    delete process.env.TRUSTED_PROXY_HOPS;
    vi.resetModules();
    const { clientKeyFromRequest } = await import('@/lib/ai/rateLimit.server');
    const first = clientKeyFromRequest(new Request('https://example.com/x', { headers: { 'x-forwarded-for': '1.2.3.4' } }));
    const second = clientKeyFromRequest(new Request('https://example.com/x', { headers: { 'x-forwarded-for': '9.9.9.9' } }));
    expect(first).toBe('anonymous');
    expect(second).toBe('anonymous');
  });

  it('with one trusted proxy hop, takes the entry that hop appended, not the caller-supplied first one', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    vi.resetModules();
    const { clientKeyFromRequest } = await import('@/lib/ai/rateLimit.server');
    // A single trusted proxy appends the address it actually saw connecting
    // to it, after whatever the caller originally sent.
    const request = new Request('https://example.com/x', {
      headers: { 'x-forwarded-for': 'attacker-forged-value, 203.0.113.9' },
    });
    expect(clientKeyFromRequest(request)).toBe('203.0.113.9');
  });

  it('an attacker cannot bypass a configured hop count by prepending extra fake entries (regression)', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    vi.resetModules();
    const { clientKeyFromRequest } = await import('@/lib/ai/rateLimit.server');
    const genuine = clientKeyFromRequest(new Request('https://example.com/x', { headers: { 'x-forwarded-for': 'real-client, 203.0.113.9' } }));
    const withForgedPrefix = clientKeyFromRequest(
      new Request('https://example.com/x', { headers: { 'x-forwarded-for': 'fake1, fake2, fake3, 203.0.113.9' } }),
    );
    // Both resolve to the SAME key (the one entry the trusted hop actually
    // appended) — padding the header with junk cannot shift what this
    // deployment reads, since it always counts from the right.
    expect(withForgedPrefix).toBe(genuine);
  });

  it('with two trusted proxy hops, takes the entry the first (client-facing) hop actually observed', async () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    vi.resetModules();
    const { clientKeyFromRequest } = await import('@/lib/ai/rateLimit.server');
    // client-sent, real-client-as-seen-by-hop1, hop1-as-seen-by-hop2
    const request = new Request('https://example.com/x', {
      headers: { 'x-forwarded-for': 'attacker-forged-value, 203.0.113.9, 198.51.100.2' },
    });
    expect(clientKeyFromRequest(request)).toBe('203.0.113.9');
  });

  it('falls back to the safe default when the header has fewer entries than the configured hop count, rather than guessing', async () => {
    process.env.TRUSTED_PROXY_HOPS = '2';
    vi.resetModules();
    const { clientKeyFromRequest } = await import('@/lib/ai/rateLimit.server');
    const request = new Request('https://example.com/x', { headers: { 'x-forwarded-for': 'only-one-entry' } });
    expect(clientKeyFromRequest(request)).toBe('anonymous');
  });

  it('falls back to the safe default when a hop count is configured but the header is absent entirely', async () => {
    process.env.TRUSTED_PROXY_HOPS = '1';
    vi.resetModules();
    const { clientKeyFromRequest } = await import('@/lib/ai/rateLimit.server');
    expect(clientKeyFromRequest(new Request('https://example.com/x'))).toBe('anonymous');
  });
});
