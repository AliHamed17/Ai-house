import { describe, expect, it } from 'vitest';
import { decodeJobId, encodeJobId, type JobIdPayload } from '@/lib/ai/jobId';

// Job ids are the one thing an unauthenticated caller fully controls on a
// later request (/api/generation/status/[id]), and this app keeps no
// server-side record of which ids it actually issued — every fact a
// provider's status() needs comes straight from the id itself. Without a
// signature, a forged id could carry arbitrary fields — most dangerously,
// provider: 'higgsfield' paired with an attacker-chosen higgsfieldStatusUrl,
// which status() would otherwise fetch WITH this server's own credentials
// attached (see higgsfield.server.ts). These tests exercise the signature
// layer directly; ai-higgsfield-url.test.ts and the higgsfieldProvider.status
// tests cover the defense-in-depth URL-shape layer on top of it.
describe('job id signing (a forged or tampered job id must never decode)', () => {
  const basePayload: JobIdPayload = {
    provider: 'mock',
    roomId: 'living',
    outputType: 'image',
    styleVariant: 'warm-oak',
    prompt: 'p',
    createdAt: Date.now(),
  };

  it('round-trips a genuinely issued job id', () => {
    const jobId = encodeJobId(basePayload);
    const decoded = decodeJobId(jobId);
    expect(decoded.roomId).toBe('living');
    expect(decoded.provider).toBe('mock');
  });

  it('rejects a string with no signature segment at all', () => {
    expect(() => decodeJobId('not-a-real-job-id')).toThrow();
  });

  it('rejects a tampered signature, even a single flipped character (regression)', () => {
    const jobId = encodeJobId(basePayload);
    const dotIndex = jobId.indexOf('.');
    const payloadB64 = jobId.slice(0, dotIndex);
    const signature = jobId.slice(dotIndex + 1);
    const tamperedSignature = signature.slice(0, -1) + (signature.endsWith('A') ? 'B' : 'A');
    expect(() => decodeJobId(`${payloadB64}.${tamperedSignature}`)).toThrow();
  });

  it('rejects a genuinely different payload paired with another payload\'s otherwise-valid signature (regression)', () => {
    // Proves the signature is bound to THESE exact payload bytes, not just
    // "some signature this server once issued" — an attacker who has seen
    // one real job id cannot splice its signature onto a payload of their
    // own choosing.
    const { signature } = splitJobId(encodeJobId(basePayload));
    const attackerPayload: JobIdPayload = {
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'x',
      prompt: 'p',
      createdAt: Date.now(),
      higgsfieldRequestId: 'x',
      higgsfieldStatusUrl: 'https://attacker.example.com/steal-credentials',
    };
    const forgedPayloadB64 = Buffer.from(JSON.stringify(attackerPayload), 'utf8').toString('base64url');
    expect(() => decodeJobId(`${forgedPayloadB64}.${signature}`)).toThrow();
  });

  it('rejects an entirely fabricated payload+signature pair (an attacker has no way to compute a valid signature without the server\'s own secret)', () => {
    const attackerPayload = {
      provider: 'higgsfield',
      roomId: 'living',
      outputType: 'video',
      styleVariant: 'x',
      prompt: 'p',
      createdAt: Date.now(),
      higgsfieldRequestId: 'x',
      higgsfieldStatusUrl: 'https://attacker.example.com/steal-credentials',
    };
    const forgedPayloadB64 = Buffer.from(JSON.stringify(attackerPayload), 'utf8').toString('base64url');
    expect(() => decodeJobId(`${forgedPayloadB64}.whatever-guessed-signature`)).toThrow();
  });

  it('still enforces the required-fields check on a payload that IS validly signed', () => {
    // The signature check and the shape check are independent layers —
    // a valid signature alone must not be enough to skip validating shape.
    const incomplete = encodeJobId({ ...basePayload, roomId: undefined as unknown as JobIdPayload['roomId'] });
    expect(() => decodeJobId(incomplete)).toThrow();
  });
});

function splitJobId(jobId: string): { payloadB64: string; signature: string } {
  const dotIndex = jobId.indexOf('.');
  return { payloadB64: jobId.slice(0, dotIndex), signature: jobId.slice(dotIndex + 1) };
}
