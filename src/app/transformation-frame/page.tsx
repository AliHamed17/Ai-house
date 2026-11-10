import { TransformationFrameClient } from './TransformationFrameClient';

/**
 * Headless stage-render route, used by scripts/render-stage-stills.mjs to
 * capture one pixel-stable still per transformation stage from the real 3D
 * house.
 *
 * It renders nothing but the locked-camera scene — no HUD, no chrome, no
 * page padding — so a Playwright screenshot of the viewport IS the frame.
 * Keeping it in the app (rather than in an undocumented external tool) is
 * what makes the whole video reproducible with one command.
 */
export const metadata = {
  title: 'Transformation stage frame',
  // A utility route, not content: keep it out of search results.
  robots: { index: false, follow: false },
};

export default async function TransformationFramePage({
  searchParams,
}: {
  searchParams: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const params = await searchParams;
  const raw = params.stage;
  const stage = Array.isArray(raw) ? raw[0] : raw;
  return <TransformationFrameClient stage={stage ?? null} />;
}
