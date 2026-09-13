import { afterEach, describe, expect, it, vi } from 'vitest';

describe('provider registry demo-mode fallback', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('falls back to the mock provider when GEMINI_API_KEY is absent', async () => {
    delete process.env.GEMINI_API_KEY;
    vi.resetModules();
    const { resolveProviderForSubmit } = await import('@/lib/ai/registry.server');
    const { provider, demoMode } = resolveProviderForSubmit('nano-banana');
    expect(demoMode).toBe(true);
    expect(provider.id).toBe('mock');
  });

  it('falls back to the mock provider when Higgsfield credentials are absent', async () => {
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    vi.resetModules();
    const { resolveProviderForSubmit } = await import('@/lib/ai/registry.server');
    const { provider, demoMode } = resolveProviderForSubmit('higgsfield');
    expect(demoMode).toBe(true);
    expect(provider.id).toBe('mock');
  });

  it('stays in demo mode when a key is set but live generation is not explicitly enabled', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    delete process.env.AI_ALLOW_LIVE;
    vi.resetModules();
    const { resolveProviderForSubmit } = await import('@/lib/ai/registry.server');
    const { provider, demoMode } = resolveProviderForSubmit('nano-banana');
    expect(demoMode).toBe(true);
    expect(provider.id).toBe('mock');
  });

  it('selects the real nano-banana provider only once GEMINI_API_KEY AND AI_ALLOW_LIVE are set', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    process.env.AI_ALLOW_LIVE = 'true';
    vi.resetModules();
    const { resolveProviderForSubmit } = await import('@/lib/ai/registry.server');
    const { provider, demoMode } = resolveProviderForSubmit('nano-banana');
    expect(demoMode).toBe(false);
    expect(provider.id).toBe('nano-banana');
  });

  it('dispatches status checks by the id encoded in the job, regardless of which route is hit', async () => {
    vi.resetModules();
    const { resolveProviderById } = await import('@/lib/ai/registry.server');
    expect(resolveProviderById('mock').id).toBe('mock');
    expect(resolveProviderById('nano-banana').id).toBe('nano-banana');
    expect(resolveProviderById('higgsfield').id).toBe('higgsfield');
  });
});
