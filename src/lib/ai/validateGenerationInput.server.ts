import 'server-only';
import { houseModel } from '@/data/house';
import { materialVariants } from '@/data/materials';
import type { RoomId } from '@/lib/types';

const VALID_ROOM_IDS = new Set<string>(houseModel.rooms.map((r) => r.id));
const VALID_VARIANT_IDS = new Set(materialVariants.map((v) => v.id));
const SIMULATE_VALUES = new Set(['success', 'failure', 'moderated']);

export interface ValidatedGenerationRequest {
  roomId: RoomId;
  styleVariant: string;
  sourceAssetPath?: string;
  simulate?: 'success' | 'failure' | 'moderated';
  editInstruction?: string;
}

export type ValidationResult =
  | { ok: true; data: ValidatedGenerationRequest }
  | { ok: false; error: string };

export function validateGenerationRequest(body: unknown): ValidationResult {
  if (typeof body !== 'object' || body === null) {
    return { ok: false, error: 'Request body must be a JSON object.' };
  }
  const b = body as Record<string, unknown>;

  if (typeof b.roomId !== 'string' || !VALID_ROOM_IDS.has(b.roomId)) {
    return { ok: false, error: 'roomId must be one of the known house room ids.' };
  }

  const styleVariant = typeof b.styleVariant === 'string' && VALID_VARIANT_IDS.has(b.styleVariant) ? b.styleVariant : materialVariants[0].id;

  let sourceAssetPath: string | undefined;
  if (b.sourceAssetPath !== undefined) {
    if (typeof b.sourceAssetPath !== 'string' || !b.sourceAssetPath.startsWith('/') || b.sourceAssetPath.length > 300 || b.sourceAssetPath.includes('..')) {
      return { ok: false, error: 'sourceAssetPath must be a short site-relative path.' };
    }
    sourceAssetPath = b.sourceAssetPath;
  }

  const simulate = typeof b.simulate === 'string' && SIMULATE_VALUES.has(b.simulate) ? (b.simulate as 'success' | 'failure' | 'moderated') : undefined;

  let editInstruction: string | undefined;
  if (b.editInstruction !== undefined) {
    if (typeof b.editInstruction !== 'string') {
      return { ok: false, error: 'editInstruction must be a string.' };
    }
    editInstruction = b.editInstruction.slice(0, 500);
  }

  return { ok: true, data: { roomId: b.roomId as RoomId, styleVariant, sourceAssetPath, simulate, editInstruction } };
}
