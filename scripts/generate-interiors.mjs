#!/usr/bin/env node
/**
 * Photoreal interiors via Nano Banana, anchored on each room's real frame.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const USAGE = 'Usage: node scripts/generate-interiors.mjs [--variant=<id>] [roomId...] [--dry] [--force]';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const FRAMES = path.join(REPO, 'public', 'evidence', 'frames');
const OUT_ROOT = path.join(REPO, 'public', 'generated', 'interiors');
const MANIFEST = path.join(REPO, 'src', 'data', 'interiors.ts');

const MODEL = process.env.NANO_BANANA_MODEL || 'gemini-3-pro-image';

function loadKey() {
  if (process.env.GEMINI_API_KEY) return process.env.GEMINI_API_KEY;
  if (process.env.GOOGLE_API_KEY) return process.env.GOOGLE_API_KEY;
  const envFile = path.join(REPO, '.env.local');
  if (existsSync(envFile)) {
    for (const line of readFileSync(envFile, 'utf8').split(/\r?\n/)) {
      const m = /^\s*(GEMINI_API_KEY|GOOGLE_API_KEY)\s*=\s*(.+?)\s*$/.exec(line);
      if (m) return m[2].replace(/^["']|["']$/g, '');
    }
  }
  throw new Error('No GEMINI_API_KEY / GOOGLE_API_KEY found in env or .env.local');
}

const VARIANTS = [
  {
    id: 'warm-oak',
    label: 'Warm Oak & Limestone',
    palette:
      'Warm ivory lime-plaster walls, natural rift-cut oak joinery, pale honed limestone and travertine floors, '
      + 'oatmeal and sand textiles, dark-bronze metal. Layered 2700K light, late-afternoon golden sun raking in.',
  },
  {
    id: 'cool-stone',
    label: 'Cool Stone & Champagne',
    palette:
      'Cool pale quartzite-grey stone floors with soft veining, smoked greyed-oak joinery, chalk off-white walls, '
      + 'pale grey and stone-coloured textiles, champagne and brushed-nickel metal. Crisp bright north daylight, '
      + 'cooler 3000K fill, cleaner and more gallery-like.',
  },
  {
    id: 'sand-linen',
    label: 'Sand & Linen',
    palette:
      'Sand and clay tones throughout, deep taupe and mushroom plaster walls, warm travertine floors, '
      + 'heavy washed linen and boucle in ecru and terracotta, aged unlacquered brass, one ochre accent. '
      + 'Soft diffused warm light, cocooning and textile-led, deeper contrast in the shadows.',
  },
];

const CAMERA = [
  'Shot on a full-frame camera with a 24mm tilt-shift lens, vertical lines kept perfectly vertical,',
  'f/8, natural depth, extremely high detail, physically accurate materials and reflections.',
].join(' ');

const NEGATIVE = [
  'No people, no pets, no text, no watermark, no logos, no floating objects,',
  'no warped or melted furniture, no impossible reflections, no extra doors or windows,',
  'no resized or relocated openings, no cartoon or CGI-plastic look, no fisheye distortion.',
].join(' ');

const ROOMS = [
  {
    id: 'living',
    title: 'Living Room',
    brief:
      'A low curved modular sofa facing the glazed west wall, two sculptural lounge chairs, a deep-pile wool rug, '
      + 'nested stone and timber coffee tables, and one calm textured-plaster media wall with concealed storage. '
      + 'Full-height curtains stacked clear of the glazing. Keep the round concrete columns exposed and rendered '
      + 'smooth as a design feature.',
  },
  {
    id: 'kitchen',
    title: 'Kitchen',
    brief:
      'Full-height cabinetry along the solid wall, fully integrated appliances, a stone worktop with a matching slab '
      + 'backsplash and a mitred edge, an undermount sink at the window, discreet under-cabinet task lighting, and a '
      + 'single long island with a waterfall end. Open and continuous with the living and dining space — no dividing wall.',
  },
  {
    id: 'dining',
    title: 'Dining Bay',
    brief:
      'A six-seat oval table with a honed stone top on a sculptural base, low-backed upholstered chairs, and one large '
      + 'sculptural pendant centred over the table. Reads as one continuous open volume with the kitchen and living room.',
  },
  {
    id: 'entry_hall',
    title: 'Entry Hall',
    brief:
      'A shallow floating console with a full-height mirror above it, a large-format stone floor, concealed shoe storage '
      + 'behind flush panelling, one ceramic bowl and a single stem of dried grass. Deliberately restrained — this is the '
      + 'first breath of the house, not a room to fill.',
  },
  {
    id: 'bedroom_parents',
    title: "Parents' Bedroom",
    brief:
      'A broad upholstered headboard wall spanning behind the bed, bedside tables with slim reading lights, a low bench '
      + 'at the foot, integrated flush wardrobes, and layered sheer plus blackout curtains on the corner windows. '
      + 'Calm, hotel-grade, uncluttered.',
  },
  {
    id: 'bedroom_twin',
    title: "Twin / Children's Bedroom",
    brief:
      'Two equivalent single beds with soft rounded edges, matching quilts, a long shared study surface under the window, '
      + 'balanced closed storage, a soft wool rug, and warm indirect cove lighting. Central floor left open. '
      + 'Grown-up materials, gentle scale — not a themed kids room.',
  },
  {
    id: 'bath_family',
    title: 'Family Shower Room',
    brief:
      'Continuous large-format stone-look porcelain on floor and walls, a floating vanity with an integrated stone basin, '
      + 'a backlit framed mirror, a generous walk-in shower behind frameless low-iron glass, a recessed shelf niche, '
      + 'and matching brassware. Spa-calm, no clutter.',
  },
  {
    id: 'wc',
    title: 'Guest WC',
    brief:
      'A compact jewel-box cloakroom: one sculptural stone basin on a slim shelf, a dramatic veined stone wall behind it, '
      + 'deeper matte walls elsewhere, a small framed mirror, and one warm wall light. '
      + 'A small room treated as a moment, not an afterthought.',
  },
  {
    id: 'corridor',
    title: 'Bedroom Corridor',
    brief:
      'Plaster walls, a continuous stone floor running through, flush doors with slim lever handles, a narrow runner, '
      + 'and a concealed cove light washing one wall. Keep the circulation completely clear — the corridor is narrow '
      + 'and must read generous.',
  },
  {
    id: 'mamad',
    title: 'MAMAD (Protected Room)',
    brief:
      'Used as a calm guest room: a low bed, a compact desk, and closed flush storage. '
      + 'CRITICAL REGULATORY CONSTRAINT: this is an Israeli protected room. The steel blast door, the steel-framed '
      + 'blast window and the round filtration penetration must remain exactly as shown, fully visible, completely '
      + 'unobstructed, and must NOT be restyled, concealed, curtained, panelled over or replaced. '
      + 'Furnish only the space that is left.',
  },
  {
    id: 'terrace_nw',
    title: 'North-West Terrace',
    brief:
      'Weather-resistant lounge seating with outdoor cushions, a low stone side table, large planters with olive and '
      + 'rosemary, a woven outdoor rug, and warm concealed lighting in the parapet. The rendered concrete corner pier '
      + 'stays exposed. Late golden-hour light.',
  },
  {
    id: 'stair_landing',
    title: 'Entry Stair & Landing',
    brief:
      'Honed stone treads with slim shadow-gap risers, a minimal handrail, integrated warm step lighting, smooth '
      + 'rendered flank walls, and a single sculptural planter at the landing. A generous, quiet arrival sequence.',
  },
];

function heroFrame(roomId) {
  const dir = path.join(FRAMES, roomId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  return files.length ? path.join(dir, files[0]) : null;
}

function buildPrompt(room, variant) {
  return [
    `Transform this unfinished construction photograph of a ${room.title} into a finished, photorealistic interior.`,
    'The supplied image is a HARD architectural reference. Keep the exact camera position and lens perspective,',
    'the exact wall positions and proportions, the exact ceiling height, and every window and door opening',
    'at its exact size and position. Keep the real view through the windows.',
    'Do not add, remove, resize or move any opening. Do not change the room shape.',
    `Design brief: ${room.brief}`,
    `Material and colour direction — "${variant.label}": ${variant.palette}`,
    'This is high-end architectural visualization in the language of a luxury property film.',
    CAMERA,
    'The result must look like a photograph of a real, buildable, finished room — not a 3D render.',
    NEGATIVE,
  ].join(' ');
}

function writeManifest() {
  const blocks = [];
  let total = 0;
  for (const variant of VARIANTS) {
    const dir = path.join(OUT_ROOT, variant.id);
    if (!existsSync(dir)) continue;
    const have = new Set(readdirSync(dir).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', '')));
    const entries = ROOMS.filter((r) => have.has(r.id));
    total += entries.length;
    blocks.push(
      `  '${variant.id}': {`,
      ...entries.map(
        (r) => `    ${r.id}: { path: '/generated/interiors/${variant.id}/${r.id}.png', title: ${JSON.stringify(r.title)} },`,
      ),
      '  },',
    );
  }
  const lines = [
    "import type { RoomId } from '@/lib/types';",
    '',
    'export interface InteriorRender {',
    '  path: string;',
    '  title: string;',
    '}',
    '',
    `export const interiorVariantIds = [${VARIANTS.map((v) => `'${v.id}'`).join(', ')}] as const;`,
    '',
    'export type InteriorVariantId = (typeof interiorVariantIds)[number];',
    '',
    'export const interiorVariantLabels: Record<InteriorVariantId, string> = {',
    ...VARIANTS.map((v) => `  '${v.id}': ${JSON.stringify(v.label)},`),
    '};',
    '',
    'export const interiorRendersByVariant: Record<InteriorVariantId, Partial<Record<RoomId, InteriorRender>>> = {',
    ...blocks,
    '};',
    '',
    "export const interiorRenders = interiorRendersByVariant['warm-oak'];",
    '',
  ];
  writeFileSync(MANIFEST, lines.join('\n'), 'utf8');
  return total;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`${USAGE}\nVariants: ${VARIANTS.map((v) => v.id).join(', ')}\nRooms: ${ROOMS.map((r) => r.id).join(', ')}`);
    return;
  }
  const dry = args.includes('--dry');
  const force = args.includes('--force');
  const variantArg = args.find((a) => a.startsWith('--variant='));
  const variantIds = variantArg ? variantArg.split('=')[1].split(',') : VARIANTS.map((v) => v.id);
  const wanted = args.filter((a) => !a.startsWith('--'));
  const todoRooms = wanted.length ? ROOMS.filter((r) => wanted.includes(r.id)) : ROOMS;

  const variants = VARIANTS.filter((v) => variantIds.includes(v.id));
  if (!variants.length || !todoRooms.length) {
    console.error(`Nothing to do.\n${USAGE}`);
    process.exit(1);
  }

  const ai = dry ? null : new GoogleGenAI({ apiKey: loadKey() });
  let ok = 0;
  let skipped = 0;
  let failed = 0;

  for (const variant of variants) {
    const outDir = path.join(OUT_ROOT, variant.id);
    mkdirSync(outDir, { recursive: true });
    console.log(`\n[${variant.id}] ${variant.label}`);

    for (const room of todoRooms) {
      const out = path.join(outDir, `${room.id}.png`);
      if (!force && existsSync(out)) {
        skipped += 1;
        continue;
      }
      const ref = heroFrame(room.id);
      if (!ref) {
        console.warn(`  ${room.id}: no reference frame, skipping`);
        continue;
      }
      if (dry) {
        console.log(`\n=== ${variant.id}/${room.id} ===\n${buildPrompt(room, variant)}\n`);
        continue;
      }

      process.stdout.write(`  ${room.id.padEnd(18)} `);
      const started = Date.now();
      try {
        const res = await ai.models.generateContent({
          model: MODEL,
          contents: [
            { text: buildPrompt(room, variant) },
            { inlineData: { mimeType: 'image/jpeg', data: readFileSync(ref).toString('base64') } },
          ],
        });
        const parts = res.candidates?.[0]?.content?.parts ?? [];
        const img = parts.find((p) => p.inlineData?.data);
        if (!img) throw new Error('no image in response');
        const buf = Buffer.from(img.inlineData.data, 'base64');
        writeFileSync(out, buf);
        console.log(`ok  ${Math.round(buf.length / 1024)}KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
        ok += 1;
      } catch (err) {
        console.log(`FAILED  ${err.message}`);
        failed += 1;
      }
    }
  }

  if (!dry) {
    console.log(`\n${ok} generated, ${skipped} already present, ${failed} failed.`);
    console.log(`Manifest lists ${writeManifest()} renders.`);
  }
}

main();
