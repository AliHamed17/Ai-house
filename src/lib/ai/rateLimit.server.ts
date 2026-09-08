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

export function clientKeyFromRequest(request: Request): string {
  const forwardedFor = request.headers.get('x-forwarded-for');
  return forwardedFor?.split(',')[0]?.trim() || 'anonymous';
}

// hitsByKey's size is otherwise unobservable from outside this module — this
// exists only so a test can verify the sweep above actually keeps it bounded
// rather than growing without limit.
export function _trackedClientKeyCountForTests(): number {
  return hitsByKey.size;
}
