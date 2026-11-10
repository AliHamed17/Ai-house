/**
 * Render one pixel-stable still per transformation stage from the real 3D
 * house, through the headless /transformation-frame route.
 *
 * This is the step that guarantees the sequence's hardest invariant: because
 * every stage is the same scene graph viewed from the same constant camera,
 * the architecture physically cannot drift, morph or breathe between stages.
 * Nothing here asks a generative model to re-derive the room.
 *
 *   node scripts/render-stage-stills.mjs [--base http://localhost:3000] [--out .transformation-work/stages]
 *
 * Requires the app to be running (npm run build && npm run start).
 * Stage ids, count and order come from /api/transformation/manifest — the
 * same TypeScript manifest the app renders from — never from a local copy.
 */

import { chromium } from '@playwright/test';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';

function arg(name, fallback) {
  const i = process.argv.indexOf(`--${name}`);
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : fallback;
}

const BASE = arg('base', process.env.TRANSFORMATION_BASE_URL ?? 'http://localhost:3000');
const OUT_DIR = arg('out', '.transformation-work/stages');
// Published, publicly fetchable copies — see stageStillPath() in
// src/lib/ai/transformationClips.server.ts, which is what Higgsfield is
// pointed at for image-to-video.
const PUBLIC_DIR = arg('public-out', 'public/transformation/stages');

async function main() {
  const manifestRes = await fetch(`${BASE}/api/transformation/manifest`);
  if (!manifestRes.ok) {
    throw new Error(`Could not read manifest from ${BASE} (HTTP ${manifestRes.status}). Is the app running?`);
  }
  const manifest = await manifestRes.json();
  if (!manifest.valid) {
    throw new Error(`Manifest is invalid, refusing to render:\n  - ${manifest.problems.join('\n  - ')}`);
  }

  const { widthPx, heightPx } = manifest.output;
  await mkdir(OUT_DIR, { recursive: true });
  await mkdir(PUBLIC_DIR, { recursive: true });

  const browser = await chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE || undefined,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-lcd-text'],
  });
  const context = await browser.newContext({
    viewport: { width: widthPx, height: heightPx },
    deviceScaleFactor: 1,
    reducedMotion: 'reduce',
  });
  const page = await context.newPage();

  const errors = [];
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  page.on('pageerror', (e) => errors.push(String(e)));

  const rendered = [];
  for (const stage of manifest.stages) {
    const url = `${BASE}/transformation-frame?stage=${encodeURIComponent(stage.id)}`;
    await page.goto(url, { waitUntil: 'networkidle' });
    await page.waitForSelector('main[data-render-ready="true"]', { timeout: 45_000 });
    // The scene is static once ready, but give the renderer one settled beat
    // so shadow maps and any suspended texture load are definitely committed.
    await page.waitForTimeout(450);

    const file = path.join(OUT_DIR, `${String(stage.index).padStart(2, '0')}-${stage.id}.png`);
    await page.screenshot({ path: file, animations: 'disabled' });

    // Also publish a compressed copy under public/. Higgsfield fetches its
    // source image from ITS OWN servers, so a still that only exists in the
    // gitignored work directory could never be animated; publishing it is
    // what makes the image-to-video path real rather than theoretical. It
    // also gives the UI and the QA contact sheet something to reference.
    const published = path.join(PUBLIC_DIR, `${stage.id}.jpg`);
    await page.screenshot({ path: published, type: 'jpeg', quality: 82, animations: 'disabled' });
    rendered.push({
      stageId: stage.id,
      index: stage.index,
      file,
      publishedPath: `/transformation/stages/${stage.id}.jpg`,
      start: stage.start,
      end: stage.end,
      lighting: stage.lighting,
      visibleFurnitureIds: stage.visibleFurnitureIds,
    });
    process.stdout.write(`  rendered ${stage.id} -> ${file}\n`);
  }

  await browser.close();

  const indexFile = path.join(OUT_DIR, 'stills.json');
  await writeFile(
    indexFile,
    JSON.stringify(
      {
        generatedAt: new Date().toISOString(),
        base: BASE,
        camera: manifest.camera,
        output: manifest.output,
        durationSec: manifest.durationSec,
        stills: rendered,
      },
      null,
      2,
    ),
  );

  if (errors.length > 0) {
    process.stderr.write(`\nPage errors during render (${errors.length}):\n${errors.join('\n')}\n`);
    process.exitCode = 1;
    return;
  }
  process.stdout.write(`\n${rendered.length} stage stills -> ${OUT_DIR}\n`);
}

main().catch((err) => {
  process.stderr.write(`${err.stack ?? err}\n`);
  process.exit(1);
});
