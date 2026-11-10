'use client';

import { useState } from 'react';
import { Html } from '@react-three/drei';
import { allFurnitureItems } from '@/data/furniture';
import { useViewerStore } from '@/lib/store/viewerStore';
import { useShortlistStore } from '@/lib/store/shortlistStore';
import { usePointerLockRelease } from '@/lib/usePointerLockRelease';
import { getStage, isFurnitureVisibleAtStage } from '@/lib/transformation';
import { stageLightingGlows } from './StageLighting';
import { FurnitureMesh } from './FurnitureMesh';

/**
 * Click-to-shop hotspots for every furniture item: hovering shows its name
 * (same Html tooltip idiom as DoorHotspots in RoomHotspots.tsx), clicking
 * opens a small panel with a real "Shop this" link. Anchor height for both
 * uses a sensible floor so a low/floating item (e.g. a wall-mounted vanity)
 * still gets a legible marker instead of one buried near the floor.
 *
 * When a transformation stage is active the kitchen shows only the objects
 * that exist at that stage — the same filter the video is assembled from
 * (src/lib/transformation.ts), so the two can never disagree. Every other
 * room is unaffected.
 */
export function FurnitureHotspots() {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [hoveredId, setHoveredId] = useState<string | null>(null);
  const transformationStage = useViewerStore((s) => s.transformationStage);
  const lightingMode = useViewerStore((s) => s.lightingMode);
  const shortlistIds = useShortlistStore((s) => s.ids);
  const toggleShortlist = useShortlistStore((s) => s.toggle);

  // The open panel is real DOM with a link and two buttons in it. The same
  // click that opens it also asks first-person mode to lock the pointer,
  // which would hide the cursor and keep every subsequent mouse event on the
  // canvas — leaving the visitor looking at a Shop/Save panel they cannot
  // reach. Drag-to-look still works while it is open.
  usePointerLockRelease(selectedId !== null);

  // Fixtures and display joinery glow whenever the room is lit artificially:
  // in the transformation's dusk/warm-reveal beats, and in ordinary evening
  // mode. Without this the "enter this exact moment in 3D" handoff dropped
  // into an unlit version of a stage the video had just shown glowing.
  // Which objects glow comes from the SAME rig table that lights the scene
  // (see StageLighting), not a second hardcoded list of lighting states that
  // could drift from it. Outside a stage, the viewer's own mode decides.
  const stageLighting = transformationStage ? getStage(transformationStage).lighting : null;
  const warmLight = stageLighting !== null ? stageLightingGlows(stageLighting) : lightingMode === 'evening';

  return (
    <group>
      {allFurnitureItems.map((item) => {
        if (!isFurnitureVisibleAtStage(item, transformationStage)) return null;
        const anchorY = Math.max((item.mountYM ?? 0) + item.heightM + 0.2, 0.9);
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
            <FurnitureMesh item={item} warmLight={warmLight} />
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
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <a
                      href={item.productUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block rounded-full bg-bronze px-3 py-1 text-xs font-medium text-ivory hover:bg-charcoal"
                    >
                      Shop this — {item.retailer}
                    </a>
                    {/* Saving is a toggle on one shared list, so the button
                        states what the next click will do AND what is true
                        now (aria-pressed) — a visitor who walks back to a
                        piece they already saved must not be able to add it
                        twice or be told it isn't there. */}
                    <button
                      type="button"
                      aria-pressed={shortlistIds.includes(item.id)}
                      onClick={(e) => {
                        e.stopPropagation();
                        toggleShortlist(item.id);
                      }}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors ${
                        shortlistIds.includes(item.id)
                          ? 'border-bronze bg-bronze/15 text-charcoal hover:bg-bronze/25'
                          : 'border-limestone/70 text-charcoal/80 hover:bg-limestone/40 hover:text-charcoal'
                      }`}
                    >
                      {shortlistIds.includes(item.id) ? '✓ Saved' : '+ Save'}
                    </button>
                  </div>
                </div>
              </Html>
            )}
          </group>
        );
      })}
    </group>
  );
}
