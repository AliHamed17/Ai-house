#!/usr/bin/env node
/**
 * Generates deterministic, clearly-labeled placeholder "concept" SVGs used
 * when no Nano Banana / Higgsfield credentials are configured (demo mode).
 * These are intentionally abstract — palette + a few silhouette shapes and a
 * caption — never presented as real AI output. Real credentials replace
 * these via the actual provider adapters (see src/lib/ai/).
 *
 * Run with: node scripts/generate-placeholders.mjs
 */
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = path.resolve(__dirname, '../public/generated/concepts');
mkdirSync(OUT_DIR, { recursive: true });

const PALETTE = {
  ivory: '#F3EFE7',
  limestone: '#D8CFC2',
  oak: '#9A7656',
  taupe: '#8B7C6C',
  bronze: '#4B4037',
  charcoal: '#24221F',
  olive: '#73745F',
};

// Every selectable room in the AI Studio needs its own placeholder so a demo
// generation never resolves to a 404/broken preview. Keep this list in sync
// with the room ids in src/data/house.ts.
const ROOMS = [
  { id: 'stair_landing', label: 'Exterior Approach', tone: PALETTE.limestone },
  { id: 'balcony_service', label: 'Balcony / Landing', tone: PALETTE.limestone },
  { id: 'entry_hall', label: 'Entry Hall', tone: PALETTE.limestone },
  { id: 'living', label: 'Living Room', tone: PALETTE.limestone },
  { id: 'kitchen', label: 'Kitchen', tone: PALETTE.limestone },
  { id: 'dining', label: 'Dining Area', tone: PALETTE.limestone },
  { id: 'terrace_social', label: 'Terrace', tone: PALETTE.limestone },
  { id: 'mamad', label: 'MAMAD', tone: PALETTE.oak },
  { id: 'twin_bed', label: 'Twin Bedroom', tone: PALETTE.oak },
  { id: 'hall_south', label: 'Private Corridor', tone: PALETTE.limestone },
  { id: 'parents_bed', label: "Parents' Bedroom", tone: PALETTE.oak },
  { id: 'bathroom_main', label: 'Main Bathroom', tone: '#C9C1B4' },
  { id: 'bathroom_ensuite', label: "Parents' En-suite", tone: '#C9C1B4' },
  { id: 'wc_guest', label: 'Guest WC', tone: '#C9C1B4' },
];

function seededShapes(seed) {
  // Small deterministic PRNG (mulberry32) so each room gets a stable, unique
  // but reproducible arrangement without any external randomness dependency.
  let a = seed;
  function rand() {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const shapes = [];
  for (let i = 0; i < 5; i++) {
    const w = 60 + rand() * 160;
    const h = 40 + rand() * 120;
    const x = rand() * (800 - w);
    const y = 260 + rand() * (560 - 260 - h);
    const rx = 6 + rand() * 10;
    shapes.push({ x, y, w, h, rx });
  }
  return shapes;
}

function hashSeed(str) {
  let h = 0;
  for (let i = 0; i < str.length; i++) h = (Math.imul(31, h) + str.charCodeAt(i)) | 0;
  return h;
}

function buildSvg(room) {
  const shapes = seededShapes(hashSeed(room.id));
  const shapeMarkup = shapes
    .map((s) => `<rect x="${s.x.toFixed(1)}" y="${s.y.toFixed(1)}" width="${s.w.toFixed(1)}" height="${s.h.toFixed(1)}" rx="${s.rx.toFixed(1)}" fill="${PALETTE.bronze}" opacity="0.10" />`)
    .join('\n      ');

  return `<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600" viewBox="0 0 800 600">
  <defs>
    <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0%" stop-color="${PALETTE.ivory}" />
      <stop offset="100%" stop-color="${room.tone}" />
    </linearGradient>
  </defs>
  <rect width="800" height="600" fill="url(#bg)" />
  <rect x="16" y="16" width="768" height="568" fill="none" stroke="${PALETTE.bronze}" stroke-opacity="0.35" stroke-width="1.5" />
  ${shapeMarkup}
  <line x1="60" y1="240" x2="740" y2="240" stroke="${PALETTE.bronze}" stroke-opacity="0.25" stroke-width="1" />
  <text x="400" y="150" text-anchor="middle" font-family="Georgia, 'Times New Roman', serif" font-size="40" fill="${PALETTE.charcoal}">${room.label}</text>
  <text x="400" y="190" text-anchor="middle" font-family="Georgia, serif" font-size="17" font-style="italic" fill="${PALETTE.olive}">Warm-modern-luxury concept — placeholder</text>
  <rect x="290" y="520" width="220" height="34" rx="17" fill="${PALETTE.charcoal}" opacity="0.85" />
  <text x="400" y="543" text-anchor="middle" font-family="Arial, sans-serif" font-size="13" letter-spacing="0.5" fill="${PALETTE.ivory}">DEMO MODE — NOT AI-GENERATED</text>
</svg>`;
}

for (const room of ROOMS) {
  const svg = buildSvg(room);
  writeFileSync(path.join(OUT_DIR, `${room.id}.svg`), svg, 'utf8');
}

console.log(`Generated ${ROOMS.length} placeholder concept SVGs in ${OUT_DIR}`);
