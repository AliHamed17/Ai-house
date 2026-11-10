'use client';

import { useMemo } from 'react';
import { houseModel } from '@/data/house';
import { useViewerStore } from '@/lib/store/viewerStore';

const PADDING_M = 1.0;

export function Minimap() {
  const playerPose = useViewerStore((s) => s.playerPose);
  const activeRoomId = useViewerStore((s) => s.activeRoomId);
  const minimapOpen = useViewerStore((s) => s.minimapOpen);
  const requestTeleport = useViewerStore((s) => s.requestTeleport);
  const setMode = useViewerStore((s) => s.setMode);

  const bounds = useMemo(() => {
    let minX = Infinity;
    let maxX = -Infinity;
    let minZ = Infinity;
    let maxZ = -Infinity;
    for (const room of houseModel.rooms) {
      for (const p of room.floorPolygon) {
        minX = Math.min(minX, p.x);
        maxX = Math.max(maxX, p.x);
        minZ = Math.min(minZ, p.z);
        maxZ = Math.max(maxZ, p.z);
      }
    }
    return { minX: minX - PADDING_M, minZ: minZ - PADDING_M, width: maxX - minX + PADDING_M * 2, depth: maxZ - minZ + PADDING_M * 2 };
  }, []);

  if (!minimapOpen) return null;

  const headingDeg = (-playerPose.yaw * 180) / Math.PI;

  return (
    <div
      className="pointer-events-auto absolute bottom-4 right-4 z-20 overflow-hidden rounded-2xl border border-limestone/60 bg-ivory/90 shadow-xl backdrop-blur-sm"
      aria-label="Minimap"
      role="img"
    >
      <svg
        viewBox={`${bounds.minX} ${bounds.minZ} ${bounds.width} ${bounds.depth}`}
        width={200}
        height={(200 * bounds.depth) / bounds.width}
        className="block"
      >
        <rect x={bounds.minX} y={bounds.minZ} width={bounds.width} height={bounds.depth} fill="#F3EFE7" />
        {houseModel.rooms.map((room) => {
          const points = room.floorPolygon.map((p) => `${p.x},${p.z}`).join(' ');
          const isActive = room.id === activeRoomId;
          return (
            <polygon
              key={room.id}
              points={points}
              fill={isActive ? '#9A7656' : room.isProtected ? '#c9b79a' : '#D8CFC2'}
              stroke="#4B4037"
              strokeWidth={0.05}
              opacity={isActive ? 0.95 : 0.85}
              onClick={() => {
                // Same fix as the Rooms navigator and orbit labels: this
                // teleport is only ever consumed by the always-mounted
                // first-person camera, so clicking the minimap from
                // Dollhouse or Floor Plan must also switch to Walk.
                requestTeleport(room.id);
                setMode('first-person');
              }}
              style={{ cursor: 'pointer' }}
            >
              <title>{room.hotspotLabel}</title>
            </polygon>
          );
        })}
        <g transform={`translate(${playerPose.x} ${playerPose.z}) rotate(${headingDeg})`}>
          <polygon points="0,-0.55 0.35,0.4 -0.35,0.4" fill="#24221F" stroke="#F3EFE7" strokeWidth={0.05} />
        </g>
      </svg>
      <div className="border-t border-limestone/50 px-2 py-1 text-center text-[10px] font-medium tracking-wide text-charcoal/80">
        {houseModel.rooms.find((r) => r.id === activeRoomId)?.hotspotLabel ?? 'Exploring'}
      </div>
    </div>
  );
}
