/** Furniture layout in metres, same world frame as src/data/house.ts.
 * Positions are guarded by tests/unit/furniture-layout.test.ts. */
import type { FurnitureMaterialId, FurniturePiece } from '@/lib/furniture/types';
import type { RoomId } from '@/lib/types';

type Spec = Omit<FurniturePiece, 'roomId'>;

function room(roomId: RoomId, specs: Spec[]): FurniturePiece[] {
  return specs.map((s) => ({ ...s, roomId, id: `${roomId}_${s.id}` }));
}

function p(
  id: string,
  kind: FurniturePiece['kind'],
  x: number,
  z: number,
  w: number,
  d: number,
  h: number,
  extra: Partial<Spec> = {},
): Spec {
  return { id, kind, position: { x, z }, size: { w, d, h }, ...extra };
}

const E = Math.PI / 2;
const W = -Math.PI / 2;
const N = Math.PI;

const wood: FurnitureMaterialId = 'wood';
const fabric: FurnitureMaterialId = 'fabric';

export const furniture: FurniturePiece[] = [
  ...room('living', [
    p('media_console', 'box', 3.5, 1.36, 2.2, 0.44, 0.45, { materialId: wood }),
    p('media_panel', 'panel', 3.5, 1.18, 2.4, 0.05, 1.9, { elevationM: 0.45, materialId: 'stoneTop', blocking: false }),
    p('tv', 'tv', 3.5, 1.24, 1.45, 0.06, 0.82, { elevationM: 1.05, blocking: false }),
    p('sofa', 'sofa', 3.15, 3.5, 2.5, 0.95, 0.78, { rotationRad: N, materialId: fabric }),
    p('rug', 'rug', 3.15, 2.6, 3.2, 2.3, 0.02, { blocking: false }),
    p('coffee_table', 'table', 3.15, 2.5, 1.15, 0.62, 0.36, { materialId: wood }),
    p('armchair_n', 'armchair', 1.25, 2.25, 0.8, 0.82, 0.75, { rotationRad: E, materialId: 'leather' }),
    p('armchair_s', 'armchair', 1.25, 4.05, 0.8, 0.82, 0.75, { rotationRad: E, materialId: 'leather' }),
    p('side_table', 'table', 1.3, 3.15, 0.44, 0.44, 0.5, { materialId: wood }),
    p('floor_lamp', 'floorLamp', 0.62, 1.75, 0.34, 0.34, 1.6, { blocking: false }),
    p('console_e', 'box', 4.74, 4.5, 1.0, 0.36, 0.78, { rotationRad: W, materialId: wood }),
    p('plant', 'plant', 4.6, 4.95, 0.5, 0.5, 1.25, { blocking: false }),
    p('curtain_nw', 'curtain', 0.16, 2.0, 1.3, 0.12, 2.4, { rotationRad: W, elevationM: 0.15, blocking: false }),
    p('curtain_sw', 'curtain', 0.16, 4.6, 1.3, 0.12, 2.4, { rotationRad: W, elevationM: 0.15, blocking: false }),
    p('art_n', 'panel', 0.55, 1.19, 0.7, 0.05, 0.9, { elevationM: 1.35, blocking: false, detail: true }),
    p('vase', 'vase', 3.15, 2.5, 0.2, 0.2, 0.26, { elevationM: 0.36, blocking: false, detail: true }),
    p('books', 'books', 4.74, 4.5, 0.34, 0.2, 0.22, { elevationM: 0.78, rotationRad: W, blocking: false, detail: true }),
  ]),

  ...room('kitchen', [
    p('run_w', 'counter', 0.81, 7.05, 2.9, 0.62, 0.9, { rotationRad: E }),
    p('wall_cabs_w', 'box', 0.675, 7.05, 2.6, 0.35, 0.7, { rotationRad: E, elevationM: 1.45, materialId: wood }),
    p('splash_w', 'panel', 0.55, 7.05, 2.9, 0.04, 0.55, { rotationRad: E, elevationM: 0.9, blocking: false, materialId: 'stoneTop' }),
    p('sink', 'basin', 0.81, 6.6, 0.6, 0.42, 0.16, { rotationRad: E, elevationM: 0.74, blocking: false }),
    p('dishwasher_front', 'panel', 1.1, 5.95, 0.6, 0.04, 0.78, { rotationRad: E, elevationM: 0.06, blocking: false, materialId: 'appliance' }),
    p('run_s', 'counter', 1.75, 8.41, 1.1, 0.62, 0.9, { rotationRad: N }),
    p('cooktop', 'panel', 1.75, 8.38, 0.62, 0.5, 0.03, { rotationRad: N, elevationM: 0.9, blocking: false, materialId: 'metal' }),
    p('hood', 'box', 1.75, 8.5, 0.72, 0.45, 0.7, { rotationRad: N, elevationM: 1.5, materialId: 'metal', blocking: false }),
    p('splash_s', 'panel', 1.75, 8.69, 1.1, 0.04, 0.55, { rotationRad: N, elevationM: 0.9, blocking: false, materialId: 'stoneTop' }),
    p('oven_tower', 'appliance', 2.65, 8.41, 0.7, 0.62, 2.1, { rotationRad: N }),
    p('fridge', 'appliance', 3.35, 8.41, 0.7, 0.62, 2.0, { rotationRad: N }),
    p('vase', 'vase', 0.81, 7.6, 0.18, 0.18, 0.24, { elevationM: 0.9, blocking: false, detail: true }),
  ]),

  ...room('dining', [
    p('table', 'table', 4.75, 6.75, 1.5, 0.95, 0.75, { materialId: 'stoneTop' }),
    p('chair_n1', 'chair', 4.35, 6.05, 0.45, 0.5, 0.9),
    p('chair_n2', 'chair', 5.15, 6.05, 0.45, 0.5, 0.9),
    p('chair_s1', 'chair', 4.35, 7.45, 0.45, 0.5, 0.9, { rotationRad: N }),
    p('chair_s2', 'chair', 5.15, 7.45, 0.45, 0.5, 0.9, { rotationRad: N }),
    p('chair_w', 'chair', 3.95, 6.75, 0.45, 0.5, 0.9, { rotationRad: E }),
    p('chair_e', 'chair', 5.62, 6.75, 0.45, 0.5, 0.9, { rotationRad: W }),
    p('rug', 'rug', 4.75, 6.75, 2.2, 1.7, 0.02, { blocking: false }),
    p('pendant', 'pendant', 4.75, 6.75, 0.55, 0.55, 0.4, { elevationM: 1.8, blocking: false }),
    p('curtain_s', 'curtain', 4.88, 8.24, 1.9, 0.12, 2.3, { rotationRad: N, elevationM: 0.1, blocking: false }),
    p('plant', 'plant', 3.95, 8.0, 0.45, 0.45, 1.1, { blocking: false, detail: true }),
    p('vase', 'vase', 4.75, 6.75, 0.2, 0.2, 0.28, { elevationM: 0.75, blocking: false, detail: true }),
  ]),

  ...room('entry_hall', [
    p('storage_n', 'box', 5.7, 1.37, 1.4, 0.45, 2.05, { materialId: wood }),
    p('console_e', 'box', 7.32, 2.3, 1.1, 0.36, 0.8, { rotationRad: W, materialId: wood }),
    p('mirror_e', 'mirror', 7.47, 2.3, 0.9, 0.04, 1.1, { rotationRad: W, elevationM: 1.05, blocking: false }),
    p('runner', 'rug', 6.2, 3.6, 1.1, 2.8, 0.02, { blocking: false }),
    p('plant', 'plant', 6.95, 5.7, 0.45, 0.45, 1.15, { blocking: false }),
    p('vase', 'vase', 7.32, 2.3, 0.18, 0.18, 0.3, { elevationM: 0.8, blocking: false, detail: true }),
    p('wall_light', 'wallLight', 7.46, 4.2, 0.14, 0.12, 0.3, { rotationRad: W, elevationM: 1.9, blocking: false, detail: true }),
  ]),

  ...room('corridor', [
    p('linen', 'box', 9.4, 3.68, 1.2, 0.55, 2.15, { materialId: wood }),
    p('runner', 'rug', 8.9, 5.0, 2.2, 0.95, 0.02, { blocking: false }),
    p('console_s', 'box', 8.3, 5.95, 0.9, 0.3, 0.78, { rotationRad: N, materialId: wood }),
    p('art_s', 'panel', 8.3, 6.09, 0.8, 0.05, 0.6, { rotationRad: N, elevationM: 1.3, blocking: false, detail: true }),
    p('wall_light', 'wallLight', 9.9, 6.08, 0.14, 0.12, 0.3, { rotationRad: N, elevationM: 1.9, blocking: false, detail: true }),
    p('plant', 'plant', 10.2, 5.7, 0.4, 0.4, 1.0, { blocking: false, detail: true }),
  ]),

  ...room('mamad', [
    p('bed', 'bed', 10.175, 1.7, 1.5, 2.05, 0.5, { rotationRad: W, materialId: wood }),
    p('bedside', 'box', 10.6, 2.75, 0.42, 0.4, 0.5, { materialId: wood }),
    p('desk', 'table', 8.1, 0.33, 0.85, 0.55, 0.75, { materialId: wood }),
    p('desk_chair', 'chair', 8.45, 1.0, 0.45, 0.5, 0.9, { rotationRad: N }),
    p('wardrobe', 'box', 7.82, 1.75, 1.4, 0.6, 2.1, { rotationRad: E, materialId: wood }),
    p('rug', 'rug', 9.6, 1.9, 1.9, 1.5, 0.02, { blocking: false }),
    p('table_lamp', 'tableLamp', 10.6, 2.75, 0.2, 0.2, 0.38, { elevationM: 0.5, blocking: false, detail: true }),
    p('books', 'books', 8.1, 0.33, 0.3, 0.18, 0.22, { elevationM: 0.75, blocking: false, detail: true }),
  ]),

  ...room('bedroom_twin', [
    p('bed_n', 'bed', 12.2, 0.95, 0.95, 2.0, 0.5, { rotationRad: E, materialId: wood }),
    p('bed_s', 'bed', 12.2, 2.7, 0.95, 2.0, 0.5, { rotationRad: E, materialId: wood }),
    p('bedside', 'box', 11.55, 1.83, 0.42, 0.42, 0.5, { materialId: wood }),
    p('desk_n', 'table', 14.72, 1.1, 1.2, 0.56, 0.75, { rotationRad: W, materialId: wood }),
    p('desk_s', 'table', 14.72, 3.5, 1.2, 0.56, 0.75, { rotationRad: W, materialId: wood }),
    p('chair_n', 'chair', 14.1, 1.1, 0.45, 0.5, 0.9, { rotationRad: E }),
    p('chair_s', 'chair', 14.1, 3.5, 0.45, 0.5, 0.9, { rotationRad: E }),
    p('wardrobe', 'box', 12.9, 4.32, 2.4, 0.55, 2.1, { rotationRad: N, materialId: wood }),
    p('rug', 'rug', 13.6, 2.1, 1.7, 2.2, 0.02, { blocking: false }),
    p('curtain_n', 'curtain', 13.1, 0.2, 1.5, 0.12, 2.3, { elevationM: 0.1, blocking: false }),
    p('curtain_e', 'curtain', 14.85, 2.4, 1.4, 0.12, 2.3, { rotationRad: W, elevationM: 0.1, blocking: false }),
    p('table_lamp', 'tableLamp', 11.55, 1.83, 0.2, 0.2, 0.4, { elevationM: 0.5, blocking: false, detail: true }),
    p('books_n', 'books', 14.72, 0.75, 0.3, 0.18, 0.22, { rotationRad: W, elevationM: 0.75, blocking: false, detail: true }),
    p('books_s', 'books', 14.72, 3.15, 0.3, 0.18, 0.22, { rotationRad: W, elevationM: 0.75, blocking: false, detail: true }),
  ]),

  ...room('bedroom_parents', [
    p('bed', 'bed', 12.8, 5.65, 1.8, 2.1, 0.5, { materialId: wood }),
    p('bedside_w', 'box', 11.55, 4.95, 0.45, 0.42, 0.55, { materialId: wood }),
    p('bedside_e', 'box', 14.05, 4.95, 0.45, 0.42, 0.55, { materialId: wood }),
    p('bench', 'bench', 12.8, 7.05, 1.4, 0.45, 0.45, { materialId: fabric }),
    p('wardrobe', 'box', 13.73, 8.42, 1.15, 0.6, 2.15, { rotationRad: N, materialId: wood }),
    p('rug', 'rug', 12.8, 6.5, 2.6, 2.0, 0.02, { blocking: false }),
    p('curtain_e', 'curtain', 14.17, 6.2, 1.5, 0.12, 2.3, { rotationRad: W, elevationM: 0.1, blocking: false }),
    p('curtain_s', 'curtain', 12.45, 8.57, 1.4, 0.12, 2.3, { rotationRad: N, elevationM: 0.1, blocking: false }),
    p('floor_lamp', 'floorLamp', 13.95, 7.7, 0.34, 0.34, 1.55, { blocking: false }),
    p('art_w', 'panel', 10.62, 6.3, 0.7, 0.05, 0.9, { rotationRad: E, elevationM: 1.35, blocking: false, detail: true }),
    p('lamp_w', 'tableLamp', 11.55, 4.95, 0.2, 0.2, 0.38, { elevationM: 0.55, blocking: false, detail: true }),
    p('lamp_e', 'tableLamp', 14.05, 4.95, 0.2, 0.2, 0.38, { elevationM: 0.55, blocking: false, detail: true }),
    p('plant', 'plant', 11.1, 8.2, 0.45, 0.45, 1.1, { blocking: false, detail: true }),
  ]),

  ...room('bath_family', [
    p('vanity', 'counter', 8.2, 6.42, 1.5, 0.55, 0.85, { materialId: 'wetStone' }),
    p('basin', 'basin', 8.2, 6.42, 0.55, 0.38, 0.14, { elevationM: 0.85, blocking: false }),
    p('mirror', 'mirror', 8.2, 6.17, 1.3, 0.05, 1.0, { elevationM: 1.5, blocking: false }),
    p('light_l', 'wallLight', 7.5, 6.17, 0.12, 0.1, 0.28, { elevationM: 1.75, blocking: false, detail: true }),
    p('light_r', 'wallLight', 8.9, 6.17, 0.12, 0.1, 0.28, { elevationM: 1.75, blocking: false, detail: true }),
    p('shower_tray', 'panel', 7.92, 7.95, 1.5, 1.5, 0.04, { blocking: false, materialId: 'wetStone' }),
    p('shower_glass', 'showerGlass', 8.67, 7.95, 1.5, 0.04, 2.0, { rotationRad: W, blocking: false }),
    p('toilet', 'toilet', 9.7, 8.39, 0.4, 0.65, 0.75, { rotationRad: N }),
    p('niche', 'shelf', 7.25, 7.95, 0.6, 0.12, 0.32, { rotationRad: E, elevationM: 1.15, blocking: false, detail: true }),
    p('towels', 'towels', 10.45, 6.6, 0.34, 0.24, 0.26, { rotationRad: W, elevationM: 0.9, blocking: false, detail: true }),
    p('ceiling_light', 'pendant', 8.9, 7.4, 0.32, 0.32, 0.12, { elevationM: 2.45, blocking: false, detail: true }),
  ]),

  ...room('wc', [
    p('vanity', 'counter', 6.96, 7.75, 0.5, 0.42, 0.85, { rotationRad: W, materialId: 'wetStone' }),
    p('basin', 'basin', 6.96, 7.75, 0.36, 0.28, 0.12, { rotationRad: W, elevationM: 0.85, blocking: false }),
    p('mirror', 'mirror', 7.14, 7.75, 0.4, 0.04, 0.7, { rotationRad: W, elevationM: 1.15, blocking: false }),
    p('toilet', 'toilet', 6.62, 8.395, 0.4, 0.65, 0.75, { rotationRad: N }),
    p('wall_light', 'wallLight', 7.14, 8.2, 0.12, 0.1, 0.28, { rotationRad: W, elevationM: 1.8, blocking: false, detail: true }),
    p('shelf', 'shelf', 6.15, 8.0, 0.5, 0.14, 0.05, { rotationRad: E, elevationM: 1.2, blocking: false, detail: true }),
  ]),

  ...room('terrace_nw', [
    p('lounge_w', 'armchair', 0.55, -0.45, 0.72, 0.75, 0.7, { rotationRad: N, materialId: 'fabricDark' }),
    p('lounge_e', 'armchair', 1.75, -0.45, 0.72, 0.75, 0.7, { rotationRad: N, materialId: 'fabricDark' }),
    p('low_table', 'table', 1.15, -0.45, 0.44, 0.5, 0.35, { materialId: 'stoneTop' }),
    p('planter_w', 'plant', 0.28, 0.85, 0.4, 0.4, 0.75),
    p('planter_e', 'plant', 2.1, 0.2, 0.4, 0.4, 0.75),
    p('rug', 'rug', 1.15, -0.4, 1.7, 1.0, 0.02, { blocking: false }),
    p('wall_light', 'wallLight', 2.24, 0.6, 0.12, 0.1, 0.28, { rotationRad: W, elevationM: 0.95, blocking: false, detail: true }),
  ]),

  ...room('stair_landing', [
    p('handrail', 'handrail', 4.9, -0.7, 4.4, 0.08, 0.06, { elevationM: 0.95, blocking: false, materialId: 'metal' }),
    p('doormat', 'rug', 7.0, 0.8, 0.9, 0.6, 0.02, { blocking: false }),
    p('planter', 'plant', 6.9, 0.1, 0.5, 0.5, 0.8),
    p('wall_light', 'wallLight', 7.44, 0.5, 0.12, 0.1, 0.28, { rotationRad: W, elevationM: 2.0, blocking: false, detail: true }),
  ]),
];

export function furnitureForRoom(roomId: RoomId): FurniturePiece[] {
  return furniture.filter((f) => f.roomId === roomId);
}

export function isBlocking(piece: FurniturePiece): boolean {
  if (piece.blocking !== undefined) return piece.blocking;
  return piece.size.h >= 0.3 && (piece.elevationM ?? 0) < 1.2;
}
