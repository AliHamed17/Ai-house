import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import { houseModel } from '@/data/house';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public');

describe('evidence frame references', () => {
  it('resolves every referenced frame to a file on disk', () => {
    const missing = Object.entries(roomEvidenceFrame)
      .filter(([, frame]) => !existsSync(path.join(PUBLIC_DIR, frame.path)))
      .map(([roomId, frame]) => `${roomId} -> ${frame.path}`);
    expect(missing).toEqual([]);
  });

  it('maps every room in the house model to a frame', () => {
    const unmapped = houseModel.rooms.map((r) => r.id).filter((id) => !roomEvidenceFrame[id]);
    expect(unmapped).toEqual([]);
  });

  it('uses a mm:ss timestamp for every frame', () => {
    for (const [roomId, frame] of Object.entries(roomEvidenceFrame)) {
      expect(frame.timestamp, roomId).toMatch(/^\d{2}:\d{2}$/);
    }
  });

  it('never labels a frame more confident than its evidence allows', () => {
    const allowed = new Set(['high', 'medium-high', 'medium', 'low']);
    for (const [roomId, frame] of Object.entries(roomEvidenceFrame)) {
      expect(allowed.has(frame.confidence), roomId).toBe(true);
    }
  });
});
