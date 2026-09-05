import { describe, expect, it } from 'vitest';
import { isPlayableVideo } from '@/lib/media';

describe('isPlayableVideo', () => {
  it.each([
    'https://cdn.higgsfield.ai/out/clip.mp4',
    'https://cdn.higgsfield.ai/out/clip.webm',
    'https://cdn.higgsfield.ai/out/clip.MOV',
    'https://cdn.higgsfield.ai/out/clip.mp4?sig=abc123',
    'https://cdn.higgsfield.ai/out/clip.mp4#t=2',
    'data:video/mp4;base64,AAAA',
  ])('treats %s as playable video', (url) => {
    expect(isPlayableVideo(url)).toBe(true);
  });

  it.each([
    '/generated/concepts/living.svg',
    'https://example.com/render.png',
    'data:image/png;base64,AAAA',
    'https://example.com/mp4',
    'https://example.com/notes-about-mp4.txt',
    '',
  ])('treats %s as not playable video', (url) => {
    expect(isPlayableVideo(url)).toBe(false);
  });

  it('does not misread a query string as an extension', () => {
    expect(isPlayableVideo('https://example.com/image.png?format=mp4')).toBe(false);
  });
});
