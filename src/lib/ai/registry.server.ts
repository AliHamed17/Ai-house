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

/** Hard off-switch for billed providers: credentials merely existing in the
 * environment is otherwise enough to make a run live and spend money. */
export function isDemoForced(): boolean {
  return process.env.AI_FORCE_DEMO === '1' || process.env.AI_FORCE_DEMO === 'true';
}

export function isProviderConfigured(id: GenerationProviderId): boolean {
  if (isDemoForced()) return false;
  if (id === 'nano-banana') return isNanoBananaConfigured();
  if (id === 'higgsfield') return isHiggsfieldConfigured();
  return true;
}

/** Picks the requested provider for a new submission, transparently falling back to the deterministic mock when credentials are absent. */
export function resolveProviderForSubmit(requested: GenerationProviderId): { provider: MediaGenerationProvider; demoMode: boolean } {
  if (requested !== 'mock' && isProviderConfigured(requested)) {
    return { provider: providersById[requested], demoMode: false };
  }
  return { provider: mockProvider, demoMode: true };
}

/** Status checks dispatch purely by the provider encoded in the job id, so a job always resolves with whichever provider actually created it. */
export function resolveProviderById(id: GenerationProviderId): MediaGenerationProvider {
  return providersById[id] ?? mockProvider;
}
