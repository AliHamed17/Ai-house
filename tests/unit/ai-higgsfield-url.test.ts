import { describe, expect, it } from 'vitest';
import { isTrustedHiggsfieldUrl } from '@/lib/ai/higgsfield.server';

describe('isTrustedHiggsfieldUrl (credential-exfiltration guard)', () => {
  it('accepts the documented Higgsfield hosts over https', () => {
    expect(isTrustedHiggsfieldUrl('https://platform.higgsfield.ai/requests/abc/status')).toBe(true);
    expect(isTrustedHiggsfieldUrl('https://higgsfield.ai/x')).toBe(true);
    expect(isTrustedHiggsfieldUrl('https://cloud.higgsfield.ai/x')).toBe(true);
    expect(isTrustedHiggsfieldUrl('https://api.higgsfield.ai/x')).toBe(true); // any subdomain
  });

  it('rejects attacker-controlled and look-alike hosts', () => {
    expect(isTrustedHiggsfieldUrl('https://attacker.example.com/steal')).toBe(false);
    // Suffix look-alike that must not match an endsWith('.higgsfield.ai') test naively.
    expect(isTrustedHiggsfieldUrl('https://higgsfield.ai.attacker.com/x')).toBe(false);
    expect(isTrustedHiggsfieldUrl('https://nothiggsfield.ai/x')).toBe(false);
  });

  it('rejects non-https and malformed URLs (no plaintext credential leak)', () => {
    expect(isTrustedHiggsfieldUrl('http://platform.higgsfield.ai/x')).toBe(false);
    expect(isTrustedHiggsfieldUrl('ftp://platform.higgsfield.ai/x')).toBe(false);
    expect(isTrustedHiggsfieldUrl('not a url')).toBe(false);
    expect(isTrustedHiggsfieldUrl('')).toBe(false);
  });
});
