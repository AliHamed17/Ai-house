/**
 * Shareable explorer views.
 *
 * Everything a visitor can see in the explorer that isn't their own camera
 * wobble — which room, which mode, which lighting, which material variant,
 * and (optionally) which transformation moment — round-trips through the
 * page's query string, so any view can be linked, bookmarked, or sent to
 * someone else and reopened exactly as it was.
 *
 * The query string is attacker-controlled, so every value is checked against
 * the real closed set it names (a room in houseModel, a variant in
 * materialVariants, a stage in TRANSFORMATION_STAGE_IDS) before it reaches
 * the store. Nothing here is interpolated into markup or a request URL; the
 * only consumers are setters that already take these exact union types.
 *
 * Tolerance rule, deliberately asymmetric: the link is honoured as long as it
 * names a room that exists, and any other field that is missing OR
 * unrecognised falls back to that field's default. A truncated or mangled
 * `mode=` should still land the recipient in the room the sender was showing
 * them rather than throwing the whole link away; a link that cannot name a
 * real room has nothing left to show, so it is rejected outright and the page
 * loads normally instead of opening the explorer somewhere arbitrary.
 */

import { roomById } from '@/data/house';
import { materialVariants } from '@/data/materials';
import { TRANSFORMATION_STAGE_IDS } from '@/lib/transformation';
import type { RoomId, TransformationStageId } from '@/lib/types';
// Type-only: erased at compile time, so this pure module never pulls the
// zustand store (or its 'use client' boundary) into a consumer's bundle.
import type { LightingMode, ViewMode } from '@/lib/store/viewerStore';

export interface ViewerLinkState {
  roomId: RoomId;
  mode: ViewMode;
  lightingMode: LightingMode;
  materialVariantId: string;
  /** null = the finished house, the ordinary explorer state. */
  transformationStage: TransformationStageId | null;
}

/** Query-string keys, kept short and readable rather than base64-packed. */
export const VIEW_LINK_KEYS = {
  room: 'room',
  mode: 'mode',
  lighting: 'light',
  variant: 'look',
  stage: 'stage',
} as const;

const VIEW_MODES: readonly ViewMode[] = ['first-person', 'orbit', 'floorplan'];
const LIGHTING_MODES: readonly LightingMode[] = ['day', 'evening'];

const DEFAULT_MODE: ViewMode = 'first-person';
const DEFAULT_LIGHTING: LightingMode = 'day';
/** Same default the store starts from, resolved from the real variant list. */
const DEFAULT_VARIANT_ID = materialVariants[0].id;

function readMode(value: string | null): ViewMode {
  return VIEW_MODES.find((m) => m === value) ?? DEFAULT_MODE;
}

function readLighting(value: string | null): LightingMode {
  return LIGHTING_MODES.find((m) => m === value) ?? DEFAULT_LIGHTING;
}

function readVariantId(value: string | null): string {
  return materialVariants.find((v) => v.id === value)?.id ?? DEFAULT_VARIANT_ID;
}

function readStage(value: string | null): TransformationStageId | null {
  return TRANSFORMATION_STAGE_IDS.find((s) => s === value) ?? null;
}

/**
 * The query string for a view, WITHOUT a leading '?'. A null stage is omitted
 * rather than written as "stage=" so an ordinary view produces an ordinary
 * link, and so a reader never has to distinguish "absent" from "empty".
 */
export function encodeViewerLink(state: ViewerLinkState): string {
  const params = new URLSearchParams();
  params.set(VIEW_LINK_KEYS.room, state.roomId);
  params.set(VIEW_LINK_KEYS.mode, state.mode);
  params.set(VIEW_LINK_KEYS.lighting, state.lightingMode);
  params.set(VIEW_LINK_KEYS.variant, state.materialVariantId);
  if (state.transformationStage) params.set(VIEW_LINK_KEYS.stage, state.transformationStage);
  return params.toString();
}

/**
 * Reads a view out of a query string (with or without its leading '?').
 * Returns null when the link names no room we can resolve — the signal to
 * leave the page alone and not open the explorer at all.
 */
export function parseViewerLink(search: string): ViewerLinkState | null {
  let params: URLSearchParams;
  try {
    params = new URLSearchParams(search);
  } catch {
    // URLSearchParams is extremely forgiving, but it is still a parse of
    // untrusted input; a throw here must not take the page down with it.
    return null;
  }
  const roomId = params.get(VIEW_LINK_KEYS.room);
  if (!roomId || !roomById.has(roomId as RoomId)) return null;

  return {
    roomId: roomId as RoomId,
    mode: readMode(params.get(VIEW_LINK_KEYS.mode)),
    lightingMode: readLighting(params.get(VIEW_LINK_KEYS.lighting)),
    materialVariantId: readVariantId(params.get(VIEW_LINK_KEYS.variant)),
    transformationStage: readStage(params.get(VIEW_LINK_KEYS.stage)),
  };
}

/**
 * The absolute URL for a view, built from a page URL the caller supplies
 * (window.location in the browser). Any query string already on that URL is
 * replaced, not merged, so sharing twice from one tab cannot accumulate two
 * conflicting `room=` values; the hash is dropped for the same reason.
 */
export function buildViewerLinkUrl(pageUrl: string, state: ViewerLinkState): string {
  const url = new URL(pageUrl);
  url.search = encodeViewerLink(state);
  url.hash = '';
  return url.toString();
}
