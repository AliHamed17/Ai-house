import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL = { ...process.env };

async function registry() {
  vi.resetModules();
  return import('@/lib/ai/registry.server');
}

beforeEach(() => {
  delete process.env.AI_FORCE_DEMO;
  delete process.env.GEMINI_API_KEY;
  delete process.env.GOOGLE_API_KEY;
  delete process.env.HF_CREDENTIALS;
  delete process.env.HF_API_KEY;
  delete process.env.HF_API_SECRET;
});

afterEach(() => {
  process.env = { ...ORIGINAL };
});

describe('AI_FORCE_DEMO', () => {
  it('reports nano-banana live when a key is present', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    const { isProviderConfigured } = await registry();
    expect(isProviderConfigured('nano-banana')).toBe(true);
  });

  it('accepts GOOGLE_API_KEY as well as GEMINI_API_KEY', async () => {
    process.env.GOOGLE_API_KEY = 'test-key';
    const { isProviderConfigured } = await registry();
    expect(isProviderConfigured('nano-banana')).toBe(true);
  });

  it.each(['1', 'true'])('forces demo with AI_FORCE_DEMO=%s even with real credentials', async (flag) => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.HF_CREDENTIALS = 'id:secret';
    process.env.AI_FORCE_DEMO = flag;
    const { isProviderConfigured, isDemoForced } = await registry();
    expect(isDemoForced()).toBe(true);
    expect(isProviderConfigured('nano-banana')).toBe(false);
    expect(isProviderConfigured('higgsfield')).toBe(false);
  });

  it('routes a forced-demo submission to the mock provider, never the billed one', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.AI_FORCE_DEMO = '1';
    const { resolveProviderForSubmit } = await registry();
    const resolved = resolveProviderForSubmit('nano-banana');
    expect(resolved.demoMode).toBe(true);
    expect(resolved.provider.id).toBe('mock');
  });

  it('does not force demo for an unrelated truthy-looking value', async () => {
    process.env.GEMINI_API_KEY = 'test-key';
    process.env.AI_FORCE_DEMO = '0';
    const { isDemoForced, isProviderConfigured } = await registry();
    expect(isDemoForced()).toBe(false);
    expect(isProviderConfigured('nano-banana')).toBe(true);
  });

  it('still reports demo when no credentials exist at all', async () => {
    const { isProviderConfigured } = await registry();
    expect(isProviderConfigured('nano-banana')).toBe(false);
    expect(isProviderConfigured('higgsfield')).toBe(false);
  });
});
