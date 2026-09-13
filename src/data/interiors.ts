import type { RoomId } from '@/lib/types';

export interface InteriorRender {
  path: string;
  title: string;
}

export const interiorVariantIds = ['warm-oak', 'cool-stone', 'sand-linen', 'walnut-brass', 'lime-terracotta', 'japandi-ink'] as const;

export type InteriorVariantId = (typeof interiorVariantIds)[number];

export const interiorVariantLabels: Record<InteriorVariantId, string> = {
  'warm-oak': "Warm Oak & Limestone",
  'cool-stone': "Cool Stone & Champagne",
  'sand-linen': "Sand & Linen",
  'walnut-brass': "Dark Walnut & Brass",
  'lime-terracotta': "Levantine Lime & Terracotta",
  'japandi-ink': "Japandi Oak & Ink",
};

export const interiorRendersByVariant: Record<InteriorVariantId, Partial<Record<RoomId, InteriorRender>>> = {
  'warm-oak': {
    living: { path: '/generated/interiors/warm-oak/living.png', title: "Living Room" },
    kitchen: { path: '/generated/interiors/warm-oak/kitchen.png', title: "Kitchen" },
    dining: { path: '/generated/interiors/warm-oak/dining.png', title: "Dining Bay" },
    entry_hall: { path: '/generated/interiors/warm-oak/entry_hall.png', title: "Entry Hall" },
    bedroom_parents: { path: '/generated/interiors/warm-oak/bedroom_parents.png', title: "Parents' Bedroom" },
    bedroom_twin: { path: '/generated/interiors/warm-oak/bedroom_twin.png', title: "Twin / Children's Bedroom" },
    bath_family: { path: '/generated/interiors/warm-oak/bath_family.png', title: "Family Shower Room" },
    wc: { path: '/generated/interiors/warm-oak/wc.png', title: "Guest WC" },
    corridor: { path: '/generated/interiors/warm-oak/corridor.png', title: "Bedroom Corridor" },
    mamad: { path: '/generated/interiors/warm-oak/mamad.png', title: "MAMAD (Protected Room)" },
    terrace_nw: { path: '/generated/interiors/warm-oak/terrace_nw.png', title: "North-West Terrace" },
    stair_landing: { path: '/generated/interiors/warm-oak/stair_landing.png', title: "Entry Stair & Landing" },
  },
  'cool-stone': {
    living: { path: '/generated/interiors/cool-stone/living.png', title: "Living Room" },
    kitchen: { path: '/generated/interiors/cool-stone/kitchen.png', title: "Kitchen" },
    dining: { path: '/generated/interiors/cool-stone/dining.png', title: "Dining Bay" },
    entry_hall: { path: '/generated/interiors/cool-stone/entry_hall.png', title: "Entry Hall" },
    bedroom_parents: { path: '/generated/interiors/cool-stone/bedroom_parents.png', title: "Parents' Bedroom" },
    bedroom_twin: { path: '/generated/interiors/cool-stone/bedroom_twin.png', title: "Twin / Children's Bedroom" },
    bath_family: { path: '/generated/interiors/cool-stone/bath_family.png', title: "Family Shower Room" },
    wc: { path: '/generated/interiors/cool-stone/wc.png', title: "Guest WC" },
    corridor: { path: '/generated/interiors/cool-stone/corridor.png', title: "Bedroom Corridor" },
    mamad: { path: '/generated/interiors/cool-stone/mamad.png', title: "MAMAD (Protected Room)" },
    terrace_nw: { path: '/generated/interiors/cool-stone/terrace_nw.png', title: "North-West Terrace" },
    stair_landing: { path: '/generated/interiors/cool-stone/stair_landing.png', title: "Entry Stair & Landing" },
  },
  'sand-linen': {
    living: { path: '/generated/interiors/sand-linen/living.png', title: "Living Room" },
    kitchen: { path: '/generated/interiors/sand-linen/kitchen.png', title: "Kitchen" },
    dining: { path: '/generated/interiors/sand-linen/dining.png', title: "Dining Bay" },
    entry_hall: { path: '/generated/interiors/sand-linen/entry_hall.png', title: "Entry Hall" },
    bedroom_parents: { path: '/generated/interiors/sand-linen/bedroom_parents.png', title: "Parents' Bedroom" },
    bedroom_twin: { path: '/generated/interiors/sand-linen/bedroom_twin.png', title: "Twin / Children's Bedroom" },
    bath_family: { path: '/generated/interiors/sand-linen/bath_family.png', title: "Family Shower Room" },
    wc: { path: '/generated/interiors/sand-linen/wc.png', title: "Guest WC" },
    corridor: { path: '/generated/interiors/sand-linen/corridor.png', title: "Bedroom Corridor" },
    mamad: { path: '/generated/interiors/sand-linen/mamad.png', title: "MAMAD (Protected Room)" },
    terrace_nw: { path: '/generated/interiors/sand-linen/terrace_nw.png', title: "North-West Terrace" },
    stair_landing: { path: '/generated/interiors/sand-linen/stair_landing.png', title: "Entry Stair & Landing" },
  },
  'walnut-brass': {
    living: { path: '/generated/interiors/walnut-brass/living.png', title: "Living Room" },
    kitchen: { path: '/generated/interiors/walnut-brass/kitchen.png', title: "Kitchen" },
    dining: { path: '/generated/interiors/walnut-brass/dining.png', title: "Dining Bay" },
    entry_hall: { path: '/generated/interiors/walnut-brass/entry_hall.png', title: "Entry Hall" },
    bedroom_parents: { path: '/generated/interiors/walnut-brass/bedroom_parents.png', title: "Parents' Bedroom" },
    bedroom_twin: { path: '/generated/interiors/walnut-brass/bedroom_twin.png', title: "Twin / Children's Bedroom" },
    bath_family: { path: '/generated/interiors/walnut-brass/bath_family.png', title: "Family Shower Room" },
    wc: { path: '/generated/interiors/walnut-brass/wc.png', title: "Guest WC" },
    corridor: { path: '/generated/interiors/walnut-brass/corridor.png', title: "Bedroom Corridor" },
    mamad: { path: '/generated/interiors/walnut-brass/mamad.png', title: "MAMAD (Protected Room)" },
    terrace_nw: { path: '/generated/interiors/walnut-brass/terrace_nw.png', title: "North-West Terrace" },
    stair_landing: { path: '/generated/interiors/walnut-brass/stair_landing.png', title: "Entry Stair & Landing" },
  },
  'lime-terracotta': {
    living: { path: '/generated/interiors/lime-terracotta/living.png', title: "Living Room" },
    kitchen: { path: '/generated/interiors/lime-terracotta/kitchen.png', title: "Kitchen" },
    dining: { path: '/generated/interiors/lime-terracotta/dining.png', title: "Dining Bay" },
    entry_hall: { path: '/generated/interiors/lime-terracotta/entry_hall.png', title: "Entry Hall" },
    bedroom_parents: { path: '/generated/interiors/lime-terracotta/bedroom_parents.png', title: "Parents' Bedroom" },
    bedroom_twin: { path: '/generated/interiors/lime-terracotta/bedroom_twin.png', title: "Twin / Children's Bedroom" },
    bath_family: { path: '/generated/interiors/lime-terracotta/bath_family.png', title: "Family Shower Room" },
    wc: { path: '/generated/interiors/lime-terracotta/wc.png', title: "Guest WC" },
    corridor: { path: '/generated/interiors/lime-terracotta/corridor.png', title: "Bedroom Corridor" },
    mamad: { path: '/generated/interiors/lime-terracotta/mamad.png', title: "MAMAD (Protected Room)" },
    terrace_nw: { path: '/generated/interiors/lime-terracotta/terrace_nw.png', title: "North-West Terrace" },
    stair_landing: { path: '/generated/interiors/lime-terracotta/stair_landing.png', title: "Entry Stair & Landing" },
  },
  'japandi-ink': {
    living: { path: '/generated/interiors/japandi-ink/living.png', title: "Living Room" },
    kitchen: { path: '/generated/interiors/japandi-ink/kitchen.png', title: "Kitchen" },
    dining: { path: '/generated/interiors/japandi-ink/dining.png', title: "Dining Bay" },
    entry_hall: { path: '/generated/interiors/japandi-ink/entry_hall.png', title: "Entry Hall" },
    bedroom_parents: { path: '/generated/interiors/japandi-ink/bedroom_parents.png', title: "Parents' Bedroom" },
    bedroom_twin: { path: '/generated/interiors/japandi-ink/bedroom_twin.png', title: "Twin / Children's Bedroom" },
    bath_family: { path: '/generated/interiors/japandi-ink/bath_family.png', title: "Family Shower Room" },
    wc: { path: '/generated/interiors/japandi-ink/wc.png', title: "Guest WC" },
    corridor: { path: '/generated/interiors/japandi-ink/corridor.png', title: "Bedroom Corridor" },
    mamad: { path: '/generated/interiors/japandi-ink/mamad.png', title: "MAMAD (Protected Room)" },
    terrace_nw: { path: '/generated/interiors/japandi-ink/terrace_nw.png', title: "North-West Terrace" },
    stair_landing: { path: '/generated/interiors/japandi-ink/stair_landing.png', title: "Entry Stair & Landing" },
  },
};

export const interiorRenders = interiorRendersByVariant['warm-oak'];
