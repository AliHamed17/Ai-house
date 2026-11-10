'use client';

import { AIStudioPanel } from '@/components/ai-studio/AIStudioPanel';

export function AIStudioSection() {
  return (
    <section id="ai-studio" className="bg-limestone/15 py-20">
      <div className="mx-auto max-w-4xl px-6">
        <p className="text-xs font-semibold uppercase tracking-[0.3em] text-olive">AI design studio</p>
        <h2 className="font-display mt-3 text-3xl text-charcoal">Generate and refine concepts, on demand</h2>
        <p className="mt-4 max-w-2xl text-charcoal/70">
          Nano Banana (Gemini image generation) preserves the exact camera, walls, and openings of the reference frame
          while completing the room as a photorealistic warm-modern-luxury interior. Higgsfield animates one approved
          still into a short, stabilized cinematic clip. Both run in a fully functional demo mode when no API
          credentials are configured — nothing here can crash from a missing key.
        </p>
        <div className="mt-8">
          <AIStudioPanel />
        </div>
      </div>
    </section>
  );
}
