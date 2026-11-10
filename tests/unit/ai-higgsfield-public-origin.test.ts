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

  it('rejects private IPv4 (RFC1918/link-local) origins', () => {
    expect(isPubliclyReachableOrigin('http://10.0.0.5/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://192.168.1.20/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://172.16.0.4/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://172.31.255.1/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://169.254.1.1/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://0.0.0.0/x.jpg')).toBe(false);
  });

  it('does not reject a public IPv4 address that merely starts like a private one', () => {
    // 172.32.x.x is outside the 172.16.0.0/12 private range (only 16-31 in
    // the second octet is private) — exercises real CIDR-boundary arithmetic,
    // not just a string-prefix check.
    expect(isPubliclyReachableOrigin('http://172.15.255.255/x.jpg')).toBe(true);
    expect(isPubliclyReachableOrigin('http://172.32.0.1/x.jpg')).toBe(true);
  });

  it('rejects private IPv6 origins: unique-local (ULA) and link-local', () => {
    expect(isPubliclyReachableOrigin('http://[fc00::1]/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://[fd12:3456::1]/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://[fe80::1]/x.jpg')).toBe(false);
  });

  it('rejects an IPv4-private address wrapped in IPv4-mapped IPv6 notation', () => {
    expect(isPubliclyReachableOrigin('http://[::ffff:127.0.0.1]/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('http://[::ffff:10.0.0.5]/x.jpg')).toBe(false);
  });

  it('accepts a public IPv6 address', () => {
    expect(isPubliclyReachableOrigin('http://[2001:db8::1]/x.jpg')).toBe(true);
    expect(isPubliclyReachableOrigin('http://[::ffff:8.8.8.8]/x.jpg')).toBe(true);
  });

  it('rejects non-http(s) schemes and malformed URLs', () => {
    expect(isPubliclyReachableOrigin('ftp://example.com/x.jpg')).toBe(false);
    expect(isPubliclyReachableOrigin('not a url')).toBe(false);
    expect(isPubliclyReachableOrigin('')).toBe(false);
  });
});
