import 'server-only';
import { randomUUID } from 'node:crypto';

// Nano Banana returns image bytes inline; encoding them into the job id makes a
// multi-megabyte URL that proxies reject with HTTP 414, so only a key travels.
const TTL_MS = 30 * 60 * 1000;
const MAX_ENTRIES = 50;

interface StoredResult {
  dataUrl: string;
  createdAt: number;
}

const store = new Map<string, StoredResult>();

function evictExpired(now: number): void {
  for (const [key, entry] of store) {
    if (now - entry.createdAt > TTL_MS) store.delete(key);
  }
}

export function putGeneratedImage(dataUrl: string): string {
  const now = Date.now();
  evictExpired(now);
  while (store.size >= MAX_ENTRIES) {
    const oldest = store.keys().next();
    if (oldest.done) break;
    store.delete(oldest.value);
  }
  const key = randomUUID();
  store.set(key, { dataUrl, createdAt: now });
  return key;
}

export function getGeneratedImage(key: string): string | undefined {
  const entry = store.get(key);
  if (!entry) return undefined;
  if (Date.now() - entry.createdAt > TTL_MS) {
    store.delete(key);
    return undefined;
  }
  return entry.dataUrl;
}

export function clearGeneratedImages(): void {
  store.clear();
}
