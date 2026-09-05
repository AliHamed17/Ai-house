export function TechnicalNote() {
  return (
    <section className="mx-auto max-w-4xl px-6 py-16">
      <div className="rounded-3xl border border-olive/30 bg-olive/5 p-6">
        <h2 className="font-display text-xl text-charcoal">A concept visualization, not construction documentation</h2>
        <p className="mt-3 text-sm text-charcoal/75">
          This experience is built from one photographed floor plan and one handheld walkthrough video. It is suitable
          for design exploration and stakeholder communication, not for permitting, tendering, or construction. A
          licensed architect or engineer must verify every dimension, structural element, and code requirement — most
          urgently ceiling height, the overall building envelope, and the exact en-suite/bathroom door relationships —
          against the original CAD/PDF plan and an on-site survey before any of this informs real construction.
        </p>
        <p className="mt-3 text-sm text-charcoal/75">
          The room marked MAMAD is an Israeli protected room. Its door, window, ventilation, and required clearances
          are fixed in this model and must never be altered, concealed, or obstructed by any design variant shown
          here; any real modification requires compliance with the approved plan and applicable regulations.
        </p>
      </div>
    </section>
  );
}
