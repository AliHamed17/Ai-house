import { defineConfig, devices } from '@playwright/test';

/**
 * PLAYWRIGHT_CHROMIUM_EXECUTABLE lets a sandboxed/offline environment point
 * at a pre-installed Chromium binary instead of downloading one; leave it
 * unset for a normal `npx playwright install` setup.
 */
export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: true,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  // Each 3D-explorer test drives its own real WebGL context; running many
  // of those in parallel on a software-rendered/sandboxed GPU causes real
  // timeouts that never happen for an actual user on real hardware. One
  // worker trades wall-clock time for reliability, which is the right
  // tradeoff for a WebGL-heavy suite like this one.
  workers: 1,
  reporter: [['list']],
  // Software-rendered WebGL in a sandboxed CI-like environment can be far
  // slower per-frame than a real GPU; give the 3D-explorer tests headroom
  // to match, rather than tuning the app to an artificial time budget.
  timeout: 60_000,
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: {
      ...(process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
        ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
        : {}),
      // This suite drives dozens of real WebGL contexts in sequence. On a
      // CI runner the browser renders with software GL (SwiftShader) and
      // shares memory through /dev/shm, which defaults to a tiny 64 MB and
      // fills up under sustained WebGL load — the browser process then dies
      // mid-test with "Internal server error, session closed". These flags
      // keep software WebGL deterministic and move shared memory to /tmp so
      // the process survives the whole run. They are harmless locally (both
      // environments are software-rendered anyway).
      args: [
        '--disable-dev-shm-usage',
        '--use-gl=angle',
        '--use-angle=swiftshader',
        '--enable-unsafe-swiftshader',
        '--disable-gpu-sandbox',
      ],
    },
  },
  projects: [
    {
      name: 'chromium-desktop',
      testIgnore: ['**/mobile.spec.ts'],
      use: { ...devices['Desktop Chrome'], viewport: { width: 1400, height: 900 } },
    },
    {
      // Mobile gets its own touch/viewport-specific spec — hover-driven
      // desktop interactions (and the desktop-only nav bar) don't apply.
      name: 'mobile',
      testMatch: ['**/mobile.spec.ts'],
      use: { ...devices['Pixel 7'] },
    },
  ],
  webServer: {
    command: 'npm run build && npm run start',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
    env: {
      // The generate rate limiter is 12 requests per rolling 60 s per client
      // key, and with the production default (TRUSTED_PROXY_HOPS unset, so
      // every caller collapses to 'anonymous' — see rateLimit.server) the
      // ENTIRE suite is one client. Dozens of tests legitimately drive real
      // generations, so whether any given test got throttled depended on how
      // fast the tests before it happened to run: a genuine, load-dependent
      // flake in which a passing test fails because an unrelated one ran
      // quickly. Telling the test server it sits behind exactly one trusted
      // hop lets each test present its own X-Forwarded-For and get its own
      // bucket (see the beforeEach in tests/e2e/ai-studio.spec.ts), so tests
      // stop paying for each other.
      //
      // This is the harness's configuration, not the app's: the default stays
      // 0, no deployment is changed, and nothing here weakens what is tested —
      // no e2e test exercises the real limiter (the 429 cases all fulfil the
      // status themselves), while the limiter and this exact header parsing
      // are covered directly by tests/unit/ai-rate-limit*.test.ts.
      TRUSTED_PROXY_HOPS: '1',
    },
  },
});
