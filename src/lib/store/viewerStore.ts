'use client';

import { create } from 'zustand';
import type { RoomId } from '@/lib/types';
import { ENTRY_ROOM_ID } from '@/data/house';

export type ViewMode = 'first-person' | 'orbit' | 'floorplan';
export type LightingMode = 'day' | 'evening';
export type RenderMode = 'unknown' | 'webgl' | 'fallback2d';

export interface PlayerPose {
  x: number;
  z: number;
  yaw: number;
}

interface ViewerState {
  isExplorerOpen: boolean;
  setExplorerOpen: (open: boolean) => void;

  mode: ViewMode;
  setMode: (mode: ViewMode) => void;

  activeRoomId: RoomId;
  setActiveRoomId: (id: RoomId) => void;

  playerPose: PlayerPose;
  setPlayerPose: (pose: PlayerPose) => void;

  lightingMode: LightingMode;
  setLightingMode: (mode: LightingMode) => void;

  materialVariantId: string;
  setMaterialVariantId: (id: string) => void;

  minimapOpen: boolean;
  setMinimapOpen: (open: boolean) => void;

  helpOpen: boolean;
  setHelpOpen: (open: boolean) => void;

  teleportTarget: RoomId | null;
  teleportToken: number;
  requestTeleport: (roomId: RoomId) => void;
  consumeTeleport: () => void;

  // Bumped to ask the orbit/dollhouse camera to return to its elevated
  // overview pose — kept separate from teleportToken so a Reset in dollhouse
  // mode does not also trigger the always-mounted first-person teleport.
  orbitResetToken: number;
  requestOrbitReset: () => void;

  reducedMotion: boolean;
  setReducedMotion: (v: boolean) => void;

  renderMode: RenderMode;
  setRenderMode: (mode: RenderMode) => void;

  isPointerLocked: boolean;
  setPointerLocked: (v: boolean) => void;

  mobileMove: { x: number; z: number };
  setMobileMove: (v: { x: number; z: number }) => void;

  mobileLookDelta: { dx: number; dy: number };
  addMobileLook: (dx: number, dy: number) => void;
  consumeMobileLook: () => { dx: number; dy: number };
}

export const useViewerStore = create<ViewerState>((set, get) => ({
  isExplorerOpen: false,
  setExplorerOpen: (open) => set({ isExplorerOpen: open }),

  mode: 'first-person',
  setMode: (mode) => set({ mode }),

  activeRoomId: ENTRY_ROOM_ID,
  setActiveRoomId: (id) => set({ activeRoomId: id }),

  playerPose: { x: 5.93, z: -3.9, yaw: 0 },
  setPlayerPose: (pose) => set({ playerPose: pose }),

  lightingMode: 'day',
  setLightingMode: (mode) => set({ lightingMode: mode }),

  materialVariantId: 'warm-oak',
  setMaterialVariantId: (id) => set({ materialVariantId: id }),

  minimapOpen: true,
  setMinimapOpen: (open) => set({ minimapOpen: open }),

  helpOpen: false,
  setHelpOpen: (open) => set({ helpOpen: open }),

  teleportTarget: null,
  teleportToken: 0,
  requestTeleport: (roomId) => set((s) => ({ teleportTarget: roomId, teleportToken: s.teleportToken + 1 })),
  consumeTeleport: () => set({ teleportTarget: null }),

  orbitResetToken: 0,
  requestOrbitReset: () => set((s) => ({ orbitResetToken: s.orbitResetToken + 1 })),

  reducedMotion: false,
  setReducedMotion: (v) => set({ reducedMotion: v }),

  renderMode: 'unknown',
  setRenderMode: (mode) => set({ renderMode: mode }),

  isPointerLocked: false,
  setPointerLocked: (v) => set({ isPointerLocked: v }),

  mobileMove: { x: 0, z: 0 },
  setMobileMove: (v) => set({ mobileMove: v }),

  mobileLookDelta: { dx: 0, dy: 0 },
  addMobileLook: (dx, dy) =>
    set((s) => ({ mobileLookDelta: { dx: s.mobileLookDelta.dx + dx, dy: s.mobileLookDelta.dy + dy } })),
  consumeMobileLook: () => {
    const delta = get().mobileLookDelta;
    set({ mobileLookDelta: { dx: 0, dy: 0 } });
    return delta;
  },
}));
