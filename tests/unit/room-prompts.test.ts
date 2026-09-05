import { describe, expect, it } from 'vitest';
import { buildNanoBananaPrompt } from '@/data/roomPrompts';

describe('buildNanoBananaPrompt visitor instruction', () => {
  it('omits any visitor-instruction sentence when none is given', () => {
    const prompt = buildNanoBananaPrompt('living', 'warm-oak');
    expect(prompt).not.toMatch(/visitor request/i);
  });

  it('folds a visitor instruction into the full furnishing/material prompt rather than replacing it', () => {
    const prompt = buildNanoBananaPrompt('living', 'warm-oak', 'warm up the pendant light');
    // The instruction is honored...
    expect(prompt).toMatch(/visitor request: warm up the pendant light/i);
    // ...without dropping the room-specific furniture plan or palette brief a
    // paid first-ever generation still needs (this is the fix for Codex's
    // "edit prompt used with no approved source" finding: an edit instruction
    // typed before anything is approved must not silently swap out the whole
    // initial-generation brief for a bare "refine this" instruction).
    expect(prompt).toMatch(/furniture plan/i);
    expect(prompt).toMatch(/palette/i);
  });
});
