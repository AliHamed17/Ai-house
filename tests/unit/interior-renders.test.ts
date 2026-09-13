import { existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { interiorRenders } from '@/data/interiors';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import { houseModel } from '@/data/house';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public');

describe('interior renders', () => {
  it('ships a render for every room in the house model', () => {
    const missing = houseModel.rooms.map((r) => r.id).filter((id) => !interiorRenders[id]);
    expect(missing).toEqual([]);
  });

  it('resolves every render to a real file on disk', () => {
    const broken = Object.entries(interiorRenders)
      .filter(([, r]) => {
        const abs = path.join(PUBLIC_DIR, r!.path);
        return !existsSync(abs) || statSync(abs).size < 50_000;
      })
      .map(([id]) => id);
    expect(broken).toEqual([]);
  });

  it('pairs every render with the construction frame it was generated from', () => {
    const unpaired = Object.keys(interiorRenders).filter(
      (id) => !roomEvidenceFrame[id as keyof typeof roomEvidenceFrame],
    );
    expect(unpaired).toEqual([]);
  });

  it('never claims a render for a room that no longer exists', () => {
    const known = new Set(houseModel.rooms.map((r) => r.id));
    const stale = Object.keys(interiorRenders).filter((id) => !known.has(id as never));
    expect(stale).toEqual([]);
  });
});
