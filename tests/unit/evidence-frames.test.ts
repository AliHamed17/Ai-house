import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { roomEvidence, roomEvidenceFrame } from '@/data/evidenceFrames';
import { houseModel } from '@/data/house';

const PUBLIC_DIR = path.resolve(import.meta.dirname, '../../public');

describe('evidence frame references', () => {
  it('resolves every referenced frame to a file on disk', () => {
    const missing = Object.entries(roomEvidence)
      .flatMap(([roomId, e]) => e.shots.map((s) => ({ roomId, ...s })))
      .filter((s) => !existsSync(path.join(PUBLIC_DIR, s.path)))
      .map((s) => `${s.roomId} -> ${s.path}`);
    expect(missing).toEqual([]);
  });

  it('maps every room in the house model to a gallery with at least one shot', () => {
    const unmapped = houseModel.rooms
      .map((r) => r.id)
      .filter((id) => !roomEvidence[id] || roomEvidence[id].shots.length === 0);
    expect(unmapped).toEqual([]);
  });

  it('exposes a representative still for every room', () => {
    const missing = houseModel.rooms.map((r) => r.id).filter((id) => !roomEvidenceFrame[id]?.path);
    expect(missing).toEqual([]);
  });

  it('uses a mm:ss timestamp for every shot', () => {
    for (const [roomId, e] of Object.entries(roomEvidence)) {
      for (const shot of e.shots) {
        expect(shot.timestamp, roomId).toMatch(/^\d{2}:\d{2}$/);
      }
    }
  });

  it('never labels a room more confident than its evidence allows', () => {
    const allowed = new Set(['high', 'medium-high', 'medium', 'low']);
    for (const [roomId, e] of Object.entries(roomEvidence)) {
      expect(allowed.has(e.confidence), roomId).toBe(true);
    }
  });

  it('marks the two rooms the walkthrough never entered as low confidence', () => {
    for (const roomId of ['wc', 'terrace_south'] as const) {
      expect(roomEvidence[roomId].confidence, roomId).toBe('low');
      expect(roomEvidence[roomId].caption.toLowerCase(), roomId).toContain('never entered');
    }
  });

  it('carries a materially larger gallery than the single-frame-per-room original', () => {
    const total = Object.values(roomEvidence).reduce((n, e) => n + e.shots.length, 0);
    expect(total).toBeGreaterThanOrEqual(50);
  });

  it('never hardcodes a frame path in a component', () => {
    const SRC = path.resolve(import.meta.dirname, '../../src');
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          walk(full);
        } else if (entry.name.endsWith('.tsx')) {
          const hits = readFileSync(full, 'utf8').match(/'[^']*\/evidence\/frames\/[^']*'|"[^"]*\/evidence\/frames\/[^"]*"/g);
          if (hits) offenders.push(`${path.relative(SRC, full)}: ${hits.join(', ')}`);
        }
      }
    };
    walk(SRC);
    expect(offenders).toEqual([]);
  });
});
