import { materialVariants } from '@/data/materials';
import type { FurnitureMaterialId } from './types';

export interface FurnitureSurface {
  color: string;
  roughness: number;
  metalness: number;
}

const BASE: Record<FurnitureMaterialId, FurnitureSurface> = {
  wood: { color: '#B08A5F', roughness: 0.62, metalness: 0.02 },
  woodDark: { color: '#6E4F36', roughness: 0.58, metalness: 0.03 },
  fabric: { color: '#CFC3B0', roughness: 0.92, metalness: 0 },
  fabricDark: { color: '#8C8375', roughness: 0.92, metalness: 0 },
  leather: { color: '#A2673E', roughness: 0.55, metalness: 0.05 },
  stoneTop: { color: '#DAD3C6', roughness: 0.4, metalness: 0.03 },
  metal: { color: '#4B4C4E', roughness: 0.35, metalness: 0.75 },
  metalWarm: { color: '#9C7C4E', roughness: 0.32, metalness: 0.8 },
  glass: { color: '#C8DCE4', roughness: 0.06, metalness: 0 },
  screen: { color: '#14161A', roughness: 0.22, metalness: 0.2 },
  plant: { color: '#5B7350', roughness: 0.85, metalness: 0 },
  ceramic: { color: '#D9D2C6', roughness: 0.35, metalness: 0.02 },
  appliance: { color: '#8E9296', roughness: 0.3, metalness: 0.6 },
  rug: { color: '#BCAF9B', roughness: 0.98, metalness: 0 },
  wetStone: { color: '#CBC3B6', roughness: 0.32, metalness: 0.03 },
  lampShade: { color: '#F0E7D6', roughness: 0.9, metalness: 0 },
};

function mix(hex: string, towards: string, amount: number): string {
  const parse = (h: string) => [1, 3, 5].map((i) => parseInt(h.slice(i, i + 2), 16));
  const [r1, g1, b1] = parse(hex);
  const [r2, g2, b2] = parse(towards);
  const c = (a: number, b: number) => Math.round(a + (b - a) * amount).toString(16).padStart(2, '0');
  return `#${c(r1, r2)}${c(g1, g2)}${c(b1, b2)}`;
}

export function furnitureSurface(id: FurnitureMaterialId, variantId: string): FurnitureSurface {
  const base = BASE[id] ?? BASE.wood;
  const variant = materialVariants.find((v) => v.id === variantId);
  if (!variant) return base;
  if (id === 'metal' || id === 'metalWarm') {
    return { ...base, color: mix(base.color, variant.metalHex, 0.6) };
  }
  if (id === 'wood' || id === 'woodDark' || id === 'fabric' || id === 'fabricDark' || id === 'rug') {
    return { ...base, color: mix(base.color, variant.accentHex, 0.18) };
  }
  return base;
}

export const furnitureMaterialIds = Object.keys(BASE) as FurnitureMaterialId[];
