'use client';

import { lightingPresets } from '@/data/materials';
import type { LightingMode } from '@/lib/store/viewerStore';

function kelvinToRgbHex(kelvin: number): string {
  // Compact approximation good enough for warm interior fixtures (2700-3000K).
  if (kelvin <= 2700) return '#ffb877';
  if (kelvin <= 3000) return '#ffc794';
  return '#ffe9c7';
}

const INTERIOR_FIXTURES: { position: [number, number, number]; intensity: number }[] = [
  { position: [2.4, 2.4, 2.0], intensity: 1.0 }, // living pendant
  { position: [1.5, 2.3, 5.6], intensity: 0.8 }, // kitchen
  { position: [4.0, 2.3, 5.6], intensity: 1.0 }, // dining pendant
  { position: [6.1, 2.3, 1.5], intensity: 0.7 }, // entry hall
  { position: [9.05, 2.3, 1.5], intensity: 0.6 }, // mamad
  { position: [13.0, 2.3, 1.75], intensity: 0.6 }, // twin bed
  { position: [13.8, 2.3, 8.1], intensity: 0.7 }, // parents bed
];

export function Lighting({ mode }: { mode: LightingMode }) {
  const preset = lightingPresets[mode];
  const fixtureColor = kelvinToRgbHex(preset.interiorColorTempK);

  return (
    <>
      <color attach="background" args={[preset.skyColorHex]} />
      <fog attach="fog" args={[preset.fogColorHex, preset.fogNearM, preset.fogFarM]} />
      <hemisphereLight args={[preset.skyColorHex, '#3a352c', preset.ambientIntensity]} />
      <directionalLight
        position={preset.sunPositionM}
        color={preset.sunColorHex}
        intensity={preset.sunIntensity}
        castShadow
        shadow-mapSize={[1024, 1024]}
        shadow-camera-left={-12}
        shadow-camera-right={12}
        shadow-camera-top={12}
        shadow-camera-bottom={-12}
      />
      {INTERIOR_FIXTURES.map((f, i) => (
        <pointLight
          key={i}
          position={f.position}
          color={fixtureColor}
          intensity={f.intensity * preset.interiorIntensity}
          distance={6}
          decay={2}
        />
      ))}
    </>
  );
}
