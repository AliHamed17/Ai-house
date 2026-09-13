import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearGeneratedImages, getGeneratedImage, putGeneratedImage } from '@/lib/ai/resultStore.server';

const TTL_MS = 30 * 60 * 1000;

describe('generated image result store', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    clearGeneratedImages();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('round-trips a data url through a short opaque key', () => {
    const key = putGeneratedImage('data:image/png;base64,AAAA');
    expect(getGeneratedImage(key)).toBe('data:image/png;base64,AAAA');
  });

  it('returns a key far shorter than the payload it replaces', () => {
    const huge = `data:image/png;base64,${'A'.repeat(4_000_000)}`;
    const key = putGeneratedImage(huge);
    expect(key.length).toBeLessThan(64);
    expect(getGeneratedImage(key)).toBe(huge);
  });

  it('issues a distinct key per call', () => {
    expect(putGeneratedImage('a')).not.toBe(putGeneratedImage('a'));
  });

  it('returns undefined for an unknown key', () => {
    expect(getGeneratedImage('nope')).toBeUndefined();
  });

  it('expires an entry once its TTL has passed', () => {
    const key = putGeneratedImage('data:image/png;base64,AAAA');
    vi.advanceTimersByTime(TTL_MS + 1);
    expect(getGeneratedImage(key)).toBeUndefined();
  });

  it('keeps an entry that is still inside its TTL', () => {
    const key = putGeneratedImage('data:image/png;base64,AAAA');
    vi.advanceTimersByTime(TTL_MS - 1000);
    expect(getGeneratedImage(key)).toBe('data:image/png;base64,AAAA');
  });

  it('bounds memory by evicting the oldest entries past the cap', () => {
    const first = putGeneratedImage('first');
    for (let i = 0; i < 60; i++) putGeneratedImage(`filler-${i}`);
    expect(getGeneratedImage(first)).toBeUndefined();
  });

  it('still serves the most recent entry after heavy eviction', () => {
    for (let i = 0; i < 60; i++) putGeneratedImage(`filler-${i}`);
    const last = putGeneratedImage('last');
    expect(getGeneratedImage(last)).toBe('last');
  });
});
