import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { houseModel } from '@/data/house';

const CONCEPT_DIR = path.resolve(import.meta.dirname, '../../public/generated/concepts');

// Demo mode links every room to /generated/concepts/<id>.svg, so a room without
// a placeholder renders a 404 rather than a labelled concept card.
describe('concept placeholder coverage', () => {
  it('ships a placeholder for every room in the house model', () => {
    const missing = houseModel.rooms
      .map((room) => room.id)
      .filter((id) => !existsSync(path.join(CONCEPT_DIR, `${id}.svg`)));
    expect(missing).toEqual([]);
  });

  it('covers all 14 rooms', () => {
    expect(houseModel.rooms).toHaveLength(14);
  });

  it('labels every placeholder as demo output, never as real AI', () => {
    for (const room of houseModel.rooms) {
      const svg = readFileSync(path.join(CONCEPT_DIR, `${room.id}.svg`), 'utf8');
      expect(svg).toContain('DEMO MODE — NOT AI-GENERATED');
    }
  });
});
