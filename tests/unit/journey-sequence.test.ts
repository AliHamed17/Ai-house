import { describe, expect, it } from 'vitest';
import { JOURNEY_ORDER, JOURNEY_ROOM_COUNT, journeyRooms, sampleJourney } from '@/lib/journey/sequence';
import { houseModel } from '@/data/house';
import { interiorRendersByVariant, interiorVariantIds } from '@/data/interiors';

describe('journey order', () => {
  it('visits every room in the house exactly once', () => {
    const ids = houseModel.rooms.map((r) => r.id).sort();
    expect([...JOURNEY_ORDER].sort()).toEqual(ids);
    expect(new Set(JOURNEY_ORDER).size).toBe(JOURNEY_ORDER.length);
  });

  it('resolves every step to a real room', () => {
    expect(() => journeyRooms()).not.toThrow();
    expect(journeyRooms()).toHaveLength(JOURNEY_ROOM_COUNT);
  });

  it('has a render for every step in every design variant', () => {
    const missing: string[] = [];
    for (const variant of interiorVariantIds) {
      for (const roomId of JOURNEY_ORDER) {
        if (!interiorRendersByVariant[variant][roomId]) missing.push(`${variant}/${roomId}`);
      }
    }
    expect(missing).toEqual([]);
  });
});

describe('sampleJourney', () => {
  it('starts on the first room and ends on the last', () => {
    expect(sampleJourney(0).activeRoomId).toBe(JOURNEY_ORDER[0]);
    expect(sampleJourney(1).activeRoomId).toBe(JOURNEY_ORDER[JOURNEY_ROOM_COUNT - 1]);
  });

  it('clamps out-of-range scroll instead of running off the end', () => {
    expect(sampleJourney(-5).activeIndex).toBe(0);
    expect(sampleJourney(9).activeIndex).toBe(JOURNEY_ROOM_COUNT - 1);
    for (const p of [-5, -0.2, 0, 0.5, 1, 4]) {
      const s = sampleJourney(p);
      expect(s.position).toBeGreaterThanOrEqual(0);
      expect(s.position).toBeLessThanOrEqual(JOURNEY_ROOM_COUNT - 1);
    }
  });

  it('always keeps at least one layer visible', () => {
    for (let i = 0; i <= 100; i += 1) {
      const s = sampleJourney(i / 100);
      expect(s.layers.length, `p=${i / 100}`).toBeGreaterThan(0);
      expect(Math.max(...s.layers.map((l) => l.opacity)), `p=${i / 100}`).toBeGreaterThan(0.4);
    }
  });

  it('never stacks more than three layers at once', () => {
    for (let i = 0; i <= 200; i += 1) {
      expect(sampleJourney(i / 200).layers.length).toBeLessThanOrEqual(3);
    }
  });

  it('is a pure function of progress', () => {
    for (const p of [0, 0.13, 0.5, 0.77, 1]) {
      expect(sampleJourney(p)).toEqual(sampleJourney(p));
    }
  });

  it('advances monotonically through the rooms', () => {
    let last = -1;
    for (let i = 0; i <= 100; i += 1) {
      const { position } = sampleJourney(i / 100);
      expect(position).toBeGreaterThanOrEqual(last);
      last = position;
    }
  });

  it('lands each room exactly on its own scroll stop', () => {
    for (let i = 0; i < JOURNEY_ROOM_COUNT; i += 1) {
      const p = i / (JOURNEY_ROOM_COUNT - 1);
      const s = sampleJourney(p);
      expect(s.activeIndex, `stop ${i}`).toBe(i);
      const top = s.layers.find((l) => l.index === i)!;
      expect(top.opacity, `stop ${i}`).toBeCloseTo(1, 5);
    }
  });

  it('sorts layers so the most opaque paints last', () => {
    const s = sampleJourney(0.42);
    const opacities = s.layers.map((l) => l.opacity);
    expect([...opacities].sort((a, b) => a - b)).toEqual(opacities);
  });
});
