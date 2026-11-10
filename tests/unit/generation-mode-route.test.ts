import { afterEach, describe, expect, it, vi } from 'vitest';

describe('GET /api/generation/mode', () => {
  const ORIGINAL_ENV = { ...process.env };

  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('reports both providers as demo mode when no credentials are set', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    process.env.AI_ALLOW_LIVE = 'true';
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: false, higgsfield: false });
  });

  it('keeps a configured provider in demo mode unless AI_ALLOW_LIVE is set', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    delete process.env.AI_ALLOW_LIVE;
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: false, higgsfield: false });
  });

  it('reports nano-banana as live once GEMINI_API_KEY and AI_ALLOW_LIVE are set, independent of higgsfield', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    process.env.AI_ALLOW_LIVE = 'true';
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: true, higgsfield: false });
  });

  it('reports higgsfield as live once HF_CREDENTIALS and AI_ALLOW_LIVE are set, independent of nano-banana', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    process.env.AI_ALLOW_LIVE = 'true';
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: false, higgsfield: true });
  });
});
