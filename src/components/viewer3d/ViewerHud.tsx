'use client';

import { useState } from 'react';
import { useViewerStore, type ViewMode } from '@/lib/store/viewerStore';
import { materialVariants } from '@/data/materials';
import { ENTRY_ROOM_ID } from '@/data/house';

const MODES: { id: ViewMode; label: string }[] = [
  { id: 'first-person', label: 'Walk' },
  { id: 'orbit', label: 'Dollhouse' },
  { id: 'floorplan', label: 'Floor Plan' },
];

export function ViewerHud({ onExit }: { onExit: () => void }) {
  const mode = useViewerStore((s) => s.mode);
  const setMode = useViewerStore((s) => s.setMode);
  const lightingMode = useViewerStore((s) => s.lightingMode);
  const setLightingMode = useViewerStore((s) => s.setLightingMode);
  const materialVariantId = useViewerStore((s) => s.materialVariantId);
  const setMaterialVariantId = useViewerStore((s) => s.setMaterialVariantId);
  const minimapOpen = useViewerStore((s) => s.minimapOpen);
  const setMinimapOpen = useViewerStore((s) => s.setMinimapOpen);
  const helpOpen = useViewerStore((s) => s.helpOpen);
  const setHelpOpen = useViewerStore((s) => s.setHelpOpen);
  const requestTeleport = useViewerStore((s) => s.requestTeleport);
  const isPointerLocked = useViewerStore((s) => s.isPointerLocked);
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);

  return (
    <>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-20 flex flex-wrap items-start justify-between gap-2 p-4">
        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onExit}
            className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
          >
            ✕ Exit 3D
          </button>
          <div className="flex overflow-hidden rounded-full border border-limestone/60 bg-ivory/90 shadow-lg backdrop-blur-sm">
            {MODES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMode(m.id)}
                aria-pressed={mode === m.id}
                className={`px-3 py-2 text-xs font-semibold tracking-wide transition-colors ${
                  mode === m.id ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
          <button
            type="button"
            onClick={() => requestTeleport(ENTRY_ROOM_ID)}
            className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
          >
            ⟲ Reset View
          </button>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          <div className="flex overflow-hidden rounded-full border border-limestone/60 bg-ivory/90 shadow-lg backdrop-blur-sm">
            <button
              type="button"
              onClick={() => setLightingMode('day')}
              aria-pressed={lightingMode === 'day'}
              className={`px-3 py-2 text-xs font-semibold tracking-wide ${lightingMode === 'day' ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'}`}
            >
              ☀ Day
            </button>
            <button
              type="button"
              onClick={() => setLightingMode('evening')}
              aria-pressed={lightingMode === 'evening'}
              className={`px-3 py-2 text-xs font-semibold tracking-wide ${lightingMode === 'evening' ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'}`}
            >
              ☾ Evening
            </button>
          </div>

          <div className="relative">
            <button
              type="button"
              onClick={() => setVariantMenuOpen((v) => !v)}
              className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
            >
              Materials ▾
            </button>
            {variantMenuOpen && (
              <div className="absolute right-0 mt-2 w-56 rounded-2xl border border-limestone/60 bg-ivory/95 p-2 shadow-xl backdrop-blur-sm">
                {materialVariants.map((v) => (
                  <button
                    key={v.id}
                    type="button"
                    onClick={() => {
                      setMaterialVariantId(v.id);
                      setVariantMenuOpen(false);
                    }}
                    className={`flex w-full flex-col rounded-xl px-3 py-2 text-left text-xs transition-colors ${
                      materialVariantId === v.id ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'
                    }`}
                  >
                    <span className="font-semibold">{v.label}</span>
                    <span className="opacity-75">{v.description}</span>
                  </button>
                ))}
              </div>
            )}
          </div>

          <button
            type="button"
            onClick={() => setMinimapOpen(!minimapOpen)}
            aria-pressed={minimapOpen}
            className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
          >
            Map
          </button>
          <button
            type="button"
            onClick={() => setHelpOpen(!helpOpen)}
            className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
          >
            ? Help
          </button>
        </div>
      </div>

      {mode === 'first-person' && (
        <div className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-1.5 w-1.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-ivory/80 shadow" />
      )}

      {mode === 'first-person' && !isPointerLocked && (
        <div className="pointer-events-none absolute bottom-4 left-1/2 z-20 -translate-x-1/2 rounded-full bg-charcoal/70 px-4 py-2 text-xs font-medium tracking-wide text-ivory">
          Click and drag to look around · WASD to move
        </div>
      )}

      {helpOpen && (
        <div className="pointer-events-auto absolute inset-0 z-40 flex items-center justify-center bg-charcoal/60 p-4">
          <div className="max-w-md rounded-3xl border border-limestone/50 bg-ivory p-6 shadow-2xl">
            <h2 className="font-display text-xl text-charcoal">Explorer Controls</h2>
            <dl className="mt-4 space-y-3 text-sm text-charcoal/90">
              <div>
                <dt className="font-semibold">Desktop — look</dt>
                <dd>Click and drag anywhere (or let the browser lock the pointer) to look up, down, left, and right.</dd>
              </div>
              <div>
                <dt className="font-semibold">Desktop — move</dt>
                <dd>W/A/S/D or arrow keys to move forward, back, and sideways.</dd>
              </div>
              <div>
                <dt className="font-semibold">Mobile</dt>
                <dd>Drag anywhere to look, use the joystick in the corner to move, tap glowing floor markers to jump through doorways.</dd>
              </div>
              <div>
                <dt className="font-semibold">Hotspots &amp; rooms</dt>
                <dd>Click a glowing doorway marker, a room on the map, or use the Rooms list to teleport instantly.</dd>
              </div>
              <div>
                <dt className="font-semibold">Exit</dt>
                <dd>Press Esc to release the pointer, or use the Exit 3D button to return to the page.</dd>
              </div>
            </dl>
            <button
              type="button"
              onClick={() => setHelpOpen(false)}
              className="mt-6 w-full rounded-full bg-bronze px-4 py-2 text-sm font-semibold text-ivory hover:opacity-90"
            >
              Got it
            </button>
          </div>
        </div>
      )}
    </>
  );
}
