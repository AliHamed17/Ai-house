// Demo mode fakes the cinematic with a pan over a still image, so callers must
// branch on the actual result URL rather than on a job's outputType.
export function isPlayableVideo(url: string): boolean {
  if (!url) return false;
  if (url.startsWith('data:')) return url.startsWith('data:video/');
  const path = url.split('?')[0].split('#')[0].toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogv)$/.test(path);
}
