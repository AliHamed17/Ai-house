import { afterEach, describe, expect, it, vi } from 'vitest';

const ORIGINAL_ENV = { ...process.env };

describe('higgsfieldProvider.submit (trusted asset origin, never derived from the request)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('refuses to submit when PUBLIC_ASSET_ORIGIN is not configured', async () => {
    delete process.env.PUBLIC_ASSET_ORIGIN;
    vi.resetModules();
    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');
    await expect(
      higgsfieldProvider.submit({
        provider: 'higgsfield',
        outputType: 'video',
        roomId: 'living',
        styleVariant: 'warm-oak',
        sourceAssetPath: '/generated/concepts/living.svg',
        prompt: 'test prompt',
      }),
    ).rejects.toThrow(/PUBLIC_ASSET_ORIGIN is not configured/i);
  });

  it('refuses to submit when PUBLIC_ASSET_ORIGIN is itself a private/loopback address', async () => {
    process.env.PUBLIC_ASSET_ORIGIN = 'http://localhost:3000';
    vi.resetModules();
    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');
    await expect(
      higgsfieldProvider.submit({
        provider: 'higgsfield',
        outputType: 'video',
        roomId: 'living',
        styleVariant: 'warm-oak',
        sourceAssetPath: '/generated/concepts/living.svg',
        prompt: 'test prompt',
      }),
    ).rejects.toThrow(/not publicly reachable/i);
  });

  it('passes both origin checks and proceeds to the next precondition (credentials) once configured', async () => {
    process.env.PUBLIC_ASSET_ORIGIN = 'https://my-house.example.com';
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    vi.resetModules();
    const { higgsfieldProvider } = await import('@/lib/ai/higgsfield.server');
    // Credentials are checked immediately after the origin checks pass, and
    // before the real Higgsfield SDK is ever imported — so reaching this
    // specific error (rather than an origin error) proves a well-configured
    // PUBLIC_ASSET_ORIGIN was accepted, without needing real credentials or
    // network access to exercise the rest of submit().
    await expect(
      higgsfieldProvider.submit({
        provider: 'higgsfield',
        outputType: 'video',
        roomId: 'living',
        styleVariant: 'warm-oak',
        sourceAssetPath: '/generated/concepts/living.svg',
        prompt: 'test prompt',
      }),
    ).rejects.toThrow(/Higgsfield credentials are not configured/i);
  });
});
