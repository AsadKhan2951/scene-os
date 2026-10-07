import { describe, expect, it } from 'vitest';
import { extractJsonObject, sceneDurationRange, shotTiming, teaserTiming } from './teaser';

describe('teaserTiming', () => {
  it('fits 30 seconds into five shots plus the end card', () => {
    const t = teaserTiming(30);
    expect(t.shots).toBe(5);
    expect(t.shots * t.shotSeconds + 3).toBeCloseTo(30, 1);
    expect(t.clipSeconds).toBe(6);
  });
  it('fits 50 seconds', () => {
    const t = teaserTiming(50);
    expect(t.shots).toBe(9);
    expect(t.shots * t.shotSeconds + 3).toBeCloseTo(50, 1);
  });
  it('keeps clips inside what the video model accepts', () => {
    for (const d of [15, 20, 37, 45, 60]) {
      const t = teaserTiming(d);
      expect(t.clipSeconds).toBeGreaterThanOrEqual(3);
      expect(t.clipSeconds).toBeLessThanOrEqual(15);
      expect(t.clipSeconds).toBeGreaterThanOrEqual(t.shotSeconds);
    }
  });
});

describe('extractJsonObject', () => {
  it('reads a fenced object', () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });
});

describe('scene timing', () => {
  it('gives six frames five seconds each by default', () => {
    expect(sceneDurationRange(6)).toEqual({ min: 18, max: 90, suggested: 33 });
    expect(shotTiming(33, 6)).toEqual({ shotSeconds: 5, clipSeconds: 5 });
  });
  it('keeps clips inside what the video model accepts', () => {
    for (const frames of [1, 3, 6, 12]) {
      const r = sceneDurationRange(frames);
      for (const d of [r.min, r.suggested, r.max]) {
        const t = shotTiming(d, frames);
        expect(t.clipSeconds).toBeGreaterThanOrEqual(3);
        expect(t.clipSeconds).toBeLessThanOrEqual(15);
        expect(t.shotSeconds).toBeLessThanOrEqual(15);
      }
    }
  });
});
