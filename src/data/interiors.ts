import type { RoomId } from '@/lib/types';

export interface InteriorRender {
  path: string;
  title: string;
}

export const interiorRenders: Partial<Record<RoomId, InteriorRender>> = {
  living: { path: '/generated/interiors/living.png', title: "Living Room" },
  kitchen: { path: '/generated/interiors/kitchen.png', title: "Kitchen" },
  dining: { path: '/generated/interiors/dining.png', title: "Dining Bay" },
  entry_hall: { path: '/generated/interiors/entry_hall.png', title: "Entry Hall" },
  bedroom_parents: { path: '/generated/interiors/bedroom_parents.png', title: "Parents' Bedroom" },
  bedroom_twin: { path: '/generated/interiors/bedroom_twin.png', title: "Twin / Children's Bedroom" },
  bath_family: { path: '/generated/interiors/bath_family.png', title: "Family Shower Room" },
  wc: { path: '/generated/interiors/wc.png', title: "Guest WC" },
  corridor: { path: '/generated/interiors/corridor.png', title: "Bedroom Corridor" },
  mamad: { path: '/generated/interiors/mamad.png', title: "MAMAD (Protected Room)" },
  terrace_nw: { path: '/generated/interiors/terrace_nw.png', title: "North-West Terrace" },
  stair_landing: { path: '/generated/interiors/stair_landing.png', title: "Entry Stair & Landing" },
};
