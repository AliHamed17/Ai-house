'use client';

import { HouseGeometry } from './HouseGeometry';
import { Lighting } from './Lighting';
import { FirstPersonControls } from './FirstPersonControls';
import { OrbitDollhouseControls } from './OrbitDollhouseControls';
import { DoorHotspots, RoomLabelHotspots } from './RoomHotspots';
import { FurnitureHotspots } from './FurnitureHotspots';
import { useViewerStore } from '@/lib/store/viewerStore';

export function Scene() {
  const mode = useViewerStore((s) => s.mode);
  const lightingMode = useViewerStore((s) => s.lightingMode);
  const materialVariantId = useViewerStore((s) => s.materialVariantId);

  return (
    <>
      <Lighting mode={lightingMode} />
      {/* Ceilings are hidden in Dollhouse mode: the elevated overview camera
          looks straight down, so an opaque ceiling plane would block the view
          into the room below it instead of showing the house's interior. */}
      <HouseGeometry variantId={materialVariantId} hideCeilings={mode === 'orbit'} />
      <DoorHotspots />
      <RoomLabelHotspots />
      <FurnitureHotspots />
      <FirstPersonControls />
      {mode === 'orbit' && <OrbitDollhouseControls />}
    </>
  );
}
