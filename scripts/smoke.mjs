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
page.on('console', (msg) => {
  if (msg.type() === 'error') errors.push(`console.error: ${msg.text()}`);
});

console.log('--- Loading landing page ---');
await page.goto(BASE, { waitUntil: 'networkidle' });
await shot(page, '01-landing-hero.png');

await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight * 0.25));
await page.waitForTimeout(300);
await shot(page, '02-landing-evidence.png');

await page.evaluate(() => document.querySelector('#floor-plan')?.scrollIntoView());
await page.waitForTimeout(300);
await shot(page, '03-landing-floorplan.png');

// Hover a room polygon on the floor plan to confirm interactivity.
const firstRoomPolygon = page.locator('#floor-plan svg polygon').first();
await firstRoomPolygon.hover();
await page.waitForTimeout(200);
await shot(page, '04-landing-floorplan-hover.png');

await page.evaluate(() => document.querySelector('#materials')?.scrollIntoView());
await page.waitForTimeout(200);
await shot(page, '05-landing-materials.png');

await page.evaluate(() => document.querySelector('#comparisons')?.scrollIntoView());
await page.waitForTimeout(200);
await shot(page, '06-landing-comparisons.png');

await page.evaluate(() => document.querySelector('#ai-studio')?.scrollIntoView());
await page.waitForTimeout(200);
await shot(page, '07-landing-ai-studio.png');

console.log('--- Testing AI Studio demo generation ---');
await page.getByRole('button', { name: /Generate concept image/i }).click();
await page.waitForTimeout(4500);
await shot(page, '08-ai-studio-completed.png');

console.log('--- Entering 3D explorer ---');
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole('button', { name: 'Enter 3D' }).first().click();
await page.waitForTimeout(2500);
await shot(page, '09-explorer-first-person.png');

console.log('--- Switching to Dollhouse/orbit mode ---');
await page.getByRole('button', { name: 'Dollhouse', exact: true }).click();
await page.waitForTimeout(1200);
await shot(page, '10-explorer-orbit.png');

console.log('--- Switching to Floor Plan mode ---');
await page.getByRole('button', { name: 'Floor Plan', exact: true }).click();
await page.waitForTimeout(600);
await shot(page, '11-explorer-floorplan-mode.png');

console.log('--- Back to Walk mode, testing WASD movement ---');
await page.getByRole('button', { name: 'Walk', exact: true }).click();
await page.waitForTimeout(600);
const canvas = page.locator('canvas');
await canvas.click({ position: { x: 700, y: 450 } });
await page.mouse.move(700, 450);
await page.mouse.move(900, 400, { steps: 10 });
await page.keyboard.down('KeyW');
await page.waitForTimeout(800);
await page.keyboard.up('KeyW');
await page.waitForTimeout(200);
await shot(page, '12-explorer-after-move-look.png');

console.log('--- Releasing pointer lock (Esc) before using HUD buttons again ---');
await page.keyboard.press('Escape');
await page.waitForTimeout(300);

console.log('--- Opening help panel ---');
await page.getByRole('button', { name: /Help/i }).click();
await page.waitForTimeout(300);
await shot(page, '13-explorer-help.png');
await page.getByRole('button', { name: 'Got it' }).click();

console.log('--- Opening Rooms navigator and jumping to MAMAD ---');
await page.getByRole('button', { name: /Rooms/ }).click();
await page.waitForTimeout(200);
await page.locator('#room-navigator-panel').getByRole('button', { name: /^MAMAD/ }).click();
await page.waitForTimeout(900);
await shot(page, '14-explorer-mamad.png');

console.log('--- Toggling evening lighting ---');
await page.getByRole('button', { name: /Evening/ }).click();
await page.waitForTimeout(500);
await shot(page, '15-explorer-evening.png');

console.log('--- Exiting 3D ---');
await page.getByRole('button', { name: /Exit 3D/ }).click();
await page.waitForTimeout(400);
await shot(page, '16-back-to-landing.png');

console.log('\n--- Console/page errors captured ---');
if (errors.length === 0) {
  console.log('NONE');
} else {
  for (const e of errors) console.log(e);
}

await browser.close();
