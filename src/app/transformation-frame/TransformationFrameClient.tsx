'use client';

import dynamic from 'next/dynamic';
import { useEffect, useState } from 'react';
import { TRANSFORMATION_STAGES } from '@/data/kitchenTransformation';
import type { TransformationStageId } from '@/lib/types';

// WebGL has no server-side equivalent, so the canvas loads client-only —
// same pattern the landing page uses for the explorer.
const TransformationStageScene = dynamic(
  () => import('@/components/viewer3d/TransformationStageScene').then((m) => m.TransformationStageScene),
  { ssr: false },
);

function parseStage(raw: string | null): TransformationStageId {
  const match = TRANSFORMATION_STAGES.find((s) => s.id === raw);
  return match ? match.id : TRANSFORMATION_STAGES[0].id;
}

export function TransformationFrameClient({ stage }: { stage: string | null }) {
  const stageId = parseStage(stage);
  const [ready, setReady] = useState(false);

  // The capture script waits for data-render-ready before screenshotting, so
  // a frame is never grabbed mid-load with textures or geometry missing.
  // Two rAFs guarantee at least one committed painted frame first.
  useEffect(() => {
    let raf2 = 0;
    const raf1 = requestAnimationFrame(() => {
      raf2 = requestAnimationFrame(() => setReady(true));
    });
    return () => {
      cancelAnimationFrame(raf1);
      cancelAnimationFrame(raf2);
    };
  }, []);

  return (
    <main
      data-stage={stageId}
      data-render-ready={ready ? 'true' : 'false'}
      style={{ position: 'fixed', inset: 0, margin: 0, background: '#000' }}
    >
      <TransformationStageScene stageId={stageId} />
    </main>
  );
}
