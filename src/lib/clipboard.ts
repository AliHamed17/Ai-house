/**
 * A single honest answer to "did the copy work?".
 *
 * navigator.clipboard is absent on insecure origins and older browsers, and
 * present-but-rejecting when the page lacks permission or the click has lost
 * its user-gesture context. Callers need to know which happened so they can
 * offer the text for manual copying instead of claiming a copy that never
 * occurred, so this resolves to a boolean rather than throwing or swallowing.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator === 'undefined' || !navigator.clipboard?.writeText) return false;
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
