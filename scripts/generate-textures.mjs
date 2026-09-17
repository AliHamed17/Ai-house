#!/usr/bin/env node
/**
 * Generates seamless, tileable material texture PNGs for the 3D viewer's
 * floors/walls, replacing flat solid-color materials with real surface
 * detail (wood grain, mottled stone, plaster speckle).
 *
 * Tiles are authored as SVG (deterministic mulberry32 PRNG, same approach as
 * generate-placeholders.mjs) then rasterized to PNG with the Chromium build
 * Playwright already installs for this project's own e2e suite — no new
 * native dependency (no canvas/sharp) for CI to install. Rasterizing to a
 * real PNG file (rather than loading the SVG directly as a three.js texture
 * at runtime) sidesteps inconsistent SVG-as-WebGL-texture rasterization
 * across browsers/GPUs — a real PNG decodes identically everywhere.
 *
 * Each tile is drawn on a neutral mid-gray base so `resolveFloorColor` /
 * `resolveWallColor`'s hex can still multiply it — texture only adds real
 * surface grain, it never changes what a material variant tints toward.
 *
 * Seamlessness: every shape is placed with its full extent inside the tile
 * bounds (never crossing an edge), so repeating the tile via
 * THREE.RepeatWrapping never shows a visible seam.
 *
 * Run with: node scripts/generate-textures.mjs
 */
import { mkdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from '@playwright/test';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../public/textures');
mkdirSync(OUT_DIR, { recursive: true });

const TILE = 256;
const BASE_GRAY = '#949494';

function seededRandom(seed) {
  // Mulberry32 — same small deterministic PRNG as generate-placeholders.mjs.
  let a = seed;
  return function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

/** Full-width horizontal plank/grain lines — trivially seamless vertically. */
function woodPlanks(rand, plankCount, lineOpacity) {
  const lines = [];
  for (let i = 1; i < plankCount; i++) {
    const y = (TILE / plankCount) * i;
    const shade = rand() > 0.5 ? '#00000022' : '#ffffff18';
    lines.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${TILE}" y2="${y.toFixed(1)}" stroke="${shade}" stroke-width="1.4" opacity="${lineOpacity}" />`);
  }
  // A couple of extra faint full-width lines per plank row for grain streaking,
  // still edge-safe since they too span the full tile width.
  for (let i = 0; i < plankCount; i++) {
    const rowTop = (TILE / plankCount) * i;
    const y = rowTop + rand() * (TILE / plankCount);
    lines.push(`<line x1="0" y1="${y.toFixed(1)}" x2="${TILE}" y2="${y.toFixed(1)}" stroke="#00000014" stroke-width="0.8" />`);
  }
  return lines.join('');
}

/** Soft mottled blobs, each fully inside the tile so wrapping stays seamless. */
function mottle(rand, count, minR, maxR, opacity) {
  const blobs = [];
  for (let i = 0; i < count; i++) {
    const r = minR + rand() * (maxR - minR);
    const cx = r + rand() * (TILE - 2 * r);
    const cy = r + rand() * (TILE - 2 * r);
    const shade = rand() > 0.5 ? '#00000012' : '#ffffff14';
    blobs.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${shade}" opacity="${opacity}" />`);
  }
  return blobs.join('');
}

/** Fine speckle — many tiny dots, also edge-safe. */
function speckle(rand, count, opacity) {
  const dots = [];
  for (let i = 0; i < count; i++) {
    const r = 0.6 + rand() * 1.1;
    const cx = r + rand() * (TILE - 2 * r);
    const cy = r + rand() * (TILE - 2 * r);
    const shade = rand() > 0.5 ? '#00000020' : '#ffffff20';
    dots.push(`<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r.toFixed(1)}" fill="${shade}" opacity="${opacity}" />`);
  }
  return dots.join('');
}

const MATERIALS = [
  { id: 'limestone-social', build: (rand) => mottle(rand, 60, 6, 16, 0.55) + speckle(rand, 120, 0.3) },
  { id: 'oak-bedroom', build: (rand) => woodPlanks(rand, 6, 0.5) },
  { id: 'stone-wet', build: (rand) => mottle(rand, 90, 4, 11, 0.5) + speckle(rand, 100, 0.35) },
  { id: 'stone-entry', build: (rand) => mottle(rand, 55, 7, 18, 0.5) + speckle(rand, 110, 0.3) },
  { id: 'exterior-stone', build: (rand) => mottle(rand, 40, 10, 26, 0.55) + speckle(rand, 70, 0.3) },
  { id: 'wall-warm-plaster', build: (rand) => speckle(rand, 260, 0.4) },
  { id: 'exterior-render', build: (rand) => mottle(rand, 45, 8, 20, 0.4) + speckle(rand, 200, 0.4) },
];

function buildSvg(materialId, build) {
  const rand = seededRandom(hashSeed(materialId));
  const content = build(rand);
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${TILE}" height="${TILE}" viewBox="0 0 ${TILE} ${TILE}">
  <rect width="${TILE}" height="${TILE}" fill="${BASE_GRAY}" />
  ${content}
</svg>
`;
}

const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const page = await browser.newPage({ viewport: { width: TILE, height: TILE }, deviceScaleFactor: 1 });

for (const { id, build } of MATERIALS) {
  const svg = buildSvg(id, build);
  await page.setContent(
    `<!doctype html><html><body style="margin:0;padding:0;width:${TILE}px;height:${TILE}px;">${svg}</body></html>`,
  );
  const pngPath = path.join(OUT_DIR, `${id}.png`);
  await page.screenshot({ path: pngPath, clip: { x: 0, y: 0, width: TILE, height: TILE } });
  console.log(`wrote public/textures/${id}.png`);
}

await browser.close();
