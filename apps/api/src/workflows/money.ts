import { z } from 'zod';
import { RATE_BASES, RATE_BASIS_LABELS, budgetTotals, estimateLines, extractJsonObject, rateLineSchema, type Quantities, type RateLine } from '@sceneos/shared';
import { Actor, Budget, Character, Location, Production, RateCard, Scene, Schedule, Story } from '../models';
import { defineWorkflow } from '../lib/runs';
import { generateJson } from '../lib/anthropic';

/**
 * Budget estimate: quantities come from the project (breakdown, shoot plan, locations, actors),
 * rates from the project's rate card. The only AI step writes a first rate card for the
 * country and format when the project has none; every figure after that is plain arithmetic.
 */

const PAGES_PER_DAY = 5;

/** Counts everything the estimate multiplies. */
export async function projectQuantities(productionId: string): Promise<Quantities & { basis: string[] }> {
  const production = await Production.findById(productionId).lean();
  if (!production) throw new Error('Project not found');
  const story = await Story.findOne({ productionId }).sort({ updatedAt: -1 }).lean();
  const [scenes, characters, actors, locations, schedule] = await Promise.all([
    story ? Scene.find({ storyId: story._id }).lean() : [],
    story ? Character.find({ storyId: story._id }).select('name role').lean() : [],
    Actor.find({ productionId }).select('name character dayRate currency').lean(),
    Location.find({ productionId }).select('name costPerDay currency').lean(),
    Schedule.findOne({ productionId }).sort({ status: 1, createdAt: -1 }).lean(),
  ]);
  const basis: string[] = [];
  const sceneById = new Map<string, (typeof scenes)[number]>(scenes.map((s) => [String(s._id), s]));
  const castOf = (s: (typeof scenes)[number]) => [...new Set([...s.characters, ...s.elements.filter((e) => e.category === 'cast').map((e) => e.name)].map((n) => n.toUpperCase()))];
  const qtyOf = (s: (typeof scenes)[number], category: string) => s.elements.filter((e) => e.category === category).reduce((n, e) => n + (e.qty ?? (category === 'extras' ? 5 : 1)), 0);

  // Shoot days: the shoot plan when there is one, else pages at a steady pace.
  type Day = { location: string; scenes: (typeof scenes)[number][]; places?: Set<string> };
  // Scenes grouped into a real place go under that place's name, so its own cost per day is used.
  const placeOf = (sc: (typeof scenes)[number]) => (sc.locationId && locations.find((l) => String(l._id) === String(sc.locationId))?.name) || sc.location || '';
  let days: Day[];
  if (schedule?.days?.length) {
    days = schedule.days.map((d) => {
      const here = d.sceneIds.map((id) => sceneById.get(String(id))).filter((s): s is (typeof scenes)[number] => !!s);
      // Every place visited that day is paid for, not only the first.
      return { location: d.locationName ?? '', scenes: here, places: new Set(here.map(placeOf).filter(Boolean)) };
    });
    basis.push(`${days.length} shoot days from the ${schedule.status} shoot plan`);
  } else {
    // Without a plan, scenes are packed by place at a steady pace: a new day when the day is full
    // or the unit moves to another place. Enough to count days per person and per place.
    const sorted = [...scenes].sort((a, b) => placeOf(a).localeCompare(placeOf(b)) || a.number - b.number);
    days = [];
    let filled = 0;
    for (const s of sorted) {
      const last = days.at(-1);
      // A short scene at another place can share the day (a company move); a long day cannot.
      const move = !!last && !last.places!.has(placeOf(s));
      if (!last || filled >= PAGES_PER_DAY * 8 || (move && filled >= 2 * 8)) { days.push({ location: placeOf(s), scenes: [], places: new Set() }); filled = 0; }
      const day = days.at(-1)!;
      day.scenes.push(s); day.places!.add(placeOf(s)); filled += s.eighths || 1;
    }
    if (!days.length) days.push({ location: '', scenes: [], places: new Set() });
    const count = days.length;
    basis.push(scenes.length ? `${count} shoot days at ${PAGES_PER_DAY} pages a day (no shoot plan yet)` : 'No scenes yet: one shoot day assumed');
  }

  const castDays = new Map<string, number>();
  let extraDays = 0; let vehicleDays = 0;
  const locationDays = new Map<string, number>();
  for (const d of days) {
    for (const name of new Set(d.scenes.flatMap(castOf))) castDays.set(name, (castDays.get(name) ?? 0) + 1);
    extraDays += Math.max(0, ...d.scenes.map((s) => qtyOf(s, 'extras')));
    vehicleDays += Math.max(0, ...d.scenes.map((s) => qtyOf(s, 'vehicles')));
    const places = d.places?.size ? d.places : [d.location || d.scenes[0]?.location || ''];
    for (const place of places) if (place) locationDays.set(place, (locationDays.get(place) ?? 0) + 1);
  }
  const roleOf = (name: string) => {
    const role = characters.find((c) => c.name.toUpperCase() === name)?.role;
    return role === 'lead' || role === 'antagonist' ? 'lead' : role === 'supporting' ? 'supporting' : 'minor';
  };
  const shootDays = days.length;
  const episodes = Math.max(1, production.totalEpisodes ?? 1);
  const runtimeMinutes = story?.stats?.runtimeMinutes ?? Math.round(scenes.reduce((n, s) => n + (s.eighths || 1), 0) / 8) ?? 0;
  if (!story?.stats?.runtimeMinutes) basis.push('Runtime taken as about a minute a page');
  return {
    shootDays,
    prepDays: Math.max(10, Math.round(shootDays * 0.6)),
    postWeeks: Math.max(4, Math.round(episodes * 1.5)),
    episodes,
    runtimeMinutes,
    cast: [...castDays].map(([character, d]) => {
      const actor = actors.find((a) => (a.character ?? '').toUpperCase() === character);
      // A rate in another currency would be added as if it were the budget's; the rate card is used instead.
      const sameCurrency = !actor?.currency || actor.currency === (production.currency ?? 'PKR');
      return { character, actor: actor?.name, role: roleOf(character) as 'lead' | 'supporting' | 'minor', days: d, dayRate: sameCurrency ? actor?.dayRate ?? undefined : undefined };
    }),
    extraDays,
    locations: [...locationDays].map(([name, d]) => {
      const loc = locations.find((l) => l.name.toUpperCase() === name.toUpperCase());
      const sameCurrency = !loc?.currency || loc.currency === (production.currency ?? 'PKR');
      return { name, days: d, costPerDay: sameCurrency ? loc?.costPerDay ?? undefined : undefined };
    }),
    companyMoves: schedule?.stats?.companyMoves ?? Math.max(0, locationDays.size - 1),
    vfxShots: scenes.reduce((n, s) => n + qtyOf(s, 'vfx'), 0),
    stuntScenes: scenes.filter((s) => qtyOf(s, 'stunts') > 0).length,
    vehicleDays,
    basis,
  };
}

/** Writes a first rate card for this kind of project in this country, in its currency. */
export async function draftRateCard(p: { format: string; country: string; currency: string; episodes: number; title: string }): Promise<RateLine[]> {
  const res = await generateJson(
    'You are an experienced line producer who budgets film and TV in many countries. You give realistic local rates, low and high, for a modest professional production. Reply with JSON only.',
    `Write a rate card for "${p.title}", a ${p.format} (${p.episodes} episode${p.episodes === 1 ? '' : 's'}) shot in ${p.country}, in ${p.currency}.
Give local rates as they are paid in ${p.country} today for a professional but not lavish production. These are planning figures a producer will check, not quotes.
Reply with { "lines": [{ "department", "item", "basis", "low", "high", "note" }] } where:
- "department" is one of: story_writing, producers, director, cast, production_staff, extras, camera, lighting_grip, sound, art_props, wardrobe, makeup_hair, locations, transport, catering, equipment, stunts_sfx, post_production, vfx, music, insurance_legal, other.
- "basis" is one of: ${RATE_BASES.map((b) => `${b} (${RATE_BASIS_LABELS[b]})`).join(', ')}.
- Include exactly one line each for lead_day, supporting_day, minor_day and location_day, and lines for extras (extra_day), catering (shoot_day, for the whole unit), camera, lighting and grip, sound, production crew, art, wardrobe, make-up, transport, company moves, vehicles, stunts, VFX shots, writing, producers, director (episode or flat), post-production (post_week), music, insurance and legal (flat).
- "low" and "high" are plain numbers in ${p.currency} for one unit of the basis. "note" says what the line covers, under 12 words.`,
    (raw) => z.object({ lines: z.array(rateLineSchema.extend({ note: z.string().max(300).nullish().transform((v) => v ?? undefined) })).min(10).max(60) }).parse(extractJsonObject(raw)).lines,
    undefined, 8000,
  );
  return res.map((l) => ({ ...l, high: Math.max(l.low, l.high) }));
}

export interface EstimateInput { productionId: string; budgetId: string; redoRates?: boolean }

export const estimateWorkflow = defineWorkflow<EstimateInput>({
  type: 'money.estimate',
  title: 'Budget estimate',
  feature: 'money',
  quote: 'money.estimate',
  steps: [
    { key: 'quantities', label: 'Count days, cast, places and extras' },
    { key: 'rates', label: 'Rate card for the country' },
    { key: 'estimate', label: 'Price every line' },
  ],
  async run(r) {
    const { productionId, budgetId } = r.input;
    const quantities = await r.step('quantities', () => projectQuantities(productionId));
    await r.step('rates', async () => {
      const production = await Production.findById(productionId).lean();
      if (!production) throw new Error('Project not found');
      const card = await RateCard.findOne({ productionId }).sort({ createdAt: -1 }).lean();
      if (card && card.currency === production.currency && card.lines.length && !r.input.redoRates) return card.lines.length;
      const lines = await draftRateCard({ format: production.format, country: production.country ?? 'Pakistan', currency: production.currency ?? 'PKR', episodes: production.totalEpisodes ?? 1, title: production.title });
      await RateCard.create({ productionId, currency: production.currency ?? 'PKR', country: production.country, estimate: true, lines, sources: ['AI estimate, not checked'] });
      return lines.length;
    });
    await r.step('estimate', async () => {
      const card = await RateCard.findOne({ productionId }).sort({ createdAt: -1 }).lean();
      const budget = await Budget.findById(budgetId);
      if (!card || !budget) throw new Error('Rate card or budget missing');
      const { basis, ...q } = quantities;
      const lines = estimateLines(q, card.lines as RateLine[]);
      budget.set({ quantities: { ...q, basis }, lines, totals: budgetTotals(lines, budget.contingencyPct), currency: card.currency });
      await budget.save();
      return lines.length;
    });
  },
});
