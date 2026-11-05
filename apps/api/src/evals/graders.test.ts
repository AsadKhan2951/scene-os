import { describe, expect, it } from 'vitest';
import { GOLDEN, SCENES } from './cases';
import { breakdownProblems, continuityProblems, hindiInUrdu, indianMarkers, rateCardProblems } from './graders';

describe('language and world graders', () => {
  it('passes Urdu and catches Hindi', () => {
    expect(hindiInUrdu(GOLDEN.goodUrdu)).toEqual([]);
    expect(hindiInUrdu(GOLDEN.badUrdu).length).toBeGreaterThan(1);
    expect(hindiInUrdu('नमस्ते')).toEqual(['Devanagari (Hindi) script in the text']);
  });
  it('catches Indian markers but not Lahore\'s Delhi Gate', () => {
    expect(indianMarkers(GOLDEN.goodLook)).toEqual([]);
    expect(indianMarkers(GOLDEN.badLook).length).toBeGreaterThanOrEqual(3);
    expect(indianMarkers('A market near Delhi Gate in old Lahore')).toEqual([]);
  });
});

describe('breakdown grader', () => {
  it('flags cast that is not in the scene and unknown categories', () => {
    const p = breakdownProblems(SCENES[0].text, { scene: 1, synopsis: 'Mannat waits.', elements: [{ category: 'cast', name: 'Mannat' }, { category: 'cast', name: 'Raza' }, { category: 'weather', name: 'Rain' }] });
    expect(p).toEqual(['Cast "Raza" is not in the scene', 'Unknown category "weather"']);
  });
});

describe('continuity and rate card graders', () => {
  it('needs facing and wardrobe for each person', () => {
    expect(continuityProblems([{ shot: 'MS', cast: [{ name: 'MANNAT', wardrobe: 'green kameez' }], location: 'courtyard', light: 'lanterns', lens: '50mm' }])).toEqual(['Frame 1: MANNAT has no facing']);
  });
  it('checks the rate card can price a budget', () => {
    const p = rateCardProblems([{ basis: 'lead_day', low: 10, high: 5, item: 'Lead' }, { basis: 'minor_day', low: 20, high: 30, item: 'Small part' }]);
    expect(p).toContain('No location_day rate');
    expect(p).toContain('"Lead" high is below low');
    expect(p).toContain('A lead costs less than a small part');
  });
});
