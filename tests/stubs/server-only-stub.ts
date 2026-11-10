// Test-only stand-in for the `server-only` package.
//
// The real package throws if imported where a `window` global exists, which
// is how Next.js's build guarantees these modules never reach a client
// bundle (verified separately by `npm run build` succeeding — see README).
// Vitest runs everything in one process regardless of a file's declared
// environment, so the real package's window-check would fire incorrectly
// here; this stub is aliased in vitest.config.mts for tests only and never
// ships in the app itself.
export {};
