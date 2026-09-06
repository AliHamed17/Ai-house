import { describe, expect, it } from 'vitest';
import { isPubliclyReachableOrigin } from '@/lib/ai/higgsfield.server';

describe('isPubliclyReachableOrigin (reject a source Higgsfield could never fetch before a paid call)', () => {
  it('accepts a public https origin', () => {
    expect(isPubliclyReachableOrigin('https://my-house.example.com/evidence/frames/x.jpg')).toBe(true);
    expect(isPubliclyReachableOrigin('https://my-house.vercel.app/generated/concepts/living.svg')).toBe(true);
  });

  it('accepts a public http origin (unusual, but reachable)', () => {
    expect(isPubliclyReachableOrigin('http://my-house.example.com/x.jpg')).toBe(true);
  });

  it('rejects localhost and loopback origins', () => {
    expect(isPubliclyReachableOrigin('http://localhost:3000/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://127.0.0.1:3000/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://[::1]:3000/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://sub.localhost/x.jpg')).toBe(false);
  });

  it('rejects private-network (RFC1918/link-local) origins', () => {
    expect(isPubliclyReachableOrigin('http://10.0.0.5/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://192.168.1.20/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://172.16.0.4/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://172.31.255.1/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://169.254.1.1/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://0.0.0.0/x.jpg')).toBe(false);
  });

  it('does not reject a public address that merely starts like a private one', () => {
    // 172.32.x.x is outside the 172.16.0.0/12 private range (only 16-31 in
    // the second octet is private) and 10 itself is only private as a
    // leading octet, not a public host that happens to contain "10.".
    expect(isPubliclyReachableOrigin('http://172.32.0.1/x.jpg')).toBe(true);
  });

  it('rejects non-http(s) schemes and malformed URLs', () => {
    expect(isPubliclyReachableOrigin('ftp://example.com/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('not a url')).toBe(false);
    expect(isPubliclyReachableOrigin('')).toBe(false);
  });
});
