'use client';

import type { TransformationLighting } from '@/lib/types';

/**
 * The transformation film's authored lighting, shared by the two places that
 * must agree on it: the locked-camera renderer that produces the video frames
 * (TransformationStageScene) and the walkable explorer, when a visitor steps
 * into a stage through "Enter this moment in 3D".
 *
 * Keeping one definition is the whole point. Collapsing these four states into
 * the viewer's generic day/evening presets meant the handoff preserved which
 * furniture existed but not how the room was lit, so the 3D room visibly did
 * not match the frame the visitor had just been looking at.
 */

/** Per-lighting-state rig values. Tuned to reproduce the reference's measured
 *  luminance arc (see LIGHTING_ENVELOPE) — daylight flat and bright, dusk
 *  deep, warm-evening warmer AND higher-contrast than the opening. */
const LIGHT_RIGS: Record<
  TransformationLighting,
  {
    sky: string;
    /** Hemisphere "ground" colour. This is what lights every downward-facing
     *  surface — the ceiling soffit, cabinet undersides, the worktop nose.
     *  A dark value here is what makes an interior render read as a black
     *  void above the wall line, so it stays a warm mid-tone in daylight and
     *  only drops for the evening beats. */
    ground: string;
    ambient: number;
    /** Broad soft fill standing in for interior bounce, which a real-time
     *  renderer has no global illumination to produce on its own. */
    fill: number;
    sunIntensity: number;
    sunColor: string;
    sunPosition: [number, number, number];
    fixtureIntensity: number;
    glow: boolean;
  }
> = {
  daylight: {
    sky: '#EAF0F4',
    ground: '#CCC2B2',
    ambient: 2.15,
    fill: 1.1,
    sunIntensity: 1.05,
    sunColor: '#FFF6E8',
    // From the open terrace/dining side rather than raking across the
    // cabinet wall: a low side-on sun threw a hard staircase shadow over the
    // whole elevation, which read as a CG artefact rather than daylight.
    sunPosition: [4, 14, 9],
    fixtureIntensity: 0,
    glow: false,
  },
  'daylight-dimming': {
    sky: '#CFD6DB',
    ground: '#A79C8B',
    ambient: 1.45,
    fill: 0.62,
    sunIntensity: 0.8,
    sunColor: '#FFEFDC',
    sunPosition: [4, 14, 9],
    fixtureIntensity: 0.25,
    glow: false,
  },
  dusk: {
    sky: '#7B8088',
    ground: '#5E564B',
    ambient: 1.02,
    fill: 0.42,
    sunIntensity: 0.22,
    sunColor: '#C9C3D2',
    sunPosition: [4, 14, 9],
    fixtureIntensity: 0.6,
    glow: true,
  },
  'warm-evening': {
    sky: '#3A342E',
    ground: '#6A5440',
    ambient: 1.0,
    fill: 0.4,
    sunIntensity: 0.1,
    sunColor: '#9FA6B8',
    sunPosition: [4, 14, 9],
    fixtureIntensity: 4.0,
    glow: true,
  },
};

/** Warm fixtures that belong to THIS kitchen's design: the two island
 *  pendants, the under-cabinet task strip and the display-cabinet interiors.
 *  Positions are derived from the authored furniture, not invented. */
const KITCHEN_FIXTURES: { position: [number, number, number]; intensity: number; distance: number }[] = [
  { position: [2.07, 1.9, 5.25], intensity: 1.0, distance: 4.5 }, // island pendant N
  { position: [2.07, 1.9, 6.45], intensity: 1.0, distance: 4.5 }, // island pendant S
  { position: [0.5, 1.42, 5.2], intensity: 0.55, distance: 2.6 }, // under-cabinet task strip
  { position: [0.5, 1.55, 6.15], intensity: 0.4, distance: 2.2 }, // suspended-shelf accent
  { position: [0.25, 1.7, 4.4], intensity: 0.5, distance: 2.4 }, // display cabinet N
  { position: [0.25, 1.7, 6.9], intensity: 0.5, distance: 2.4 }, // display cabinet S
];

/**
 * Whether this lighting state has the room's own fixtures lit. Exported so
 * the emissive-furniture decision comes from the SAME rig table that lights
 * the scene — the film and the explorer cannot disagree about which objects
 * glow, and adding a rig cannot leave the two out of step.
 */
export function stageLightingGlows(lighting: TransformationLighting): boolean {
  return LIGHT_RIGS[lighting].glow;
}

export function StageLighting({
  lighting,
  fog,
}: {
  lighting: TransformationLighting;
  /**
   * Depth cueing for the walkable explorer. The film's camera is locked
   * inside one room and needs none, but the explorer can see clear across
   * the house, where unfogged distance reads as flat. Supplied by the caller
   * rather than baked into the rig because it is a property of the VIEW, not
   * of the authored lighting state.
   */
  fog?: { colorHex: string; nearM: number; farM: number };
}) {
  const rig = LIGHT_RIGS[lighting];
  return (
    <>
      <color attach="background" args={[rig.sky]} />
      {fog && <fog attach="fog" args={[fog.colorHex, fog.nearM, fog.farM]} />}
      <hemisphereLight args={[rig.sky, rig.ground, rig.ambient]} />
      <directionalLight
        position={rig.sunPosition}
        color={rig.sunColor}
        intensity={rig.sunIntensity}
        castShadow
        shadow-mapSize={[2048, 2048]}
        shadow-bias={-0.0005}
        shadow-camera-left={-8}
        shadow-camera-right={8}
        shadow-camera-top={8}
        shadow-camera-bottom={-8}
      />
      {/* Shadowless fill from the camera side, standing in for the interior
          bounce a real-time renderer cannot compute. Without it the cabinet
          wall falls into near-black wherever the sun does not reach. */}
      <directionalLight position={[6, 3, 5.65]} color={rig.sunColor} intensity={rig.fill} />
      {rig.fixtureIntensity > 0 &&
        KITCHEN_FIXTURES.map((f, i) => (
          <pointLight
            key={i}
            position={f.position}
            color="#FFC08A"
            intensity={f.intensity * rig.fixtureIntensity}
            distance={f.distance}
            decay={2}
          />
        ))}
    </>
  );
}
