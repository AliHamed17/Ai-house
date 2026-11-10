import 'server-only';
import type { GenerationProviderId, MediaGenerationProvider } from '@/lib/types';
import { mockProvider } from './mockProvider.server';
import { nanoBananaProvider, isNanoBananaConfigured } from './nanoBanana.server';
import { higgsfieldProvider, isHiggsfieldConfigured } from './higgsfield.server';

const providersById: Record<GenerationProviderId, MediaGenerationProvider> = {
  mock: mockProvider,
  'nano-banana': nanoBananaProvider,
  higgsfield: higgsfieldProvider,
};

export function isProviderConfigured(id: GenerationProviderId): boolean {
  if (id === 'nano-banana') return isNanoBananaConfigured();
  if (id === 'higgsfield') return isHiggsfieldConfigured();
  return true;
}

/**
 * A second, explicit switch that must be on for ANY billed generation to run.
 * The client-side "Yes, generate (may incur cost)" confirmation only protects
 * the UI — the API routes are directly reachable, so a configured key alone
 * would let any unauthenticated caller spend credits. Requiring AI_ALLOW_LIVE
 * keeps a key set for the offline generator or local dev from accidentally
 * exposing a public billed endpoint. A public deployment that turns this on
 * MUST put real authentication / quotas in front of the generate routes.
 */
export function liveGenerationEnabled(): boolean {
  return process.env.AI_ALLOW_LIVE === 'true';
}

/** A provider is live (billed) only when it has credentials AND live generation is explicitly enabled. */
export function providerLiveActive(id: GenerationProviderId): boolean {
  return id !== 'mock' && isProviderConfigured(id) && liveGenerationEnabled();
}

/** Picks the requested provider for a new submission, transparently falling back to the deterministic mock unless the provider is live AND explicitly enabled. */
export function resolveProviderForSubmit(requested: GenerationProviderId): { provider: MediaGenerationProvider; demoMode: boolean } {
  if (providerLiveActive(requested)) {
    return { provider: providersById[requested], demoMode: false };
  }
  return { provider: mockProvider, demoMode: true };
}

/** Status checks dispatch purely by the provider encoded in the job id, so a job always resolves with whichever provider actually created it. */
export function resolveProviderById(id: GenerationProviderId): MediaGenerationProvider {
  return providersById[id] ?? mockProvider;
}

/**
 * The client only shows its "Yes, generate (may incur cost)" confirmation
 * when ITS OWN cached /api/generation/mode probe says the target provider is
 * live — but that cache can go stale (a rolling deploy, an env var flip)
 * between the probe and this exact submission, so a client that still
 * believes it's in free demo mode never shows that confirmation at all and
 * submits believing nothing will be billed. The client is directly
 * reachable regardless of what it renders, so this route must independently
 * re-verify: whenever ITS OWN authoritative demoMode resolution above says a
 * request is about to bill a real provider, the request must carry an
 * explicit confirmation the client only ever sets after that same
 * confirmation step actually ran (see handleGenerateClick in
 * AIStudioPanel) — never trust the client's belief about its own mode.
 */
export const LIVE_RUN_NOT_CONFIRMED_MESSAGE =
  'This request would start a live, billed generation, but no cost confirmation was received for it. Please try again.';
