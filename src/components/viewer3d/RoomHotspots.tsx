'use client';

import { useMemo, useState } from 'react';
import { Html } from '@react-three/drei';
import { houseModel } from '@/data/house';
import { useViewerStore } from '@/lib/store/viewerStore';
import type { RoomId } from '@/lib/types';

const NAVIGABLE_KINDS = new Set(['door', 'open_threshold', 'exterior_opening']);

/**
 * Door / threshold hotspots: a small floor marker at every navigable opening
 * that teleports (with a short store-driven fade, see TeleportFade.tsx) to
 * whichever side of the doorway the visitor isn't currently standing on.
 */
export function DoorHotspots() {
  const activeRoomId = useViewerStore((s) => s.activeRoomId);
  const requestTeleport = useViewerStore((s) => s.requestTeleport);
  const setMode = useViewerStore((s) => s.setMode);
  const mode = useViewerStore((s) => s.mode);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  const doorOpenings = useMemo(
    () => houseModel.openings.filter((o) => NAVIGABLE_KINDS.has(o.kind) && o.roomA && o.roomB),
    [],
  );

  // "Whichever side I'm not on" only means something when the visitor is
  // actually standing in one specific room — in orbit/Dollhouse, every door
  // marker in the whole house renders at once with activeRoomId matching
  // neither side for nearly all of them, so the ternary below silently
  // picked roomA regardless of which side a visitor would expect (e.g.
  // clicking the parents-bedroom doorway from the exterior approach jumped
  // to hall_south instead). RoomLabelHotspots already covers unambiguous
  // room-to-room jumping from orbit mode, so door markers are floorplan-only
  // in the other direction too: both are "not walking through a door" views.
  if (mode === 'floorplan' || mode === 'orbit') return null;

  return (
    <group>
      {doorOpenings.map((o) => {
        const other: RoomId | undefined = o.roomA === activeRoomId ? (o.roomB as RoomId) : (o.roomA as RoomId);
        const targetRoom = houseModel.rooms.find((r) => r.id === other);
        if (!targetRoom) return null;
        const isHovered = hoveredId === o.id;
        return (
          <group key={o.id} position={[o.position.x, 0.02, o.position.z]}>
            <mesh
              rotation={[-Math.PI / 2, 0, 0]}
              onClick={(e) => {
                e.stopPropagation();
                // Only ever rendered in first-person mode now (see the
                // floorplan/orbit guard above), so this is always an
                // in-house teleport with no mode switch of its own needed —
                // kept explicit anyway to stay correct if that guard ever
                // changes.
                requestTeleport(targetRoom.id);
                setMode('first-person');
              }}
              onPointerOver={(e) => {
                e.stopPropagation();
                setHoveredId(o.id);
                document.body.style.cursor = 'pointer';
              }}
              onPointerOut={() => {
                setHoveredId(null);
                document.body.style.cursor = 'auto';
              }}
            >
              <circleGeometry args={[isHovered ? 0.34 : 0.26, 24]} />
              <meshBasicMaterial color={isHovered ? '#e8c98a' : '#f3efe7'} transparent opacity={isHovered ? 0.95 : 0.7} />
            </mesh>
            {isHovered && (
              <Html center distanceFactor={8} style={{ pointerEvents: 'none' }}>
                <div className="rounded-full bg-charcoal/90 px-3 py-1 text-xs font-medium tracking-wide text-ivory shadow-lg whitespace-nowrap">
                  Go to {targetRoom.hotspotLabel}
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}

/** Floating room labels used as long-range "jump anywhere" hotspots in orbit/dollhouse mode. */
export function RoomLabelHotspots() {
  const activeRoomId = useViewerStore((s) => s.activeRoomId);
  const requestTeleport = useViewerStore((s) => s.requestTeleport);
  const setMode = useViewerStore((s) => s.setMode);
  const mode = useViewerStore((s) => s.mode);

  if (mode !== 'orbit') return null;

  return (
    <group>
      {houseModel.rooms.map((room) => {
        if (room.isExterior) return null;
        const isActive = room.id === activeRoomId;
        return (
          <Html key={room.id} position={[room.cameraSpawn.x, room.wallHeightOverrideM ?? room.ceilingHeightM * 0.55, room.cameraSpawn.z]} center distanceFactor={12}>
            <button
              type="button"
              onClick={() => {
                // This teleport is only ever consumed by the always-mounted
                // first-person camera, so — same as the Rooms navigator —
                // clicking one of these orbit-only labels must also switch to
                // Walk, or the dollhouse overview collapses inside the house
                // while Dollhouse stays visually selected.
                requestTeleport(room.id);
                setMode('first-person');
              }}
              className={`rounded-full border px-3 py-1 text-xs font-medium tracking-wide shadow-md transition-colors ${
                isActive
                  ? 'border-bronze bg-bronze text-ivory'
                  : 'border-limestone/70 bg-ivory/90 text-charcoal hover:bg-ivory'
              }`}
            >
              {room.hotspotLabel}
            </button>
          </Html>
        );
      })}
    </group>
  );
}
