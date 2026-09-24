'use client';

import { useState } from 'react';
import { useViewerStore } from '@/lib/store/viewerStore';
import { useShortlistStore } from '@/lib/store/shortlistStore';
import { formatShortlistAsText, groupShortlistByRoom } from '@/lib/shortlist';
import { copyTextToClipboard } from '@/lib/clipboard';

/**
 * The saved-pieces panel: everything shortlisted while walking the house,
 * grouped by the room it stands in, each row still carrying the real retailer
 * link so the list is directly actionable.
 *
 * The export deliberately does two things at once. Clicking "Copy list"
 * attempts the clipboard AND reveals the plain text underneath, whatever the
 * clipboard said — so a visitor on an insecure origin, or in a browser that
 * refuses the write, still leaves with their list instead of a button that
 * claimed success and did nothing.
 */
export function ShortlistPanel() {
  const open = useViewerStore((s) => s.shortlistOpen);
  const setOpen = useViewerStore((s) => s.setShortlistOpen);
  const ids = useShortlistStore((s) => s.ids);
  const remove = useShortlistStore((s) => s.remove);
  const clear = useShortlistStore((s) => s.clear);
  // The revealed export records WHICH list it was asked for, so it can simply
  // stop matching — and stop showing — the moment the list changes underneath
  // it. Deriving that beats clearing it from an effect: a visitor can never
  // be shown, or copy, a block that disagrees with the rows above it, and
  // there is no render where the two are briefly out of step.
  const [exported, setExported] = useState<{ key: string; copied: boolean } | null>(null);

  if (!open) return null;

  const groups = groupShortlistByRoom(ids);
  const exportText = formatShortlistAsText(ids);
  // \u0000 can't occur in a furniture id, so this can't collide across lists.
  const listKey = ids.join('\u0000');
  const showExport = exported !== null && exported.key === listKey;

  const handleCopy = async () => {
    const copied = await copyTextToClipboard(exportText);
    setExported({ key: listKey, copied });
  };

  return (
    // A named region, not a bare div: the panel floats over a landing page
    // that is still in the document behind the explorer and shares much of
    // its vocabulary (a room story can mention the very sofa listed here), so
    // "the saved list" has to be addressable as one thing — by a screen
    // reader moving between landmarks, and by a test asserting what the list
    // contains rather than what the page happens to say somewhere.
    <section
      aria-labelledby="shortlist-panel-title"
      className="pointer-events-auto absolute right-4 top-20 z-30 flex max-h-[70vh] w-80 max-w-[calc(100vw-2rem)] flex-col rounded-2xl border border-limestone/60 bg-ivory/95 shadow-2xl backdrop-blur-sm"
    >
      <div className="flex items-start justify-between gap-2 border-b border-limestone/60 px-4 py-3">
        <div>
          <h2 id="shortlist-panel-title" className="font-display text-base text-charcoal">
            Saved pieces
          </h2>
          <p className="text-xs text-charcoal/70">
            {ids.length === 0 ? 'Nothing saved yet' : `${ids.length} ${ids.length === 1 ? 'piece' : 'pieces'}`}
          </p>
        </div>
        <button
          type="button"
          onClick={() => setOpen(false)}
          aria-label="Close saved pieces"
          className="rounded-full px-2 text-lg leading-none text-charcoal/50 hover:text-charcoal"
        >
          ×
        </button>
      </div>

      <div className="flex-1 overflow-y-auto px-4 py-3">
        {groups.length === 0 ? (
          <p className="text-xs leading-relaxed text-charcoal/70">
            Click any piece of furniture in the house, then choose <span className="font-semibold">Save</span> to add it
            here. Your list stays on this device.
          </p>
        ) : (
          <ul className="space-y-4">
            {groups.map((group) => (
              <li key={group.roomId}>
                <p className="text-[11px] font-semibold uppercase tracking-wider text-charcoal/55">{group.roomName}</p>
                <ul className="mt-1 space-y-2">
                  {group.items.map((item) => (
                    <li key={item.id} className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-charcoal">{item.shopLabel}</p>
                        <a
                          href={item.productUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-xs text-bronze underline underline-offset-2 hover:text-charcoal"
                        >
                          {item.retailer}
                        </a>
                      </div>
                      <button
                        type="button"
                        onClick={() => remove(item.id)}
                        aria-label={`Remove ${item.shopLabel} from saved pieces`}
                        className="shrink-0 rounded-full border border-limestone/70 px-2 py-0.5 text-[11px] text-charcoal/70 hover:bg-limestone/40 hover:text-charcoal"
                      >
                        Remove
                      </button>
                    </li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        )}
      </div>

      {groups.length > 0 && (
        <div className="border-t border-limestone/60 px-4 py-3">
          <div className="flex gap-2">
            <button
              type="button"
              onClick={handleCopy}
              className="flex-1 rounded-full bg-bronze px-3 py-1.5 text-xs font-semibold text-ivory hover:bg-charcoal"
            >
              Copy list
            </button>
            <button
              type="button"
              onClick={clear}
              className="rounded-full border border-limestone/70 px-3 py-1.5 text-xs font-semibold text-charcoal/80 hover:bg-limestone/40 hover:text-charcoal"
            >
              Clear
            </button>
          </div>
          {showExport && (
            <div className="mt-2">
              <p className="text-[11px] text-charcoal/70">
                {exported.copied
                  ? 'Copied to your clipboard. It is also below, in case you want it again.'
                  : "Your browser wouldn't let the page reach the clipboard — select the list below and copy it."}
              </p>
              <textarea
                readOnly
                aria-label="Saved pieces as plain text"
                value={exportText}
                rows={6}
                className="mt-1 w-full resize-y rounded-lg border border-limestone/70 bg-ivory p-2 font-mono text-[11px] leading-relaxed text-charcoal"
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
