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
