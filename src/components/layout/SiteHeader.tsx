'use client';

const NAV_LINKS = [
  { href: '#evidence', label: 'Evidence' },
  { href: '#floor-plan', label: 'Floor Plan' },
  { href: '#rooms', label: 'Rooms' },
  { href: '#materials', label: 'Materials' },
  { href: '#comparisons', label: 'Before / Concept' },
  { href: '#ai-studio', label: 'AI Studio' },
];

export function SiteHeader({ onEnter3D }: { onEnter3D: () => void }) {
  return (
    <header className="sticky top-0 z-30 border-b border-limestone/50 bg-ivory/85 backdrop-blur-md">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-6 py-4">
        <span className="font-display text-lg text-charcoal">Ali&rsquo;s House</span>
        <nav className="hidden items-center gap-6 text-sm text-charcoal/70 lg:flex">
          {NAV_LINKS.map((link) => (
            <a key={link.href} href={link.href} className="hover:text-charcoal">
              {link.label}
            </a>
          ))}
        </nav>
        <button
          type="button"
          onClick={onEnter3D}
          className="rounded-full bg-bronze px-5 py-2 text-sm font-semibold text-ivory shadow hover:opacity-90"
        >
          Enter 3D
        </button>
      </div>
    </header>
  );
}
