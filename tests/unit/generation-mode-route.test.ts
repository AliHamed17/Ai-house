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
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: false, higgsfield: false });
  });

  it('reports nano-banana as live once GEMINI_API_KEY is set, independent of higgsfield', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: true, higgsfield: false });
  });

  it('reports higgsfield as live once HF_CREDENTIALS is set, independent of nano-banana', async () => {
    delete process.env.GEMINI_API_KEY;
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    vi.resetModules();
    const { GET } = await import('@/app/api/generation/mode/route');
    const data = await (await GET()).json();
    expect(data).toEqual({ nanoBanana: false, higgsfield: true });
  });
});
