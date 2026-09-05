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
    launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE
      ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE }
      : undefined,
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
  },
});
