import { BREAKDOWN_CATEGORIES, RATE_BASES } from '@sceneos/shared';

/**
 * Graders for AI output. Each returns the problems it found (an empty list is a pass), so the
 * same checks run on saved examples in unit tests and on live model output in `pnpm eval`.
 * They encode the rules in CLAUDE.md: Pakistani drama is never Bollywood, storyboard frames carry
 * a continuity sheet, breakdowns only list what the scene shows, rate cards are usable.
 */

export type Problems = string[];

/** Hindi words that do not belong in Urdu dialogue (Roman script), and Devanagari script itself. */
const HINDI_WORDS = ['dhanyavaad', 'dhanyavad', 'namaste', 'namaskar', 'pranam', 'bhagwan', 'kripya', 'swagat', 'vishwas', 'jeevan', 'samay', 'prem', 'mitra', 'sundar', 'parivaar', 'pariwar', 'shubh', 'pita ji', 'mata ji', 'aashirwad', 'ashirwad', 'uttar', 'prashn', 'prashna', 'avashya', 'atma', 'bahut dhanyavaad'];
export function hindiInUrdu(text: string): Problems {
  const problems: Problems = [];
  if (/[ऀ-ॿ]/.test(text)) problems.push('Devanagari (Hindi) script in the text');
  const lower = text.toLowerCase();
  for (const w of HINDI_WORDS) if (new RegExp(`\\b${w}\\b`).test(lower)) problems.push(`Hindi word "${w}"`);
  return problems;
}

/** Indian cultural markers that break a Pakistani setting. */
const INDIAN_MARKERS = ['sindoor', 'mangalsutra', 'bindi', 'diwali', 'holi', 'mandir', 'puja', 'pooja', 'aarti', 'bollywood', 'mumbai', 'delhi', 'tricolour', 'saffron flag', 'rupees inr', 'inr', '₹', 'tilak', 'ganesh', 'rangoli'];
/** Real Pakistani places that contain a marker word (Lahore's Delhi Gate) are not flagged. */
const PAKISTANI_PLACES = [/delhi (gate|darwaza)/g];
export function indianMarkers(text: string): Problems {
  const lower = PAKISTANI_PLACES.reduce((t, re) => t.replace(re, ''), text.toLowerCase());
  return INDIAN_MARKERS.filter((m) => (/^\W$/.test(m) ? lower.includes(m) : new RegExp(`\\b${m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(lower))).map((m) => `Indian marker "${m}"`);
}

export interface BreakdownRow { scene: number; synopsis: string; elements: { category: string; name: string; qty?: number }[] }
/** A breakdown lists only what the scene shows: cast must be named in the scene, categories must be known. */
export function breakdownProblems(sceneText: string, row: BreakdownRow): Problems {
  const problems: Problems = [];
  const text = sceneText.toUpperCase();
  if (!row.synopsis?.trim()) problems.push('No synopsis');
  for (const e of row.elements) {
    if (!(BREAKDOWN_CATEGORIES as readonly string[]).includes(e.category)) problems.push(`Unknown category "${e.category}"`);
    if (e.category === 'cast') {
      const first = e.name.toUpperCase().split(/\s+/)[0];
      if (!text.includes(first)) problems.push(`Cast "${e.name}" is not in the scene`);
    }
    if (e.qty !== undefined && (e.qty < 1 || !Number.isInteger(e.qty))) problems.push(`Bad quantity for "${e.name}"`);
  }
  return problems;
}

export interface FrameSheet { shot: string; cast: { name: string; wardrobe?: string; facing?: string }[]; location?: string; light?: string; lens?: string }
/** Every storyboard frame needs a shot label, place, light, lens and, for each person, clothes and facing. */
export function continuityProblems(frames: FrameSheet[]): Problems {
  const problems: Problems = [];
  if (frames.length < 1 || frames.length > 6) problems.push(`${frames.length} frames (want 1 to 6)`);
  frames.forEach((f, i) => {
    if (!f.shot?.trim()) problems.push(`Frame ${i + 1} has no shot label`);
    if (!f.location?.trim()) problems.push(`Frame ${i + 1} has no place`);
    if (!f.light?.trim()) problems.push(`Frame ${i + 1} has no light`);
    if (!f.lens?.trim()) problems.push(`Frame ${i + 1} has no lens`);
    for (const c of f.cast) {
      if (!c.wardrobe?.trim()) problems.push(`Frame ${i + 1}: ${c.name} has no wardrobe`);
      if (!c.facing?.trim()) problems.push(`Frame ${i + 1}: ${c.name} has no facing`);
    }
  });
  return problems;
}

/** A rate card the estimate can use: every needed basis present, high never below low, nothing absurd. */
export function rateCardProblems(lines: { basis: string; low: number; high: number; item: string }[]): Problems {
  const problems: Problems = [];
  for (const need of ['lead_day', 'supporting_day', 'minor_day', 'location_day', 'extra_day', 'shoot_day']) if (!lines.some((l) => l.basis === need)) problems.push(`No ${need} rate`);
  for (const l of lines) {
    if (!(RATE_BASES as readonly string[]).includes(l.basis)) problems.push(`Unknown basis "${l.basis}"`);
    if (l.high < l.low) problems.push(`"${l.item}" high is below low`);
    if (l.low <= 0) problems.push(`"${l.item}" has no rate`);
  }
  const lead = lines.find((l) => l.basis === 'lead_day');
  const minor = lines.find((l) => l.basis === 'minor_day');
  if (lead && minor && lead.low < minor.low) problems.push('A lead costs less than a small part');
  return problems;
}
