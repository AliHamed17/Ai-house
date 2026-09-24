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

describe('buildNanoBananaPrompt reasserts protected-room clearances after a visitor instruction (regression)', () => {
  it('reasserts MAMAD\'s clearance requirement AFTER a conflicting visitor instruction, not just earlier in the furniture plan', () => {
    // A visitor instruction appended after the furniture plan's own
    // clearance wording could otherwise have the last word — e.g. "place
    // full-height storage in front of the window" directly conflicts with
    // the earlier protection, and NEGATIVE_CONSTRAINTS only forbids
    // changing an opening's geometry, not obstructing it.
    const prompt = buildNanoBananaPrompt('mamad', 'warm-oak', 'place full-height storage in front of the window');
    const visitorIndex = prompt.toLowerCase().indexOf('visitor request');
    const clearanceIndex = prompt.toLowerCase().indexOf('protected emergency-shelter');
    expect(visitorIndex).toBeGreaterThan(-1);
    expect(clearanceIndex).toBeGreaterThan(-1);
    expect(clearanceIndex).toBeGreaterThan(visitorIndex);
  });

  it('omits the protected-clearance sentence for a non-protected room\'s visitor instruction', () => {
    const prompt = buildNanoBananaPrompt('living', 'warm-oak', 'add a bookshelf under the window');
    expect(prompt).not.toMatch(/protected emergency-shelter/i);
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
