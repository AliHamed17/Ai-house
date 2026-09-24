'use client';

import { create } from 'zustand';
import type { RoomId, TransformationStageId } from '@/lib/types';
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

  /**
   * Whether the saved-pieces panel is showing. Only the panel's visibility
   * lives here — the saved pieces themselves are their own store
   * (src/lib/store/shortlistStore.ts) because they outlive the explorer.
   */
  shortlistOpen: boolean;
  setShortlistOpen: (open: boolean) => void;

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

  /**
   * Which stage of the kitchen transformation the 3D room is showing.
   * null = show the finished house (every room fully furnished), which is
   * the normal explorer state. Setting a stage id makes the kitchen show
   * exactly the objects the transformation video shows at that stage, so a
   * visitor can step out of the film and into the same moment in 3D.
   */
  transformationStage: TransformationStageId | null;
  setTransformationStage: (stage: TransformationStageId | null) => void;
}

export const useViewerStore = create<ViewerState>((set) => ({
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

  shortlistOpen: false,
  setShortlistOpen: (open) => set({ shortlistOpen: open }),

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

  transformationStage: null,
  setTransformationStage: (stage) => set({ transformationStage: stage }),
}));
