import { afterEach, describe, expect, it, vi } from 'vitest';
import { NextRequest } from 'next/server';

const ORIGINAL_ENV = { ...process.env };

function makeRequest(url: string, body: unknown): NextRequest {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json' },
  });
}

// Without a stable, deployment-wide JOB_ID_SIGNING_SECRET, a live (billed)
// job's id would be signed with a fresh secret chosen at random for THIS
// process — a status check landing on a different serverless instance, or
// arriving after a restart, would then reject that job's otherwise-genuine
// id, permanently losing the only encoded request id needed to retrieve a
// paid result. Both live routes must refuse to even start such a job rather
// than risk that.
describe('generation routes require a stable JOB_ID_SIGNING_SECRET before any LIVE submission (regression)', () => {
  afterEach(() => {
    process.env = { ...ORIGINAL_ENV };
    vi.resetModules();
  });

  it('POST /api/nano-banana/generate returns 500 (never reaching submit) when live mode is on but JOB_ID_SIGNING_SECRET is unset', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    process.env.AI_ALLOW_LIVE = 'true';
    delete process.env.JOB_ID_SIGNING_SECRET;
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');
    const { JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE } = await import('@/lib/ai/jobId');

    const res = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living', liveRunConfirmed: true }));
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE);
  });

  it('POST /api/higgsfield/generate returns 500 (never reaching submit) when live mode is on but JOB_ID_SIGNING_SECRET is unset', async () => {
    process.env.HF_CREDENTIALS = 'test-id:test-secret';
    process.env.AI_ALLOW_LIVE = 'true';
    delete process.env.JOB_ID_SIGNING_SECRET;
    vi.resetModules();
    const { POST } = await import('@/app/api/higgsfield/generate/route');
    const { JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE } = await import('@/lib/ai/jobId');

    const res = await POST(
      makeRequest('http://localhost:3000/api/higgsfield/generate', {
        roomId: 'living',
        sourceAssetPath: '/api/generation/result/some-real-looking-id',
        liveRunConfirmed: true,
      }),
    );
    expect(res.status).toBe(500);
    expect((await res.json()).error).toBe(JOB_ID_SIGNING_SECRET_REQUIRED_MESSAGE);
  });

  it('never gates a genuinely demo-mode submission behind JOB_ID_SIGNING_SECRET (baseline)', async () => {
    delete process.env.GEMINI_API_KEY;
    delete process.env.HF_CREDENTIALS;
    delete process.env.HF_API_KEY;
    delete process.env.HF_API_SECRET;
    delete process.env.AI_ALLOW_LIVE;
    delete process.env.JOB_ID_SIGNING_SECRET;
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    const res = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living' }));
    expect(res.status).toBe(200);
    expect((await res.json()).demoMode).toBe(true);
  });

  it('proceeds past this gate once JOB_ID_SIGNING_SECRET is configured — the NEXT gate (liveRunConfirmed) is reached instead, proving this one specifically passed', async () => {
    process.env.GEMINI_API_KEY = 'test-key-not-real';
    process.env.AI_ALLOW_LIVE = 'true';
    process.env.JOB_ID_SIGNING_SECRET = 'test-signing-secret';
    vi.resetModules();
    const { POST } = await import('@/app/api/nano-banana/generate/route');

    // No liveRunConfirmed here — if the signing-secret gate were still
    // blocking, this would be 500; getting 428 instead proves it passed.
    const res = await POST(makeRequest('http://localhost:3000/api/nano-banana/generate', { roomId: 'living' }));
    expect(res.status).toBe(428);
  });
});
