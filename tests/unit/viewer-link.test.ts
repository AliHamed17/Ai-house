import { describe, expect, it } from 'vitest';
import { buildViewerLinkUrl, encodeViewerLink, parseViewerLink, type ViewerLinkState } from '@/lib/viewerLink';
import { materialVariants } from '@/data/materials';
import { roomById } from '@/data/house';
import { TRANSFORMATION_STAGE_IDS } from '@/lib/transformation';

const BASE: ViewerLinkState = {
  roomId: 'kitchen',
  mode: 'orbit',
  lightingMode: 'evening',
  materialVariantId: materialVariants[1].id,
  transformationStage: null,
};

describe('viewer link', () => {
  it('round-trips every field', () => {
    expect(parseViewerLink(encodeViewerLink(BASE))).toEqual(BASE);
  });

  it('round-trips a transformation stage', () => {
    const withStage: ViewerLinkState = { ...BASE, transformationStage: TRANSFORMATION_STAGE_IDS[2] };
    expect(parseViewerLink(encodeViewerLink(withStage))).toEqual(withStage);
  });

  it('omits the stage entirely when there is none', () => {
    expect(encodeViewerLink(BASE)).not.toContain('stage');
  });

  it('round-trips every room in the house', () => {
    for (const roomId of roomById.keys()) {
      const state = { ...BASE, roomId };
      expect(parseViewerLink(encodeViewerLink(state))?.roomId).toBe(roomId);
    }
  });

  it('accepts a leading question mark', () => {
    expect(parseViewerLink(`?${encodeViewerLink(BASE)}`)).toEqual(BASE);
  });

  it('rejects a link that names no room', () => {
    expect(parseViewerLink('mode=orbit&light=evening')).toBeNull();
    expect(parseViewerLink('')).toBeNull();
  });

  it('rejects a link naming a room that does not exist', () => {
    expect(parseViewerLink('room=ballroom')).toBeNull();
    expect(parseViewerLink('room=')).toBeNull();
  });

  it('ignores unrelated query parameters', () => {
    expect(parseViewerLink('utm_source=mail&room=living&ref=x')?.roomId).toBe('living');
  });

  // The asymmetry the module documents: a room it cannot resolve kills the
  // link, but a mangled sub-field must not throw away the room the sender
  // was actually showing.
  it('falls back to defaults for unrecognised values, keeping the room', () => {
    const parsed = parseViewerLink('room=living&mode=teleport&light=strobe&look=neon&stage=demolition');
    expect(parsed).toEqual({
      roomId: 'living',
      mode: 'first-person',
      lightingMode: 'day',
      materialVariantId: materialVariants[0].id,
      transformationStage: null,
    });
  });

  it('fills defaults for fields that are simply absent', () => {
    expect(parseViewerLink('room=mamad')).toEqual({
      roomId: 'mamad',
      mode: 'first-person',
      lightingMode: 'day',
      materialVariantId: materialVariants[0].id,
      transformationStage: null,
    });
  });

  it('replaces an existing query string rather than appending to it', () => {
    const url = buildViewerLinkUrl('https://example.com/?room=living&mode=orbit#deep', BASE);
    expect(url).toBe(`https://example.com/?${encodeViewerLink(BASE)}`);
    // One room, not two: sharing twice from the same tab must not produce a
    // link whose meaning depends on which duplicate a parser reads first.
    expect(url.match(/room=/g)).toHaveLength(1);
    expect(url).not.toContain('#');
  });

  it('keeps the path it was given', () => {
    expect(buildViewerLinkUrl('https://example.com/preview/index', BASE)).toContain('/preview/index?');
  });
});
