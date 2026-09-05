#!/usr/bin/env node
/**
 * Photoreal interiors via Nano Banana, anchored on each room's real frame.
 */
import { readFileSync, writeFileSync, mkdirSync, existsSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { GoogleGenAI } from '@google/genai';

const USAGE = 'Usage: node scripts/generate-interiors.mjs [roomId...] [--dry]';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO = path.resolve(__dirname, '..');
const FRAMES = path.join(REPO, 'public', 'evidence', 'frames');
const OUT_DIR = path.join(REPO, 'public', 'generated', 'interiors');
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

const HOUSE_STYLE = [
  'Warm modern luxury, in the language of high-end architectural visualization:',
  'warm ivory plaster, natural rift-cut oak, pale honed limestone and travertine,',
  'taupe and oatmeal textiles, dark-bronze metal details, deep matte finishes.',
  'Layered 2700-3000K lighting: concealed cove light, discreet downlights, one sculptural fixture.',
  'Late-afternoon daylight raking in through the real windows, soft contact shadows, gentle bloom.',
].join(' ');

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
      'A low curved sand-beige modular sofa facing the glazed west wall, two sculptural lounge chairs in cognac leather, '
      + 'a deep-pile oatmeal wool rug, nested travertine and oak coffee tables, and one calm textured-plaster media wall '
      + 'with concealed oak storage. Full-height linen curtains stacked clear of the glazing. Keep the round concrete '
      + 'columns exposed and rendered smooth as a design feature.',
  },
  {
    id: 'kitchen',
    title: 'Kitchen',
    brief:
      'Full-height rift oak and matte-taupe cabinetry along the solid wall, fully integrated appliances, a pale quartzite '
      + 'worktop with a matching slab backsplash and a mitred edge, an undermount sink at the window, '
      + 'discreet under-cabinet task lighting, and a single long oak-topped island with a waterfall end. '
      + 'Open and continuous with the living and dining space — no dividing wall.',
  },
  {
    id: 'dining',
    title: 'Dining Bay',
    brief:
      'A six-seat oval table with a honed travertine top on a sculptural oak base, low-backed chairs in oatmeal boucle, '
      + 'and one large sculptural linen-and-bronze pendant centred over the table. Reads as one continuous open volume '
      + 'with the kitchen and living room.',
  },
  {
    id: 'entry_hall',
    title: 'Entry Hall',
    brief:
      'A shallow floating oak console with a bronze-framed full-height mirror above it, a limestone-look large-format '
      + 'floor, concealed shoe storage behind flush oak panelling, one ceramic bowl and a single stem of dried grass. '
      + 'Deliberately restrained — this is the first breath of the house, not a room to fill.',
  },
  {
    id: 'bedroom_parents',
    title: "Parents' Bedroom",
    brief:
      'A broad upholstered oatmeal-linen headboard wall spanning behind the bed, oak bedside tables with bronze reading '
      + 'lights, a low oak bench at the foot, integrated flush wardrobes, and layered sheer plus blackout linen curtains '
      + 'on the corner windows. Calm, hotel-grade, uncluttered.',
  },
  {
    id: 'bedroom_twin',
    title: "Twin / Children's Bedroom",
    brief:
      'Two equivalent single beds in pale oak with soft rounded edges, matching oatmeal quilts, a long shared oak study '
      + 'surface under the window, balanced closed storage, a soft wool rug, and warm indirect cove lighting. '
      + 'Central floor left open. Grown-up materials, gentle scale — not a themed kids room.',
  },
  {
    id: 'bath_family',
    title: 'Family Shower Room',
    brief:
      'Continuous warm stone-look large-format porcelain on floor and walls, a floating oak vanity with an integrated '
      + 'stone basin, a backlit bronze-framed mirror, a generous walk-in shower behind frameless low-iron glass, '
      + 'a recessed shelf niche, and brushed-bronze brassware. Spa-calm, no clutter.',
  },
  {
    id: 'wc',
    title: 'Guest WC',
    brief:
      'A compact jewel-box cloakroom: one sculptural stone basin on a slim oak shelf, a richer dramatic stone-veined '
      + 'wall behind it, matte deep-taupe walls elsewhere, a small bronze-framed mirror, and one warm wall light. '
      + 'A small room treated as a moment, not an afterthought.',
  },
  {
    id: 'corridor',
    title: 'Bedroom Corridor',
    brief:
      'Warm ivory plaster walls, a continuous limestone-look floor running through, flush oak doors with bronze lever '
      + 'handles, a slim runner in oatmeal wool, and a concealed cove light washing one wall. '
      + 'Keep the circulation completely clear — the corridor is narrow and must read generous.',
  },
  {
    id: 'mamad',
    title: 'MAMAD (Protected Room)',
    brief:
      'Used as a calm guest room: a low oak bed with oatmeal linen, a compact oak desk, and closed flush storage. '
      + 'CRITICAL REGULATORY CONSTRAINT: this is an Israeli protected room. The steel blast door, the steel-framed '
      + 'blast window and the round filtration penetration must remain exactly as shown, fully visible, completely '
      + 'unobstructed, and must NOT be restyled, concealed, curtained, panelled over or replaced. '
      + 'Furnish only the space that is left.',
  },
  {
    id: 'terrace_nw',
    title: 'North-West Terrace',
    brief:
      'Weather-resistant teak lounge seating with oatmeal outdoor cushions, a low travertine side table, '
      + 'large planters with olive and rosemary, a woven outdoor rug, and warm concealed lighting in the parapet. '
      + 'The rendered concrete corner pier stays exposed. Late golden-hour light.',
  },
  {
    id: 'stair_landing',
    title: 'Entry Stair & Landing',
    brief:
      'Honed pale travertine treads with slim shadow-gap risers, a minimal dark-bronze handrail, integrated warm '
      + 'step lighting, smooth warm-ivory rendered flank walls, and a single sculptural planter at the landing. '
      + 'A generous, quiet arrival sequence at golden hour.',
  },
];

function heroFrame(roomId) {
  const dir = path.join(FRAMES, roomId);
  if (!existsSync(dir)) return null;
  const files = readdirSync(dir).filter((f) => f.endsWith('.jpg')).sort();
  return files.length ? path.join(dir, files[0]) : null;
}

function buildPrompt(room) {
  return [
    `Transform this unfinished construction photograph of a ${room.title} into a finished, photorealistic interior.`,
    'The supplied image is a HARD architectural reference. Keep the exact camera position and lens perspective,',
    'the exact wall positions and proportions, the exact ceiling height, and every window and door opening',
    'at its exact size and position. Keep the real view through the windows.',
    'Do not add, remove, resize or move any opening. Do not change the room shape.',
    `Design brief: ${room.brief}`,
    HOUSE_STYLE,
    CAMERA,
    'The result must look like a photograph of a real, buildable, finished room — not a 3D render.',
    NEGATIVE,
  ].join(' ');
}

function writeManifest() {
  const existing = readdirSync(OUT_DIR).filter((f) => f.endsWith('.png')).map((f) => f.replace('.png', ''));
  const all = ROOMS.filter((r) => existing.includes(r.id));
  const lines = [
    "import type { RoomId } from '@/lib/types';",
    '',
    'export interface InteriorRender {',
    '  path: string;',
    '  title: string;',
    '}',
    '',
    'export const interiorRenders: Partial<Record<RoomId, InteriorRender>> = {',
    ...all.map((r) => `  ${r.id}: { path: '/generated/interiors/${r.id}.png', title: ${JSON.stringify(r.title)} },`),
    '};',
    '',
  ];
  writeFileSync(MANIFEST, lines.join('\n'), 'utf8');
  return all.length;
}

async function main() {
  const args = process.argv.slice(2);
  if (args.includes('--help')) {
    console.log(`${USAGE}\nRooms: ${ROOMS.map((r) => r.id).join(', ')}`);
    return;
  }
  const dry = args.includes('--dry');
  const wanted = args.filter((a) => !a.startsWith('--'));
  const todo = wanted.length ? ROOMS.filter((r) => wanted.includes(r.id)) : ROOMS;

  if (!todo.length) {
    console.error(`No matching rooms.\n${USAGE}\nRooms: ${ROOMS.map((r) => r.id).join(', ')}`);
    process.exit(1);
  }

  mkdirSync(OUT_DIR, { recursive: true });
  const ai = dry ? null : new GoogleGenAI({ apiKey: loadKey() });
  let ok = 0;
  let failed = 0;

  for (const room of todo) {
    const ref = heroFrame(room.id);
    if (!ref) {
      console.warn(`  ${room.id}: no reference frame, skipping`);
      continue;
    }
    const prompt = buildPrompt(room);
    if (dry) {
      console.log(`\n=== ${room.id} (ref ${path.basename(ref)}) ===\n${prompt}\n`);
      continue;
    }

    process.stdout.write(`  ${room.id.padEnd(18)} `);
    const started = Date.now();
    try {
      const res = await ai.models.generateContent({
        model: MODEL,
        contents: [
          { text: prompt },
          { inlineData: { mimeType: 'image/jpeg', data: readFileSync(ref).toString('base64') } },
        ],
      });
      const parts = res.candidates?.[0]?.content?.parts ?? [];
      const img = parts.find((p) => p.inlineData?.data);
      if (!img) throw new Error('no image in response');
      const buf = Buffer.from(img.inlineData.data, 'base64');
      writeFileSync(path.join(OUT_DIR, `${room.id}.png`), buf);
      console.log(`ok  ${Math.round(buf.length / 1024)}KB  ${((Date.now() - started) / 1000).toFixed(1)}s`);
      ok += 1;
    } catch (err) {
      console.log(`FAILED  ${err.message}`);
      failed += 1;
    }
  }

  if (!dry && ok) {
    console.log(`\n${ok} generated, ${failed} failed. Manifest lists ${writeManifest()} rooms.`);
  }
}

main();
