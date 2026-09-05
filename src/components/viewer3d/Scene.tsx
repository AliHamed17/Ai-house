'use client';

import { HouseGeometry } from './HouseGeometry';
import { Lighting } from './Lighting';
import { FirstPersonControls } from './FirstPersonControls';
import { OrbitDollhouseControls } from './OrbitDollhouseControls';
import { DoorHotspots, RoomLabelHotspots } from './RoomHotspots';
import { useViewerStore } from '@/lib/store/viewerStore';

export function Scene() {
  const mode = useViewerStore((s) => s.mode);
  const lightingMode = useViewerStore((s) => s.lightingMode);
  const materialVariantId = useViewerStore((s) => s.materialVariantId);

  return (
    <>
      <Lighting mode={lightingMode} />
      <HouseGeometry variantId={materialVariantId} />
      <DoorHotspots />
      <RoomLabelHotspots />
      <FirstPersonControls />
      {mode === 'orbit' && <OrbitDollhouseControls />}
    </>
  );
}
