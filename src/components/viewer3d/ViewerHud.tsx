'use client';

import { useState } from 'react';
import { useViewerStore, type ViewMode } from '@/lib/store/viewerStore';
import { useShortlistStore } from '@/lib/store/shortlistStore';
import { materialVariants } from '@/data/materials';
import { ENTRY_ROOM_ID } from '@/data/house';
import { buildViewerLinkUrl } from '@/lib/viewerLink';
import { copyTextToClipboard } from '@/lib/clipboard';

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
  const requestOrbitReset = useViewerStore((s) => s.requestOrbitReset);
  const isPointerLocked = useViewerStore((s) => s.isPointerLocked);
  const transformationStage = useViewerStore((s) => s.transformationStage);
  const setTransformationStage = useViewerStore((s) => s.setTransformationStage);
  const activeRoomId = useViewerStore((s) => s.activeRoomId);
  const shortlistOpen = useViewerStore((s) => s.shortlistOpen);
  const setShortlistOpen = useViewerStore((s) => s.setShortlistOpen);
  const shortlistCount = useShortlistStore((s) => s.ids.length);
  const [variantMenuOpen, setVariantMenuOpen] = useState(false);
  // The share popover records WHICH view its link describes, so it stops
  // showing the moment the visitor changes any of them — a link left on
  // screen after they switched to Dollhouse would otherwise still say Walk,
  // and they would send that. Deriving it beats clearing it from an effect:
  // there is no render where the popover and the view disagree.
  const [share, setShare] = useState<{ key: string; url: string; copied: boolean } | null>(null);

  // Reset means different things per mode: in dollhouse it restores the
  // elevated overview; otherwise it returns the walker to the entry room and
  // switches to Walk. (A first-person teleport in dollhouse would drop the
  // camera to eye height inside the building and collapse the overview; from
  // Floor Plan, the teleport alone would move the camera underneath the
  // floor-plan overlay without ever showing the visitor they've been reset.)
  const handleResetView = () => {
    if (mode === 'orbit') requestOrbitReset();
    else {
      requestTeleport(ENTRY_ROOM_ID);
      setMode('first-person');
    }
  };

  // The link describes the view, not the camera: the room the visitor is in,
  // how they're looking at it, and how it's lit and finished. Reproducing an
  // exact pose would make every link a different walk-in point from the one
  // the room was designed to be entered at, and would go stale the moment a
  // spawn moves. The URL is always shown, not just copied, because a refused
  // clipboard write must not leave a visitor with nothing to send.
  const linkState = {
    roomId: activeRoomId,
    mode,
    lightingMode,
    materialVariantId,
    transformationStage,
  };
  // '|' appears in none of these ids, so two different views cannot collide.
  const viewKey = [activeRoomId, mode, lightingMode, materialVariantId, transformationStage ?? ''].join('|');
  const shownShare = share !== null && share.key === viewKey ? share : null;

  const handleShareView = async () => {
    const url = buildViewerLinkUrl(window.location.href, linkState);
    setShare({ key: viewKey, url, copied: await copyTextToClipboard(url) });
  };

  return (
    <>
      {/* Entering from the transformation film drops the visitor into a
          part-built kitchen on purpose. Without a visible way back to the
          finished room that reads as missing furniture rather than a chosen
          moment, so the state is always announced and always reversible. */}
      {transformationStage && (
        <div className="pointer-events-none absolute inset-x-0 top-20 z-30 flex justify-center px-4">
          <div className="pointer-events-auto flex items-center gap-3 rounded-full border border-bronze/50 bg-ivory/95 px-4 py-2 text-xs shadow-lg backdrop-blur-sm">
            <span className="text-charcoal/75">
              Showing the kitchen mid-build — stage &ldquo;{transformationStage}&rdquo;
            </span>
            <button
              type="button"
              onClick={() => setTransformationStage(null)}
              className="rounded-full bg-bronze px-3 py-1 font-medium text-ivory hover:bg-charcoal"
            >
              Show finished kitchen
            </button>
          </div>
        </div>
      )}
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
            onClick={handleResetView}
            className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
          >
            ⟲ Reset View
          </button>
        </div>

        <div className="pointer-events-auto flex flex-wrap items-center gap-2">
          {/* While a transformation stage is showing, the room is lit by that
              moment's own authored rig (see StageLighting), so this toggle
              cannot take effect. Disabled and explained rather than left live
              and silently overridden — and rather than clearing the stage on
              click, which would throw away the mid-build view the visitor
              deliberately entered. "Show finished kitchen" is the way out. */}
          <div
            className="flex overflow-hidden rounded-full border border-limestone/60 bg-ivory/90 shadow-lg backdrop-blur-sm"
            title={
              transformationStage
                ? 'Lighting follows the transformation moment you entered. Choose "Show finished kitchen" to control it yourself.'
                : undefined
            }
          >
            <button
              type="button"
              onClick={() => setLightingMode('day')}
              aria-pressed={lightingMode === 'day'}
              disabled={transformationStage !== null}
              className={`px-3 py-2 text-xs font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-45 ${lightingMode === 'day' ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'}`}
            >
              ☀ Day
            </button>
            <button
              type="button"
              onClick={() => setLightingMode('evening')}
              aria-pressed={lightingMode === 'evening'}
              disabled={transformationStage !== null}
              className={`px-3 py-2 text-xs font-semibold tracking-wide disabled:cursor-not-allowed disabled:opacity-45 ${lightingMode === 'evening' ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'}`}
            >
              ☾ Evening
            </button>
          </div>

          {/* Same reasoning as the lighting toggle: while a stage is showing,
              the room is rendered with the film's own variant so the moment
              really is the moment, and a variant change here could not take
              effect. Disabled and explained rather than silently ignored. */}
          <div className="relative">
            <button
              type="button"
              onClick={() => setVariantMenuOpen((v) => !v)}
              disabled={transformationStage !== null}
              title={
                transformationStage
                  ? 'Materials follow the transformation moment you entered. Choose "Show finished kitchen" to change them.'
                  : undefined
              }
              className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory disabled:cursor-not-allowed disabled:opacity-45 disabled:hover:bg-ivory/90"
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

          <div className="relative">
            <button
              type="button"
              onClick={() => {
                if (shownShare) setShare(null);
                else void handleShareView();
              }}
              aria-expanded={shownShare !== null}
              className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
            >
              Share view
            </button>
            {shownShare && (
              <div className="absolute right-0 mt-2 w-72 rounded-2xl border border-limestone/60 bg-ivory/95 p-3 shadow-xl backdrop-blur-sm">
                <p className="text-[11px] text-charcoal/75">
                  {shownShare.copied
                    ? 'Link copied — it reopens this room, mode, lighting, and materials.'
                    : "Your browser wouldn't let the page reach the clipboard — copy this link:"}
                </p>
                <input
                  readOnly
                  aria-label="Link to this view"
                  value={shownShare.url}
                  onFocus={(e) => e.currentTarget.select()}
                  className="mt-2 w-full rounded-lg border border-limestone/70 bg-ivory px-2 py-1 font-mono text-[11px] text-charcoal"
                />
              </div>
            )}
          </div>
          <button
            type="button"
            onClick={() => setShortlistOpen(!shortlistOpen)}
            aria-pressed={shortlistOpen}
            className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
          >
            ♥ Saved{shortlistCount > 0 ? ` (${shortlistCount})` : ''}
          </button>
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
                <dt className="font-semibold">Saving pieces</dt>
                <dd>
                  Click a piece of furniture and choose Save to add it to your list. ♥ Saved shows the list with every
                  retailer link, ready to copy. It stays on this device.
                </dd>
              </div>
              <div>
                <dt className="font-semibold">Sharing a view</dt>
                <dd>Share view copies a link that reopens this exact room, mode, lighting, and materials.</dd>
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
