'use client';

import { useState } from 'react';
import { Html } from '@react-three/drei';
import { allFurnitureItems } from '@/data/furniture';
import { FurnitureMesh } from './FurnitureMesh';

/**
 * Click-to-shop hotspots for every furniture item: hovering shows its name
 * (same Html tooltip idiom as DoorHotspots in RoomHotspots.tsx), clicking
 * opens a small panel with a real "Shop this" link. Anchor height for both
 * uses a sensible floor so a low/floating item (e.g. a wall-mounted vanity)
 * still gets a legible marker instead of one buried near the floor.
 */
export function FurnitureHotspots() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);

  return (
    <group>
      {allFurnitureItems.map((item) => {
        const anchorY = Math.max(item.heightM + 0.2, 0.9);
        return (
          <group
            key={item.id}
            position={[item.position.x, 0, item.position.z]}
            rotation={[0, item.rotationYRad, 0]}
            onClick={(e) => {
              e.stopPropagation();
              setSelectedId((current) => (current === item.id ? null : item.id));
            }}
            onPointerOver={(e) => {
              e.stopPropagation();
              setHoveredId(item.id);
              document.body.style.cursor = 'pointer';
            }}
            onPointerOut={() => {
              setHoveredId(null);
              document.body.style.cursor = 'auto';
            }}
          >
            <FurnitureMesh item={item} />
            {hoveredId === item.id && selectedId !== item.id && (
              <Html center distanceFactor={8} position={[0, anchorY, 0]} style={{ pointerEvents: 'none' }}>
                <div className="rounded-full bg-charcoal/90 px-3 py-1 text-xs font-medium tracking-wide text-ivory shadow-lg whitespace-nowrap">
                  {item.shopLabel}
                </div>
              </Html>
            )}
            {selectedId === item.id && (
              <Html center distanceFactor={8} position={[0, anchorY + 0.15, 0]}>
                <div className="w-56 rounded-xl border border-limestone/60 bg-ivory/95 p-3 shadow-xl">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-charcoal">{item.shopLabel}</p>
                      <p className="text-xs text-charcoal/70">{item.category}</p>
                    </div>
                    <button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        setSelectedId(null);
                      }}
                      aria-label="Close"
                      className="text-charcoal/50 hover:text-charcoal"
                    >
                      ×
                    </button>
                  </div>
                  <a
                    href={item.productUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-block rounded-full bg-bronze px-3 py-1 text-xs font-medium text-ivory hover:bg-charcoal"
                  >
                    Shop this — {item.retailer}
                  </a>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
