import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { baseMaterials } from '@/data/materials';
import { TEXTURE_REPEAT_M } from '@/lib/textures';

describe('material textures', () => {
  it('has a positive repeat size (meters per tile) for every base material', () => {
    for (const id of Object.keys(baseMaterials)) {
      expect(TEXTURE_REPEAT_M[id]).toBeGreaterThan(0);
    }
  });

  it('has a committed texture file for every base material', () => {
    for (const id of Object.keys(baseMaterials)) {
      const file = path.resolve(process.cwd(), 'public', 'textures', `${id}.png`);
      expect(existsSync(file)).toBe(true);
    }
  });
});
