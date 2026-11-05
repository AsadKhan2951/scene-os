import { describe, expect, it } from 'vitest';
import { shotSizeOf } from './constants';
import { PROMO_ASPECTS, teaserCreateSchema } from './teaser';

describe('shotSizeOf', () => {
  it('reads common frame labels', () => {
    expect(shotSizeOf('Wide shot, low angle')).toBe('WS');
    expect(shotSizeOf('MCU on Mannat')).toBe('MCU');
    expect(shotSizeOf('Extreme close-up of the ring')).toBe('ECU');
    expect(shotSizeOf('Medium close up, over the shoulder')).toBe('MCU');
    expect(shotSizeOf('Over-the-shoulder two-shot')).toBe('OTS');
    expect(shotSizeOf('Establishing shot of the harbour')).toBe('EWS');
    expect(shotSizeOf('Insert: phone screen')).toBe('INSERT');
    expect(shotSizeOf('Close up')).toBe('CU');
    expect(shotSizeOf('')).toBe('');
  });
});

describe('promo shapes', () => {
  const base = { storyId: 'a'.repeat(24), durationSeconds: 30, tone: 'emotional', music: 'no_music', voiceOver: false } as const;
  it('defaults to widescreen and accepts scope and vertical', () => {
    expect(teaserCreateSchema.parse(base).aspect).toBe('16:9');
    for (const aspect of PROMO_ASPECTS) expect(teaserCreateSchema.parse({ ...base, aspect }).aspect).toBe(aspect);
  });
  it('needs at least two key frames', () => {
    expect(() => teaserCreateSchema.parse({ ...base, frameIds: ['b'.repeat(24)] })).toThrow();
    expect(teaserCreateSchema.parse({ ...base, frameIds: ['b'.repeat(24), 'c'.repeat(24)] }).frameIds).toHaveLength(2);
  });
});
