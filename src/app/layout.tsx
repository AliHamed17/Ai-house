import type { Metadata, Viewport } from 'next';
import localFont from 'next/font/local';
import './globals.css';

/**
 * Self-hosted rather than pulled through `next/font/google`.
 *
 * `next/font/google` fetches the font CSS and binaries from Google at BUILD
 * time, which makes every build depend on a third-party service being
 * reachable and well-behaved from the builder. When that call fails,
 * Turbopack never emits its internal font module and the build dies with
 * dozens of `Can't resolve '@vercel/turbopack-next/internal/font/google/font'`
 * errors that name no file in this repo — which is exactly what took down
 * CI and the Vercel deploy while local builds kept passing.
 *
 * These are the same families and the same `latin` subset as before, as
 * variable woff2 files committed next to this module, so the build is now
 * hermetic. Both are SIL Open Font License 1.1; see fonts/OFL.txt.
 */
const fraunces = localFont({
  variable: '--font-fraunces',
  display: 'swap',
  src: [
    { path: './fonts/fraunces-latin-normal.woff2', weight: '400 600', style: 'normal' },
    { path: './fonts/fraunces-latin-italic.woff2', weight: '400 600', style: 'italic' },
  ],
});

const inter = localFont({
  variable: '--font-inter',
  display: 'swap',
  src: [{ path: './fonts/inter-latin.woff2', weight: '400 700', style: 'normal' }],
});

export const metadata: Metadata = {
  title: "Ali's House — Interactive Warm-Modern-Luxury 3D Concept",
  description:
    'A navigable 3D concept for an unfinished house: real-time first-person and dollhouse exploration, room-by-room warm-modern-luxury design concepts, and AI-assisted interior visualization.',
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: LayoutProps<'/'>) {
  return (
    <html lang="en" className={`${fraunces.variable} ${inter.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col bg-ivory text-charcoal">{children}</body>
    </html>
  );
}
