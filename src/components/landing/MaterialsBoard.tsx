'use client';

import { PALETTE, baseMaterials, materialVariants } from '@/data/materials';

const PALETTE_LABELS: Record<keyof typeof PALETTE, string> = {
  ivory: 'Warm Ivory',
  limestone: 'Limestone',
  oak: 'Natural Oak',
  taupe: 'Taupe',
  bronze: 'Dark Bronze',
  charcoal: 'Charcoal Text',
  olive: 'Muted Olive',
};

export function MaterialsBoard() {
  return (
    <section id="materials" className="bg-limestone/15 py-20">
      <div className="mx-auto max-w-6xl px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">Materials</p>
        <h2 className="font-display mt-3 text-3xl text-charcoal">One coherent palette, house-wide</h2>
        <p className="mt-4 max-w-2xl text-charcoal/70">
          Stone, oak, textiles, and metal are held to one restrained family so the house reads as one calm, larger
          whole rather than a set of disconnected rooms. Lighting is layered and dimmable, 2700–3000K, CRI 90+.
        </p>

        <div className="mt-8 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-7">
          {(Object.keys(PALETTE) as Array<keyof typeof PALETTE>).map((key) => (
            <div key={key} className="overflow-hidden rounded-2xl border border-limestone/60 bg-ivory">
              <div className="h-20 w-full" style={{ backgroundColor: PALETTE[key] }} />
              <div className="p-3">
                <p className="text-xs font-semibold text-charcoal">{PALETTE_LABELS[key]}</p>
                <p className="text-[10px] uppercase tracking-wide text-charcoal/50">{PALETTE[key]}</p>
              </div>
            </div>
          ))}
        </div>

        <h3 className="mt-12 text-sm font-semibold uppercase tracking-wide text-charcoal/60">Surface materials</h3>
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {Object.values(baseMaterials).map((m) => (
            <div key={m.id} className="rounded-2xl border border-limestone/60 bg-ivory p-4">
              <div className="h-12 w-full rounded-xl" style={{ backgroundColor: m.colorHex }} />
              <p className="mt-2 text-xs font-semibold text-charcoal">{m.label}</p>
            </div>
          ))}
        </div>

        <h3 className="mt-12 text-sm font-semibold uppercase tracking-wide text-charcoal/60">Configurable material variants</h3>
        <p className="mt-2 max-w-2xl text-sm text-charcoal/70">
          Variants swap floor and wall colors only — never geometry, doors, or windows — so you can preview a material
          direction without changing the architecture (see it live in the 3D explorer&rsquo;s Materials menu).
        </p>
        <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-3">
          {materialVariants.map((v) => (
            <div key={v.id} className="rounded-2xl border border-limestone/60 bg-ivory p-4">
              <div className="flex gap-2">
                <span className="h-8 w-8 rounded-full border border-limestone/50" style={{ backgroundColor: v.accentHex }} />
                <span className="h-8 w-8 rounded-full border border-limestone/50" style={{ backgroundColor: v.metalHex }} />
              </div>
              <p className="mt-3 text-sm font-semibold text-charcoal">{v.label}</p>
              <p className="mt-1 text-xs text-charcoal/60">{v.description}</p>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
