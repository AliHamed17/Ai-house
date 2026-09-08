import 'server-only';

/**
 * A simple in-memory sliding-window rate limiter. Adequate for a single
 * prototype instance; a multi-instance/serverless production deployment
 * should replace this with a shared store (e.g. Upstash Redis) since this
 * map does not survive cold starts and is not shared across instances.
 */
const WINDOW_MS = 60_000;
const MAX_REQUESTS_PER_WINDOW = 12;
const hitsByKey = new Map<string, number[]>();

export function checkRateLimit(key: string): { allowed: boolean; retryAfterMs: number } {
  const now = Date.now();
  // Sweeps every key, not just the one being checked — the filter below only
  // ever prunes the CURRENT key's own timestamps, so a distinct client key
  // that never returns (many unique client IPs/addresses over the life of a
  // long-running instance) would otherwise sit in this map forever even
  // though its window expired ages ago, growing it without bound.
  for (const [otherKey, timestamps] of hitsByKey) {
    if (timestamps.every((t) => now - t >= WINDOW_MS)) hitsByKey.delete(otherKey);
  }

  const recent = (hitsByKey.get(key) ?? []).filter((t) => now - t < WINDOW_MS);
  if (recent.length >= MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false, retryAfterMs: WINDOW_MS - (now - recent[0]) };
  }
  recent.push(now);
  hitsByKey.set(key, recent);
  return { allowed: true, retryAfterMs: 0 };
}

// X-Forwarded-For is a plain request header: any caller can send one, and a
// proxy that merely forwards traffic typically APPENDS to it rather than
// replacing it — so the first entry is still whatever the original caller
// put there, letting an attacker rotate it to get a fresh rate-limit key on
// every request. The only entries a caller cannot forge are the ones
// appended by this deployment's own trusted infrastructure, counted from
// the RIGHT (each trusted hop appends exactly one more entry as the request
// passes through it). TRUSTED_PROXY_HOPS says how many such hops actually
// sit in front of this app; it defaults to 0 — no trusted proxy configured
// (e.g. self-hosted directly) — in which case the header is never consulted
// at all and every caller shares one rate-limit bucket: coarser, but never
// bypassable via header rotation. Set it to the number of reverse
// proxies/load balancers this deployment genuinely sits behind.
const TRUSTED_PROXY_HOPS = Math.max(0, Number.parseInt(process.env.TRUSTED_PROXY_HOPS ?? '', 10) || 0);

export function clientKeyFromRequest(request: Request): string {
  if (TRUSTED_PROXY_HOPS <= 0) return 'anonymous';
  const forwardedFor = request.headers.get('x-forwarded-for');
  if (!forwardedFor) return 'anonymous';
  const parts = forwardedFor
    .split(',')
    .map((part) => part.trim())
    .filter(Boolean);
  const index = parts.length - TRUSTED_PROXY_HOPS;
  // Fewer entries than the configured hop count means this chain doesn't
  // match what the deployment is configured to trust — never guess which
  // remaining entry might be the real one.
  return index >= 0 ? parts[index] || 'anonymous' : 'anonymous';
}

// hitsByKey's size is otherwise unobservable from outside this module — this
// exists only so a test can verify the sweep above actually keeps it bounded
// rather than growing without limit.
export function _trackedClientKeyCountForTests(): number {
  return hitsByKey.size;
}
