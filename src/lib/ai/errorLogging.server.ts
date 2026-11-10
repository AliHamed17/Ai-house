import 'server-only';

/**
 * A provider SDK error (Axios, the Google GenAI client, etc.) can carry the
 * full outgoing request on it — including any Authorization header this
 * app's own credential was installed into (see higgsfield.server's
 * getCredentials/config({ credentials })) — so logging the raw error object
 * directly can leak that credential straight into server/platform logs,
 * precisely during the provider failures an operator most needs to inspect.
 * Only ever log this short, deliberately narrow summary — an Error's own
 * name and message, never any of its other properties — for a caught
 * provider-call failure.
 */
export function safeErrorSummary(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return typeof error === 'string' ? error : 'Unknown error';
}
