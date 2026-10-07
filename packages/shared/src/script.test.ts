import { describe, expect, it } from 'vitest';
import { extractJsonArray, plainText, sceneMarks, sceneText } from './script';

const plain = `1. INT. ZARA KA GHAR, AANGAN - SUBAH
Zara copies check kar rahi hai.

2. EXT. GALI - SUBAH
Chacha Rafiq gate par khare hain.

3. INT. BAITHAK - DIN
Kaghzaat khulte hain.`;

const markdown = `# MANNAT KA DIYA
## Episode 1 (Pilot)

---

**1. EXT. ANDROON LAHORE, TANG GALI - FAJR**

*Azaan ki aakhri awaazein.*

---

**2. INT. MANNAT KA GHAR, DALAN - SUBAH**

**MANNAT**
Amma Ji, chai.`;

describe('sceneMarks and sceneText', () => {
  it('finds plain headings', () => {
    expect(sceneMarks(plain).map((m) => m.number)).toEqual([1, 2, 3]);
  });
  it('finds headings wrapped in markdown', () => {
    const marks = sceneMarks(markdown);
    expect(marks.map((m) => m.number)).toEqual([1, 2]);
    expect(marks[0].heading).toBe('EXT. ANDROON LAHORE, TANG GALI - FAJR');
  });
  it('returns one scene only', () => {
    const scene = sceneText(plain, 2);
    expect(scene.startsWith('2. EXT. GALI')).toBe(true);
    expect(scene).not.toContain('BAITHAK');
    expect(sceneText(markdown, 1)).not.toContain('MANNAT KA GHAR');
  });
  it('returns the last scene to the end, and nothing for a missing one', () => {
    expect(sceneText(plain, 3)).toContain('Kaghzaat khulte hain.');
    expect(sceneText(plain, 9)).toBe('');
  });
  it('falls back to the text when there are no headings', () => {
    expect(sceneText('Zara ek school teacher hai.', 1)).toBe('Zara ek school teacher hai.');
  });
});

describe('plainText', () => {
  it('strips headings, bold, italics and rules', () => {
    const out = plainText(markdown);
    expect(out).not.toMatch(/[#*]|---/);
    expect(out).toContain('1. EXT. ANDROON LAHORE, TANG GALI - FAJR');
    expect(out).toContain('Azaan ki aakhri awaazein.');
    expect(sceneMarks(out).length).toBe(2);
  });
  it('leaves ordinary text alone', () => {
    expect(plainText('MAA (O.S.)\nZara, 2 * 3 = 6 hai.')).toBe('MAA (O.S.)\nZara, 2 * 3 = 6 hai.');
  });
});

describe('extractJsonArray', () => {
  it('reads a fenced array with prose around it', () => {
    expect(extractJsonArray('Here you go:\n```json\n[{"shot":"wide"}]\n```\nDone.')).toEqual([{ shot: 'wide' }]);
  });
  it('throws when there is no array', () => {
    expect(() => extractJsonArray('sorry')).toThrow();
  });
});
