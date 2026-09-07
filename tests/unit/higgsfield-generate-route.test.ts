import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(body: unknown): NextRequest {
  return new NextRequest('http://localhost:3000/api/higgsfield/generate', {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

describe('POST /api/higgsfield/generate (server-side live-source enforcement)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('rejects a static concept-image path as the source for a LIVE submission', async () => {
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    process.env.AI_ALLOW_LIVE = 'true';
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    const res = await POST(makeRequest({ roomId: 'living', sourceAssetPath: '/generated/concepts/living.svg' }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.error).toMatch(/approved, previously generated concept image/i);
  });

  it('rejects a static evidence-frame path as the source for a LIVE submission', async () => {
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    process.env.AI_ALLOW_LIVE = 'true';
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    const res = await POST(makeRequest({ roomId: 'living', sourceAssetPath: '/evidence/frames/00-00-16_open-social-zone.jpg' }));
    expect(res.status).toBe(400);
  });

  it('lets a stored-result-shaped path through this check for a LIVE submission', async () => {
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    process.env.AI_ALLOW_LIVE = 'true';
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    // No real Higgsfield credentials/network exist in this test, and this id
    // was never actually stored — assertSourceStillAvailable() further
    // downstream rejects it as expired (410), not this route's own 400
    // "requires an approved... source" check, proving that check itself let
    // a genuine stored-result-shaped path through rather than blocking it.
    const res = await POST(makeRequest({ roomId: 'living', sourceAssetPath: '/api/generation/result/not-a-real-id' }));
    expect(res.status).toBe(410);
  });

  it('does not restrict the source path in demo mode (no live credentials)', async () => {
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    const res = await POST(makeRequest({ roomId: 'living', sourceAssetPath: '/generated/concepts/living.svg' }));
    expect(res.status).toBe(200);
    const data = await res.json();
    expect(data.demoMode).toBe(true);
  });
});
