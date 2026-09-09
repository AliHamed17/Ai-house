import { describe, expect, it } from 'vitest';
import { buildNanoBananaEditPrompt, buildNanoBananaPrompt } from '@/data/roomPrompts';

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

describe('buildNanoBananaEditPrompt protected-room clearances (regression)', () => {
  it('instructs the model to keep MAMAD\'s door, window, and clearances unobstructed, not just unresized', () => {
    // NEGATIVE_CONSTRAINTS alone only forbids changing an opening's
    // geometry — an edit instruction like "add cabinetry under the window"
    // doesn't resize or relocate anything, so it would slip past that
    // constraint while still violating MAMAD's protected-clearance
    // requirement if this sentence weren't added explicitly.
    const prompt = buildNanoBananaEditPrompt('mamad', 'add a wardrobe under the window');
    expect(prompt).toMatch(/protected emergency-shelter door and window/i);
    expect(prompt).toMatch(/clearances.*unobstructed/i);
  });

  it('omits the protected-clearance sentence for a room with no protected openings', () => {
    const prompt = buildNanoBananaEditPrompt('living', 'add a wardrobe under the window');
    expect(prompt).not.toMatch(/protected emergency-shelter/i);
  });
});
