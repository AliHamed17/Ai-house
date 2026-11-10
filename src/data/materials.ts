/**
 * Warm-modern-luxury material palette and swappable finish variants.
 *
 * Material variants only ever change floor/wall/accent colors — they never
 * touch geometry, doors, or windows. This keeps MAMAD's protected door and
 * window (and every other opening) identical across every variant, by
 * construction rather than by a runtime check.
 */

export const PALETTE = {
  ivory: '#F3EFE7',
  limestone: '#D8CFC2',
  oak: '#9A7656',
  taupe: '#8B7C6C',
  bronze: '#4B4037',
  charcoal: '#24221F',
  olive: '#73745F',
} as const;

export interface MaterialDef {
  id: string;
  label: string;
  colorHex: string;
  roughness: number;
  metalness: number;
}

export const baseMaterials: Record<string, MaterialDef> = {
  'limestone-social': { id: 'limestone-social', label: 'Warm Limestone Porcelain', colorHex: PALETTE.limestone, roughness: 0.55, metalness: 0.02 },
  'oak-bedroom': { id: 'oak-bedroom', label: 'Matte Natural Oak', colorHex: PALETTE.oak, roughness: 0.6, metalness: 0.0 },
  'stone-wet': { id: 'stone-wet', label: 'Stone-look Wet-room Porcelain', colorHex: '#C9C1B4', roughness: 0.4, metalness: 0.02 },
  'stone-entry': { id: 'stone-entry', label: 'Pale Entry Stone', colorHex: '#DDD5C8', roughness: 0.5, metalness: 0.02 },
  'exterior-stone': { id: 'exterior-stone', label: 'Exterior-grade Stone', colorHex: '#C7BFAF', roughness: 0.75, metalness: 0.0 },
  'wall-warm-plaster': { id: 'wall-warm-plaster', label: 'Warm Mineral Plaster', colorHex: PALETTE.ivory, roughness: 0.85, metalness: 0.0 },
  'exterior-render': { id: 'exterior-render', label: 'Exterior Render', colorHex: '#C2B9AB', roughness: 0.9, metalness: 0.0 },
};

export interface MaterialVariant {
  id: string;
  label: string;
  description: string;
  /** Overrides keyed by the base material id (see baseMaterials). */
  floorOverrides: Record<string, string>;
  wallOverrides: Record<string, string>;
  accentHex: string;
  metalHex: string;
}

export const materialVariants: MaterialVariant[] = [
  {
    id: 'warm-oak',
    label: 'Warm Oak & Limestone',
    description: 'The house-wide default: pale limestone social floors, matte oak bedrooms, dark-bronze metal accents.',
    floorOverrides: {},
    wallOverrides: {},
    accentHex: PALETTE.olive,
    metalHex: PALETTE.bronze,
  },
  {
    id: 'cool-stone',
    label: 'Cool Stone & Champagne',
    description: 'A cooler quartzite-grey social floor with a champagne metal accent, oak tone unchanged.',
    floorOverrides: { 'limestone-social': '#CBCDC8', 'stone-entry': '#D2D3CC' },
    wallOverrides: { 'wall-warm-plaster': '#EFEFEA' },
    accentHex: '#8A8F86',
    metalHex: '#B7A27C',
  },
  {
    id: 'sand-linen',
    label: 'Sand & Linen',
    description: 'A softer sand-toned social floor with deeper taupe walls for a cocooning, textile-led mood.',
    floorOverrides: { 'limestone-social': '#E3D6C3' },
    wallOverrides: { 'wall-warm-plaster': '#EAE0D2' },
    accentHex: PALETTE.taupe,
    metalHex: PALETTE.bronze,
  },
];

export interface LightingPreset {
  id: 'day' | 'evening';
  label: string;
  skyColorHex: string;
  ambientIntensity: number;
  sunColorHex: string;
  sunIntensity: number;
  sunPositionM: [number, number, number];
  interiorColorTempK: number;
  interiorIntensity: number;
  fogColorHex: string;
  fogNearM: number;
  fogFarM: number;
}

export const lightingPresets: Record<'day' | 'evening', LightingPreset> = {
  day: {
    id: 'day',
    label: 'Daylight',
    skyColorHex: '#CFE3F0',
    ambientIntensity: 0.55,
    sunColorHex: '#FFF6E5',
    sunIntensity: 2.4,
    sunPositionM: [12, 14, -6],
    interiorColorTempK: 3000,
    interiorIntensity: 0.35,
    fogColorHex: '#E9E4D8',
    fogNearM: 18,
    fogFarM: 46,
  },
  evening: {
    id: 'evening',
    label: 'Evening',
    skyColorHex: '#1B1F2B',
    ambientIntensity: 0.12,
    sunColorHex: '#5B6A93',
    sunIntensity: 0.25,
    sunPositionM: [-10, 6, 8],
    interiorColorTempK: 2700,
    interiorIntensity: 1.05,
    fogColorHex: '#14141A',
    fogNearM: 10,
    fogFarM: 34,
  },
};

export function resolveFloorColor(materialId: string, variantId: string): string {
  const variant = materialVariants.find((v) => v.id === variantId) ?? materialVariants[0];
  return variant.floorOverrides[materialId] ?? baseMaterials[materialId]?.colorHex ?? PALETTE.limestone;
}

export function resolveWallColor(materialId: string, variantId: string): string {
  const variant = materialVariants.find((v) => v.id === variantId) ?? materialVariants[0];
  return variant.wallOverrides[materialId] ?? baseMaterials[materialId]?.colorHex ?? PALETTE.ivory;
}
