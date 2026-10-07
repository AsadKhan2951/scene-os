import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('JWT_SECRET', 'test-secret-test-secret-test-secret-1234');
const { sceneText } = await import('./worker');

const script = `1. INT. ZARA KA GHAR, AANGAN - SUBAH
Zara copies check kar rahi hai.

2. EXT. GALI - SUBAH
Chacha Rafiq gate par khare hain.

3. INT. BAITHAK - DIN
Kaghzaat khulte hain.`;

describe('sceneText', () => {
  it('returns one numbered scene', () => {
    const scene = sceneText(script, 2);
    expect(scene.startsWith('2. EXT. GALI')).toBe(true);
    expect(scene).not.toContain('BAITHAK');
  });
  it('returns the last scene to the end', () => {
    expect(sceneText(script, 3)).toContain('Kaghzaat khulte hain.');
  });
  it('returns nothing for a missing scene', () => {
    expect(sceneText(script, 9)).toBe('');
  });
  it('falls back to the whole text when there are no headings', () => {
    expect(sceneText('Zara ek school teacher hai.', 1)).toBe('Zara ek school teacher hai.');
  });
});
