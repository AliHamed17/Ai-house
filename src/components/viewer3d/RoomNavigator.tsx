'use client';

import { useState } from 'react';
import { houseModel } from '@/data/house';
import { useViewerStore } from '@/lib/store/viewerStore';

export function RoomNavigator() {
  const [open, setOpen] = useState(false);
  const activeRoomId = useViewerStore((s) => s.activeRoomId);
  const requestTeleport = useViewerStore((s) => s.requestTeleport);
  const setMode = useViewerStore((s) => s.setMode);

  return (
    <div className="pointer-events-auto absolute left-4 top-20 z-20">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        aria-controls="room-navigator-panel"
        className="rounded-full border border-limestone/60 bg-ivory/90 px-4 py-2 text-xs font-semibold tracking-wide text-charcoal shadow-lg backdrop-blur-sm hover:bg-ivory"
      >
        Rooms {open ? '▴' : '▾'}
      </button>
      {open && (
        <div
          id="room-navigator-panel"
          className="mt-2 max-h-[60vh] w-64 overflow-y-auto rounded-2xl border border-limestone/60 bg-ivory/95 p-2 shadow-xl backdrop-blur-sm"
        >
          <ul className="flex flex-col gap-1">
            {houseModel.rooms.map((room) => {
              const isActive = room.id === activeRoomId;
              return (
                <li key={room.id}>
                  <button
                    type="button"
                    onClick={() => {
                      // The teleport itself is only ever consumed by the
                      // always-mounted first-person camera, so jumping from
                      // Dollhouse or Floor Plan must also switch to Walk mode —
                      // otherwise the camera moves underneath a still-selected
                      // Dollhouse/Floor-Plan view instead of showing the room.
                      requestTeleport(room.id);
                      setMode('first-person');
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left text-sm transition-colors ${
                      isActive ? 'bg-bronze text-ivory' : 'text-charcoal hover:bg-limestone/50'
                    }`}
                  >
                    <span>{room.hotspotLabel}</span>
                    <span className="flex items-center gap-1 text-[10px] uppercase tracking-wide opacity-70">
                      {room.isProtected && <span title="MAMAD protected room">🛡</span>}
                      {room.isWetRoom && <span title="Wet room">💧</span>}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}
