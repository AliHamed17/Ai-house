import 'server-only';
import { readFile } from 'node:fs/promises';
import path from 'node:path';

const MIME_BY_EXT: Record<string, string> = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
};

/** Reads a file under /public by its site-relative path (e.g. "/evidence/frames/x.jpg"). */
export async function readPublicFileAsBase64(publicPath: string): Promise<{ base64: string; mimeType: string } | null> {
  const ext = path.extname(publicPath).toLowerCase();
  const mimeType = MIME_BY_EXT[ext];
  if (!mimeType) return null;
  try {
    const safeRelative = publicPath.replace(/^\/+/, '');
    if (safeRelative.includes('..')) return null;
    const absolute = path.join(process.cwd(), 'public', safeRelative);
    const buffer = await readFile(absolute);
    return { base64: buffer.toString('base64'), mimeType };
  } catch {
    return null;
  }
}

export function toAbsoluteUrl(originUrl: string | undefined, publicPath: string): string {
  const base = originUrl?.replace(/\/$/, '') ?? '';
  return `${base}${publicPath}`;
}
