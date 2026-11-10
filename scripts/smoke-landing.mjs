import { chromium } from 'playwright';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';

// Resolved relative to this script (not any one authoring machine), so the
// smoke scripts work from any checkout. PLAYWRIGHT_CHROMIUM_EXECUTABLE (see
// playwright.config.ts) lets a sandboxed/offline environment point at a
// pre-installed Chromium instead of downloading one — omit it to fall back
// to Playwright's own default browser lookup.
const OUT = path.join(path.dirname(fileURLToPath(import.meta.url)), '..', 'smoke-output');
fs.mkdirSync(OUT, { recursive: true });
const BASE = 'http://localhost:3000';

const browser = await chromium.launch(
  process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE } : {},
);
const errors = [];
async function shot(page, name) {
  await page.screenshot({ path: path.join(OUT, name), fullPage: false });
  console.log('shot:', name);
}

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

await page.goto(BASE, { waitUntil: 'networkidle' });
await shot(page, '01-landing-hero.png');

await page.evaluate(() => document.querySelector('#floor-plan')?.scrollIntoView());
await page.waitForTimeout(400);
await page.locator('#floor-plan svg polygon').first().hover();
await page.waitForTimeout(300);
await shot(page, '03-landing-floorplan.png');

await page.evaluate(() => document.querySelector('#materials')?.scrollIntoView());
await page.waitForTimeout(300);
await shot(page, '05-landing-materials.png');

await page.evaluate(() => document.querySelector('#comparisons')?.scrollIntoView());
await page.waitForTimeout(300);
const slider = page.getByRole('slider').first();
await slider.focus();
for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft');
await page.waitForTimeout(200);
await shot(page, '06-landing-comparisons.png');

await page.evaluate(() => document.querySelector('#ai-studio')?.scrollIntoView());
await page.waitForTimeout(300);
await shot(page, '07-landing-ai-studio.png');

console.log('--- AI Studio: generate concept image (demo) ---');
await page.getByRole('button', { name: /Generate concept image/i }).click();
// Wait for the demo pipeline: queued -> in_progress -> completed (~3s).
await page.getByText('Complete', { exact: true }).waitFor({ state: 'visible', timeout: 15000 });
await page.waitForTimeout(500);
await shot(page, '08-ai-studio-completed.png');

console.log('\n--- errors ---');
console.log(errors.length ? errors.join('\n') : 'NONE');
await page.close();

// Mobile landing (clean).
const ctx = await browser.newContext({
  viewport: { width: 412, height: 915 }, hasTouch: true, isMobile: true,
  userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
});
const mp = await ctx.newPage();
await mp.goto(BASE, { waitUntil: 'networkidle' });
await shot(mp, '18-mobile-landing.png');
await ctx.close();

await browser.close();
console.log('DONE');
