'use client';

import { useMemo, useState } from 'react';
import { houseModel } from '@/data/house';
import type { RoomId } from '@/lib/types';

const CONFIDENCE_LABEL: Record<string, string> = {
  high: 'High confidence',
  'medium-high': 'Medium-high confidence',
  medium: 'Medium confidence',
  low: 'Low confidence — assumption',
};

export interface InteractiveFloorPlanProps {
  onRoomActivate?: (roomId: RoomId) => void;
  activateLabel?: string;
  selectedRoomId?: RoomId | null;
  className?: string;
}

export function InteractiveFloorPlan({ onRoomActivate, activateLabel = 'Enter room', selectedRoomId, className }: InteractiveFloorPlanProps) {
  const [hoveredId, setHoveredId] = useState<RoomId | null>(null);

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
    const pad = 0.8;
    return { minX: minX - pad, minZ: minZ - pad, width: maxX - minX + pad * 2, depth: maxZ - minZ + pad * 2 };
  }, []);

  const activeId = hoveredId ?? selectedRoomId ?? null;
  const activeRoom = activeId ? houseModel.rooms.find((r) => r.id === activeId) : null;

  return (
    <div className={`flex flex-col gap-4 md:flex-row md:items-start ${className ?? ''}`}>
      <div className="w-full max-w-xl overflow-hidden rounded-3xl border border-limestone/60 bg-ivory shadow-sm">
        <svg
          viewBox={`${bounds.minX} ${bounds.minZ} ${bounds.width} ${bounds.depth}`}
          className="h-auto w-full"
          role="group"
          aria-label="Interactive floor plan"
        >
          <rect x={bounds.minX} y={bounds.minZ} width={bounds.width} height={bounds.depth} fill="#F3EFE7" />
          {houseModel.rooms.map((room) => {
            const isActive = room.id === activeId;
            const points = room.floorPolygon.map((p) => `${p.x},${p.z}`).join(' ');
            return (
              <polygon
                key={room.id}
                points={points}
                fill={isActive ? '#9A7656' : room.isProtected ? '#E4D3B4' : room.isWetRoom ? '#C9C1B4' : '#D8CFC2'}
                stroke="#4B4037"
                strokeWidth={0.04}
                className="cursor-pointer transition-colors duration-150"
                onMouseEnter={() => setHoveredId(room.id)}
                onMouseLeave={() => setHoveredId((v) => (v === room.id ? null : v))}
                onClick={() => onRoomActivate?.(room.id)}
                tabIndex={0}
                role="button"
                aria-label={`${room.hotspotLabel}${room.isProtected ? ' (MAMAD protected room)' : ''}`}
                onFocus={() => setHoveredId(room.id)}
                onBlur={() => setHoveredId((v) => (v === room.id ? null : v))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') onRoomActivate?.(room.id);
                }}
              />
            );
          })}
          {houseModel.openings
            .filter((o) => o.kind === 'door' || o.kind === 'exterior_opening')
            .map((o) => (
              <circle key={o.id} cx={o.position.x} cy={o.position.z} r={0.12} fill="#F3EFE7" stroke="#4B4037" strokeWidth={0.03} />
            ))}
        </svg>
      </div>

      <div className="w-full max-w-sm rounded-3xl border border-limestone/60 bg-ivory p-5 shadow-sm">
        {activeRoom ? (
          <div>
            <h3 className="font-display text-lg text-charcoal">{activeRoom.nameEn}</h3>
            {activeRoom.nameHe && <p className="text-sm text-charcoal/60" dir="rtl">{activeRoom.nameHe}</p>}
            <p className="mt-2 text-sm text-charcoal/80">{activeRoom.function}</p>
            <dl className="mt-3 grid grid-cols-2 gap-2 text-xs text-charcoal/70">
              <div>
                <dt className="font-semibold uppercase tracking-wide">Width</dt>
                <dd>{activeRoom.dimensions.widthM.toFixed(2)} m</dd>
              </div>
              <div>
                <dt className="font-semibold uppercase tracking-wide">Depth</dt>
                <dd>{activeRoom.dimensions.depthM.toFixed(2)} m</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold uppercase tracking-wide">Confidence</dt>
                <dd>{CONFIDENCE_LABEL[activeRoom.confidence] ?? activeRoom.confidence}</dd>
              </div>
              <div className="col-span-2">
                <dt className="font-semibold uppercase tracking-wide">Dimension source</dt>
                <dd>{activeRoom.dimensionSource}</dd>
              </div>
            </dl>
            {activeRoom.isProtected && (
              <p className="mt-3 rounded-xl bg-olive/10 px-3 py-2 text-xs text-olive">
                🛡 MAMAD protected room — door, window, ventilation, and clearances are fixed and cannot be altered.
              </p>
            )}
            {onRoomActivate && (
              <button
                type="button"
                onClick={() => onRoomActivate(activeRoom.id)}
                className="mt-4 w-full rounded-full bg-bronze px-4 py-2 text-sm font-semibold text-ivory hover:opacity-90"
              >
                {activateLabel}
              </button>
            )}
          </div>
        ) : (
          <p className="text-sm text-charcoal/60">Hover or select a room to see its dimensions, confidence, and notes.</p>
        )}
      </div>
    </div>
  );
}
