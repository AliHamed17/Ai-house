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

// Wait until the WebGL canvas has actually painted a non-trivial frame
// (software rendering can take many seconds to produce the first frame).
async function waitForCanvasPainted(page, timeoutMs = 45000) {
  const start = Date.now();
  while (Date.now() - start < timeoutMs) {
    const ok = await page.evaluate(() => {
      const c = document.querySelector('canvas');
      if (!c) return false;
      const r = c.getBoundingClientRect();
      return r.width > 200 && r.height > 200;
    });
    if (ok) {
      // Give the renderer a few extra frames to settle lighting/geometry.
      await page.waitForTimeout(2500);
      return true;
    }
    await page.waitForTimeout(500);
  }
  return false;
}

async function enter3D(page) {
  await page.goto(BASE, { waitUntil: 'domcontentloaded' });
  await page.getByRole('button', { name: 'Enter 3D' }).first().click();
  await page.getByRole('dialog', { name: /Interactive 3D house explorer/i }).waitFor({ state: 'visible', timeout: 15000 });
  const painted = await waitForCanvasPainted(page);
  console.log('canvas painted:', painted);
  return painted;
}

async function step(name, fn) {
  try {
    await fn();
  } catch (e) {
    console.log(`STEP FAILED [${name}]: ${e.message.split('\n')[0]}`);
  }
}

const page = await browser.newPage({ viewport: { width: 1400, height: 900 } });
page.on('pageerror', (err) => errors.push(`pageerror: ${err.message}`));
page.on('console', (msg) => { if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`); });

console.log('--- Entering 3D explorer (first-person) ---');
await enter3D(page);
await shot(page, '09-explorer-first-person.png');

await step('dollhouse', async () => {
  await page.getByRole('button', { name: 'Dollhouse', exact: true }).click({ timeout: 45000 });
  await page.waitForTimeout(2500);
  await shot(page, '10-explorer-orbit.png');
});

await step('floorplan-mode', async () => {
  await page.getByRole('button', { name: 'Floor Plan', exact: true }).click({ timeout: 45000 });
  await page.waitForTimeout(1200);
  await shot(page, '11-explorer-floorplan-mode.png');
});

await step('walk-and-look', async () => {
  await page.getByRole('button', { name: 'Walk', exact: true }).click({ timeout: 45000 });
  await page.waitForTimeout(1500);
  const canvas = page.locator('canvas');
  await canvas.click({ position: { x: 700, y: 450 } });
  await page.mouse.move(700, 450);
  await page.mouse.move(950, 400, { steps: 12 });
  await page.keyboard.down('KeyW');
  await page.waitForTimeout(900);
  await page.keyboard.up('KeyW');
  await page.waitForTimeout(300);
  await shot(page, '12-explorer-after-move-look.png');
  await page.keyboard.press('Escape');
  await page.waitForTimeout(400);
});

await step('help', async () => {
  await page.getByRole('button', { name: /Help/i }).click({ timeout: 20000 });
  await page.waitForTimeout(400);
  await shot(page, '13-explorer-help.png');
  await page.getByRole('button', { name: 'Got it' }).click();
  await page.waitForTimeout(300);
});

await step('mamad-jump', async () => {
  await page.getByRole('button', { name: /Rooms/ }).click({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.locator('#room-navigator-panel').getByRole('button', { name: /^MAMAD/ }).click();
  await page.waitForTimeout(2000);
  await shot(page, '14-explorer-mamad.png');
});

await step('evening', async () => {
  await page.getByRole('button', { name: /Evening/ }).click({ timeout: 20000 });
  await page.waitForTimeout(1500);
  await shot(page, '15-explorer-evening.png');
});

await step('kitchen-jump', async () => {
  await page.getByRole('button', { name: /Day/ }).click({ timeout: 20000 });
  await page.waitForTimeout(600);
  await page.getByRole('button', { name: /Rooms/ }).click();
  await page.waitForTimeout(300);
  await page.locator('#room-navigator-panel').getByRole('button', { name: /^Kitchen/ }).click();
  await page.waitForTimeout(2000);
  await shot(page, '15b-explorer-kitchen.png');
});

await step('material-variant', async () => {
  await page.getByRole('button', { name: /Materials/i }).click({ timeout: 20000 });
  await page.waitForTimeout(300);
  await page.getByRole('button', { name: /Cool Stone/i }).click();
  await page.waitForTimeout(1500);
  await shot(page, '15c-explorer-material-variant.png');
});

await step('exit', async () => {
  await page.getByRole('button', { name: /Exit 3D/ }).click({ timeout: 20000 });
  await page.waitForTimeout(500);
});

console.log('\n--- errors ---');
console.log(errors.length ? errors.join('\n') : 'NONE');
await page.close();

// --- WebGL-unavailable fallback ---
console.log('\n--- WebGL fallback ---');
await step('webgl-fallback', async () => {
  const fb = await browser.newPage({ viewport: { width: 1400, height: 900 } });
  await fb.addInitScript(() => {
    const proto = window.HTMLCanvasElement.prototype;
    const original = proto.getContext;
    proto.getContext = function patched(type, ...args) {
      if (typeof type === 'string' && type.toLowerCase().includes('webgl')) return null;
      return original.call(this, type, ...args);
    };
  });
  await fb.goto(BASE, { waitUntil: 'domcontentloaded' });
  await fb.getByRole('button', { name: 'Enter 3D' }).first().click();
  await fb.waitForTimeout(1500);
  await shot(fb, '17-webgl-fallback.png');
  await fb.close();
});

// --- Mobile ---
console.log('\n--- Mobile ---');
await step('mobile', async () => {
  const ctx = await browser.newContext({
    viewport: { width: 412, height: 915 },
    hasTouch: true, isMobile: true,
    userAgent: 'Mozilla/5.0 (Linux; Android 14; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0.0.0 Mobile Safari/537.36',
  });
  const mp = await ctx.newPage();
  await mp.goto(BASE, { waitUntil: 'domcontentloaded' });
  await mp.waitForTimeout(800);
  await shot(mp, '18-mobile-landing.png');
  await mp.getByRole('button', { name: 'Enter 3D' }).first().tap();
  await mp.getByRole('dialog', { name: /Interactive 3D house explorer/i }).waitFor({ state: 'visible', timeout: 15000 });
  await waitForCanvasPainted(mp);
  await shot(mp, '19-mobile-explorer-joystick.png');
  await ctx.close();
});

await browser.close();
console.log('\nDONE');
