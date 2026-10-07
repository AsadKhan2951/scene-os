import { describe, expect, it } from 'vitest';
import { extractJsonObject, teaserTiming } from './teaser';

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
