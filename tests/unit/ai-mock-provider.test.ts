import { describe, expect, it, vi } from 'vitest';
import { mockProvider } from '@/lib/ai/mockProvider.server';
import { decodeJobId, encodeJobId } from '@/lib/ai/jobId';

describe('mock generation provider', () => {
  it('round-trips a job id through encode/decode', () => {
    const jobId = encodeJobId({
      provider: 'mock',
      roomId: 'living',
      outputType: 'image',
      styleVariant: 'warm-oak',
      prompt: 'test prompt',
      createdAt: 1700000000000,
    });
    const decoded = decodeJobId(jobId);
    expect(decoded.roomId).toBe('living');
    expect(decoded.provider).toBe('mock');
  });

  it('rejects a corrupted job id', () => {
    expect(() => decodeJobId('not-a-real-job-id')).toThrow();
  });

  it('walks queued -> in_progress -> completed for the default (success) simulation', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'image',
      roomId: 'kitchen',
      styleVariant: 'warm-oak',
      prompt: 'p',
    });

    vi.setSystemTime(start + 100);
    expect((await mockProvider.status(jobId)).status).toBe('queued');

    vi.setSystemTime(start + 1500);
    expect((await mockProvider.status(jobId)).status).toBe('in_progress');

    vi.setSystemTime(start + 3000);
    const completed = await mockProvider.status(jobId);
    expect(completed.status).toBe('completed');
    expect(completed.resultUrl).toBe('/generated/concepts/kitchen.svg');
    vi.useRealTimers();
  });

  it('resolves to failed when simulate=failure is requested', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'image',
      roomId: 'mamad',
      styleVariant: 'warm-oak',
      prompt: 'p',
      simulate: 'failure',
    });
    vi.setSystemTime(start + 3000);
    const job = await mockProvider.status(jobId);
    expect(job.status).toBe('failed');
    expect(job.error).toBeTruthy();
    vi.useRealTimers();
  });

  it('resolves to moderated when simulate=moderated is requested', async () => {
    vi.useFakeTimers();
    const start = Date.now();
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'video',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
      simulate: 'moderated',
    });
    vi.setSystemTime(start + 3000);
    const job = await mockProvider.status(jobId);
    expect(job.status).toBe('moderated');
    expect(job.error).toBeTruthy();
    vi.useRealTimers();
  });

  it('never includes a model name that looks like a leaked credential', async () => {
    const { jobId } = await mockProvider.submit({
      provider: 'mock',
      outputType: 'image',
      roomId: 'living',
      styleVariant: 'warm-oak',
      prompt: 'p',
    });
    const job = await mockProvider.status(jobId);
    const serialized = JSON.stringify(job);
    expect(serialized).not.toMatch(/AIza[0-9A-Za-z_-]{10,}/); // Google API key shape
    expect(serialized).not.toMatch(/sk-[A-Za-z0-9]{10,}/);
  });
});
