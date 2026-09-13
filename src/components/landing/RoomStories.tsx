'use client';

import Image from 'next/image';
import { houseModel } from '@/data/house';
import { roomEvidenceFrame } from '@/data/evidenceFrames';
import { interiorRenders } from '@/data/interiors';
import { roomPromptById } from '@/data/roomPrompts';
import type { RoomId } from '@/lib/types';

export function RoomStories({ onEnterRoom }: { onEnterRoom: (roomId: RoomId) => void }) {
  return (
    <section id="rooms" className="mx-auto max-w-6xl px-6 py-20">
      <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">Room stories</p>
      <h2 className="font-display mt-3 text-3xl text-charcoal">A design intent for every room</h2>
      <p className="mt-4 max-w-2xl text-charcoal/70">
        Each room keeps the plan&rsquo;s walls, doors, windows, and wet-room positions. The design language layered on
        top is consistent warm-modern-luxury: limestone-look porcelain in the social zone, matte oak in the bedrooms,
        one bronze metal family throughout.
      </p>

      <div className="mt-10 grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {houseModel.rooms.map((room) => {
          const render = interiorRenders[room.id];
          const frame = roomEvidenceFrame[room.id];
          const prompt = roomPromptById.get(room.id);
          return (
            <article key={room.id} className="flex flex-col overflow-hidden rounded-3xl border border-limestone/60 bg-ivory shadow-sm">
              <div className="relative h-56 w-full">
                <Image
                  src={render?.path ?? frame.path}
                  alt={render ? `Warm-modern-luxury concept for ${room.hotspotLabel}` : `Unfinished ${room.hotspotLabel}`}
                  fill
                  sizes="(max-width: 640px) 100vw, 33vw"
                  className="object-cover"
                />
                {room.isProtected && (
                  <span className="absolute left-3 top-3 rounded-full bg-charcoal/80 px-3 py-1 text-[10px] font-semibold uppercase tracking-wide text-ivory">
                    🛡 MAMAD protected
                  </span>
                )}
              </div>
              <div className="flex flex-1 flex-col p-5">
                <h3 className="font-display text-lg text-charcoal">{room.hotspotLabel}</h3>
                <p className="mt-1 text-xs uppercase tracking-wide text-charcoal/50">
                  {room.dimensions.widthM.toFixed(2)} × {room.dimensions.depthM.toFixed(2)} m · {room.confidence.replace('-', ' ')}
                </p>
                <p className="mt-3 flex-1 text-sm text-charcoal/75">{prompt?.furniturePlan ?? room.function}</p>
                <button
                  type="button"
                  onClick={() => onEnterRoom(room.id)}
                  className="mt-4 self-start rounded-full border border-bronze px-4 py-2 text-xs font-semibold text-bronze hover:bg-bronze hover:text-ivory"
                >
                  Walk in →
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
