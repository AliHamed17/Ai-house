/**
 * Prompt templates for Nano Banana (Gemini image generation) and Higgsfield
 * (image-to-video). Each room keeps a short, specific furniture/material
 * brief; the shared template functions below assemble the full instruction
 * text so the architectural-preservation language lives in one place.
 */

import type { RoomId } from '@/lib/types';
import { materialVariants } from './materials';

interface RoomPromptSpec {
  roomId: RoomId;
  /** One sentence describing the room-specific furniture plan (from the interior design brief). */
  furniturePlan: string;
}

const roomPromptSpecs: RoomPromptSpec[] = [
  { roomId: 'stair_landing', furniturePlan: 'slip-resistant pale stone stair treads, a slim dark-bronze handrail, and integrated warm step lighting' },
  { roomId: 'terrace_nw', furniturePlan: 'compact weather-resistant seating and restrained planters, or ventilated utility cabinetry if used for service' },
  { roomId: 'entry_hall', furniturePlan: 'a shallow natural-oak console, a full-height mirror, and concealed shoe storage without blocking circulation' },
  { roomId: 'living', furniturePlan: 'a low curved warm-beige modular sofa, two sculptural lounge chairs, a textured wool rug, nested stone/oak coffee tables, and one calm textured-plaster media wall with concealed storage' },
  { roomId: 'kitchen', furniturePlan: 'full-height oak and taupe cabinetry on the solid wall, integrated appliances, a light quartzite-look worktop and backsplash, and discreet under-cabinet task lighting, preserving the drawn L-shaped counter layout' },
  { roomId: 'dining', furniturePlan: 'a 6-seat oak or stone-top oval table, upholstered dining chairs, and one centered sculptural warm pendant light' },
  { roomId: 'terrace_south', furniturePlan: 'compact weather-resistant outdoor seating, restrained planters, and one warm wall light under the covered recess' },
  { roomId: 'mamad', furniturePlan: 'a sofa bed or bed, a compact desk, and closed storage that leaves the protected door, window, and required clearances completely unobstructed' },
  { roomId: 'bedroom_twin', furniturePlan: 'two equivalent single beds, balanced closed storage, and a long shared study surface, keeping the central floor area open' },
  { roomId: 'corridor', furniturePlan: 'a slim runner rug and a single discreet console or linen closet that does not narrow the circulation path' },
  { roomId: 'bath_family', furniturePlan: 'continuous warm stone-look porcelain, a floating oak/taupe vanity, a recessed niche, frameless glass, and face lighting at the mirror' },
  { roomId: 'bath_ensuite', furniturePlan: 'a compact floating vanity, frameless glass shower screen, and warm face lighting at the mirror' },
  { roomId: 'wc', furniturePlan: 'a compact sculptural basin, a richer restrained stone texture, and one warm wall light' },
  { roomId: 'bedroom_parents', furniturePlan: 'a broad upholstered headboard wall, oak bedside tables, integrated wardrobes, and layered linen curtains' },
];

export const roomPromptById = new Map(roomPromptSpecs.map((r) => [r.roomId, r]));

const HOUSE_PALETTE_SENTENCE =
  'Apply the approved house-wide palette of warm ivory, natural oak, pale limestone, taupe textiles, dark bronze details, and 2700-3000K layered lighting.';

const NEGATIVE_CONSTRAINTS =
  'No people, no labels, no watermark-like text, no warped furniture, no impossible reflections, no added or removed doors or windows, no resized or relocated openings.';

export function buildNanoBananaPrompt(roomId: RoomId, styleVariantId: string): string {
  const spec = roomPromptById.get(roomId);
  const variant = materialVariants.find((v) => v.id === styleVariantId) ?? materialVariants[0];
  const furniturePlan = spec?.furniturePlan ?? 'a tasteful warm-modern-luxury furniture plan appropriate to the room';
  return [
    'Using the supplied unfinished-room frame as a hard architectural and camera reference, complete this exact room as a photorealistic warm-modern-luxury interior.',
    'Preserve the camera position, lens perspective, wall geometry, ceiling height impression, every visible door opening, every window opening, structural columns, and the exterior view.',
    'Do not add, remove, resize, or relocate any opening.',
    `Apply this room-specific furniture plan: ${furniturePlan}.`,
    HOUSE_PALETTE_SENTENCE,
    `Material direction for this variation: ${variant.label} — ${variant.description}`,
    'Make the result buildable, uncluttered, and correctly scaled. Keep plumbing fixtures only in their plan-supported wet zone.',
    `Return a clean high-resolution architectural visualization. ${NEGATIVE_CONSTRAINTS}`,
  ].join(' ');
}

export function buildNanoBananaEditPrompt(roomId: RoomId, instruction: string): string {
  const spec = roomPromptById.get(roomId);
  return [
    `Refine this approved ${spec?.roomId ?? roomId} concept with one targeted change: ${instruction}.`,
    'Explicitly preserve all other architecture, composition, camera framing, lighting intent, and previously approved furniture.',
    NEGATIVE_CONSTRAINTS,
  ].join(' ');
}

export function buildHiggsfieldPrompt(roomId: RoomId): string {
  const spec = roomPromptById.get(roomId);
  return [
    'Create a subtle 5-7 second architectural camera move through this finished interior: a slow, stabilized dolly forward with a very slight lateral reveal and natural parallax.',
    `Room context: ${spec?.roomId ?? roomId}.`,
    'Fixed walls, windows, and doors; stable furniture; stable lighting; no object morphing.',
    'Preserve the exact interior design and proportions of the source image.',
    'No people, no rapid movement, no zoom distortion, no new objects, no changing materials, and no text.',
  ].join(' ');
}

export const NANO_BANANA_NEGATIVE_PROMPT = NEGATIVE_CONSTRAINTS;
