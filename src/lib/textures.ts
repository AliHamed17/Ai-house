'use client';

import { useMemo } from 'react';
import * as THREE from 'three';
import { useTexture } from '@react-three/drei';

/**
 * Real-world tile size for each base material, in meters per texture repeat.
 * Used to derive `repeat` from a surface's actual size so grain/plank scale
 * reads correctly instead of stretching one tile across an entire room.
 */
export const TEXTURE_REPEAT_M: Record<string, number> = {
  'limestone-social': 0.9,
  'oak-bedroom': 0.6,
  'stone-wet': 0.6,
  'stone-entry': 0.9,
  'exterior-stone': 1.1,
  'wall-warm-plaster': 1.2,
  'exterior-render': 1.2,
};

function texturePath(materialId: string): string {
  return `/textures/${materialId}.png`;
}

/**
 * Loads (and caches, via drei's suspense loader) the tileable texture for a
 * base material and returns an independent, real-scale-repeat-configured
 * clone for a surface of the given size. Cloning matters because the same
 * material id (and so the same cached texture object) is reused by many
 * differently-sized rooms/walls — mutating the shared cached texture in
 * place would make every surface fight over one `repeat` value. Returns
 * `null` for an unknown material id so callers can fall back to a flat
 * color with no texture.
 */
export function useMaterialTexture(materialId: string, widthM: number, heightM: number): THREE.Texture | null {
  const repeatM = TEXTURE_REPEAT_M[materialId];
  const baseTexture = useTexture(texturePath(materialId));

  return useMemo(() => {
    if (!repeatM) return null;
    const texture = baseTexture.clone();
    texture.wrapS = THREE.RepeatWrapping;
    texture.wrapT = THREE.RepeatWrapping;
    texture.repeat.set(Math.max(widthM / repeatM, 0.01), Math.max(heightM / repeatM, 0.01));
    texture.needsUpdate = true;
    return texture;
  }, [baseTexture, repeatM, widthM, heightM]);
}
