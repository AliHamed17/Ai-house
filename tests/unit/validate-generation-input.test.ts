import { describe, expect, it } from 'vitest';
import { validateGenerationRequest } from '@/lib/ai/validateGenerationInput.server';

describe('generation request validation', () => {
  it('accepts a minimal valid request', () => {
    const result = validateGenerationRequest({ roomId: 'living' });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.data.roomId).toBe('living');
      expect(result.data.styleVariant).toBe('warm-oak');
    }
  });

  it('rejects an unknown roomId', () => {
    const result = validateGenerationRequest({ roomId: 'attic' });
    expect(result.ok).toBe(false);
  });

  it('rejects a non-object body', () => {
    expect(validateGenerationRequest(null).ok).toBe(false);
    expect(validateGenerationRequest('living').ok).toBe(false);
  });

  it('falls back to the default style variant for an unknown variant id', () => {
    const result = validateGenerationRequest({ roomId: 'kitchen', styleVariant: 'neon-cyberpunk' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.styleVariant).toBe('warm-oak');
  });

  it('rejects a sourceAssetPath that is not site-relative', () => {
    const result = validateGenerationRequest({ roomId: 'kitchen', sourceAssetPath: 'https://evil.example/x.jpg' });
    expect(result.ok).toBe(false);
  });

  it('rejects a sourceAssetPath containing path traversal', () => {
    const result = validateGenerationRequest({ roomId: 'kitchen', sourceAssetPath: '/evidence/../../etc/passwd' });
    expect(result.ok).toBe(false);
  });

  it('truncates an overly long editInstruction rather than rejecting it', () => {
    const result = validateGenerationRequest({ roomId: 'living', editInstruction: 'x'.repeat(1000) });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.editInstruction?.length).toBe(500);
  });

  it('only accepts known simulate values', () => {
    const good = validateGenerationRequest({ roomId: 'living', simulate: 'failure' });
    expect(good.ok && good.data.simulate).toBe('failure');
    const bad = validateGenerationRequest({ roomId: 'living', simulate: 'explode' });
    expect(bad.ok && bad.data.simulate).toBeUndefined();
  });

  it('accepts a well-formed idempotencyKey (a crypto.randomUUID() shape)', () => {
    const result = validateGenerationRequest({ roomId: 'living', idempotencyKey: '3fa85f64-5717-4562-b3fc-2c963f66afa6' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.idempotencyKey).toBe('3fa85f64-5717-4562-b3fc-2c963f66afa6');
  });

  it('omits idempotencyKey when absent (older clients)', () => {
    const result = validateGenerationRequest({ roomId: 'living' });
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.data.idempotencyKey).toBeUndefined();
  });

  it('rejects a malformed idempotencyKey', () => {
    expect(validateGenerationRequest({ roomId: 'living', idempotencyKey: 'has spaces' }).ok).toBe(false);
    expect(validateGenerationRequest({ roomId: 'living', idempotencyKey: 'x'.repeat(101) }).ok).toBe(false);
    expect(validateGenerationRequest({ roomId: 'living', idempotencyKey: '<script>' }).ok).toBe(false);
    expect(validateGenerationRequest({ roomId: 'living', idempotencyKey: '' }).ok).toBe(false);
  });
});
