import { z } from 'zod';
import type { EXPENSE_CATEGORIES } from './constants';

/**
 * Budget estimate and cost report. The maths is plain and lives here so the API, the screens
 * and the tests agree: quantities (from the breakdown, shoot plan, locations and actors) times a
 * rate card, a low and a high figure for every line, then contingency on top.
 */

/** Departments of a top sheet, above the line first. */
export const BUDGET_DEPARTMENTS = [
  'story_writing', 'producers', 'director', 'cast',
  'production_staff', 'extras', 'camera', 'lighting_grip', 'sound', 'art_props', 'wardrobe', 'makeup_hair',
  'locations', 'transport', 'catering', 'equipment', 'stunts_sfx', 'post_production', 'vfx', 'music', 'insurance_legal', 'other',
] as const;
export type BudgetDepartment = (typeof BUDGET_DEPARTMENTS)[number];
export const ABOVE_THE_LINE: readonly BudgetDepartment[] = ['story_writing', 'producers', 'director', 'cast'];
export const BUDGET_DEPARTMENT_LABELS: Record<BudgetDepartment, string> = {
  story_writing: 'Story and writing', producers: 'Producers', director: 'Director', cast: 'Cast',
  production_staff: 'Production crew', extras: 'Extras', camera: 'Camera', lighting_grip: 'Lighting and grip', sound: 'Sound',
  art_props: 'Art and props', wardrobe: 'Wardrobe', makeup_hair: 'Make-up and hair', locations: 'Locations', transport: 'Transport',
  catering: 'Catering', equipment: 'Equipment', stunts_sfx: 'Stunts and SFX', post_production: 'Post-production', vfx: 'VFX',
  music: 'Music', insurance_legal: 'Insurance and legal', other: 'Other',
};

/** Where each daily expense line lands on the top sheet. */
export const EXPENSE_TO_DEPARTMENT: Record<(typeof EXPENSE_CATEGORIES)[number], BudgetDepartment> = {
  location: 'locations', lunch_catering: 'catering', fuel_transport: 'transport', props: 'art_props', makeup_hair: 'makeup_hair',
  crew_wages: 'production_staff', art_direction: 'art_props', wardrobe: 'wardrobe', equipment_rental: 'equipment', miscellaneous: 'other',
};

/** What a rate is multiplied by. */
export const RATE_BASES = [
  'shoot_day', 'prep_day', 'post_week', 'episode', 'flat', 'lead_day', 'supporting_day', 'minor_day', 'extra_day',
  'location_day', 'company_move', 'vfx_shot', 'stunt_scene', 'vehicle_day', 'runtime_minute',
] as const;
export type RateBasis = (typeof RATE_BASES)[number];
export const RATE_BASIS_LABELS: Record<RateBasis, string> = {
  shoot_day: 'per shoot day', prep_day: 'per prep day', post_week: 'per post week', episode: 'per episode', flat: 'flat',
  lead_day: 'per lead actor day', supporting_day: 'per supporting actor day', minor_day: 'per small-part day', extra_day: 'per extra per day',
  location_day: 'per location day', company_move: 'per company move', vfx_shot: 'per VFX shot', stunt_scene: 'per stunt scene',
  vehicle_day: 'per vehicle day', runtime_minute: 'per finished minute',
};

export const rateLineSchema = z.object({
  department: z.enum(BUDGET_DEPARTMENTS),
  item: z.string().min(1).max(120),
  basis: z.enum(RATE_BASES),
  low: z.number().min(0),
  high: z.number().min(0),
  note: z.string().max(300).optional(),
});
export type RateLine = z.infer<typeof rateLineSchema>;

/** Everything the estimate multiplies, taken from the project. */
export interface Quantities {
  shootDays: number;
  prepDays: number;
  postWeeks: number;
  episodes: number;
  runtimeMinutes: number;
  /** Work days per character; an actor's own day rate wins over the rate card. */
  cast: { character: string; actor?: string; role: 'lead' | 'supporting' | 'minor'; days: number; dayRate?: number }[];
  extraDays: number;
  /** Shoot days at each place; a location's own cost per day wins over the rate card. */
  locations: { name: string; days: number; costPerDay?: number }[];
  companyMoves: number;
  vfxShots: number;
  stuntScenes: number;
  vehicleDays: number;
}

export interface BudgetLine {
  department: BudgetDepartment;
  item: string;
  qty: number;
  unit: string;
  low: number;
  high: number;
  /** Where the figure came from, so a producer can see what to check. */
  source: 'rate_card' | 'actor' | 'location' | 'own';
  note?: string;
}

const round = (n: number) => Math.round(n);

/** Quantity for a rate basis. Cast and locations are handled line by line instead. */
function qtyFor(basis: RateBasis, q: Quantities): number {
  switch (basis) {
    case 'shoot_day': return q.shootDays;
    case 'prep_day': return q.prepDays;
    case 'post_week': return q.postWeeks;
    case 'episode': return q.episodes;
    case 'flat': return 1;
    case 'extra_day': return q.extraDays;
    case 'company_move': return q.companyMoves;
    case 'vfx_shot': return q.vfxShots;
    case 'stunt_scene': return q.stuntScenes;
    case 'vehicle_day': return q.vehicleDays;
    case 'runtime_minute': return q.runtimeMinutes;
    default: return 0;
  }
}

const ROLE_BASIS: Record<Quantities['cast'][number]['role'], RateBasis> = { lead: 'lead_day', supporting: 'supporting_day', minor: 'minor_day' };

/** Budget lines from quantities and a rate card. Lines with nothing to count are left out. */
export function estimateLines(q: Quantities, rates: RateLine[]): BudgetLine[] {
  const lines: BudgetLine[] = [];
  const rate = (basis: RateBasis) => rates.find((r) => r.basis === basis);
  for (const r of rates) {
    if (['lead_day', 'supporting_day', 'minor_day', 'location_day'].includes(r.basis)) continue;
    const qty = qtyFor(r.basis, q);
    if (qty <= 0) continue;
    lines.push({ department: r.department, item: r.item, qty, unit: RATE_BASIS_LABELS[r.basis], low: round(qty * r.low), high: round(qty * r.high), source: 'rate_card', note: r.note });
  }
  for (const c of q.cast) {
    if (c.days <= 0) continue;
    const card = rate(ROLE_BASIS[c.role]);
    if (c.dayRate) lines.push({ department: 'cast', item: `${c.character}${c.actor ? ` (${c.actor})` : ''}`, qty: c.days, unit: 'day', low: round(c.days * c.dayRate), high: round(c.days * c.dayRate), source: 'actor' });
    else if (card) lines.push({ department: 'cast', item: `${c.character} (not cast yet)`, qty: c.days, unit: 'day', low: round(c.days * card.low), high: round(c.days * card.high), source: 'rate_card' });
  }
  const locationRate = rate('location_day');
  for (const l of q.locations) {
    if (l.days <= 0) continue;
    if (l.costPerDay) lines.push({ department: 'locations', item: l.name, qty: l.days, unit: 'day', low: round(l.days * l.costPerDay), high: round(l.days * l.costPerDay * 1.15), source: 'location', note: 'Location fee; high side allows for overtime and permits' });
    else if (locationRate) lines.push({ department: 'locations', item: l.name, qty: l.days, unit: 'day', low: round(l.days * locationRate.low), high: round(l.days * locationRate.high), source: 'rate_card' });
  }
  return lines;
}

export interface BudgetTotals { aboveLine: { low: number; high: number }; belowLine: { low: number; high: number }; subtotal: { low: number; high: number }; contingency: { low: number; high: number }; total: { low: number; high: number; mid: number } }

export function budgetTotals(lines: Pick<BudgetLine, 'department' | 'low' | 'high'>[], contingencyPct: number): BudgetTotals {
  const sum = (pick: (l: (typeof lines)[number]) => boolean) => ({
    low: lines.filter(pick).reduce((n, l) => n + l.low, 0),
    high: lines.filter(pick).reduce((n, l) => n + l.high, 0),
  });
  const aboveLine = sum((l) => ABOVE_THE_LINE.includes(l.department));
  const belowLine = sum((l) => !ABOVE_THE_LINE.includes(l.department));
  const subtotal = { low: aboveLine.low + belowLine.low, high: aboveLine.high + belowLine.high };
  const contingency = { low: round((subtotal.low * contingencyPct) / 100), high: round((subtotal.high * contingencyPct) / 100) };
  const low = subtotal.low + contingency.low;
  const high = subtotal.high + contingency.high;
  return { aboveLine, belowLine, subtotal, contingency, total: { low, high, mid: round((low + high) / 2) } };
}

/** Budget per department: the middle of the estimate, or the producer's own figure. */
export function departmentBudgets(lines: Pick<BudgetLine, 'department' | 'low' | 'high'>[]): Partial<Record<BudgetDepartment, number>> {
  const out: Partial<Record<BudgetDepartment, number>> = {};
  for (const l of lines) out[l.department] = (out[l.department] ?? 0) + round((l.low + l.high) / 2);
  return out;
}

export interface CostRow { department: BudgetDepartment; aboveLine: boolean; budget: number; actual: number; pending: number; usedPct: number | null; estimateToComplete: number; estimateAtCompletion: number; variance: number }

/**
 * The cost report. Estimate to complete assumes the rest of the shoot spends like the days
 * already shot, but never less than what is left of the budget for departments that have
 * not spent yet (their money mostly goes later: post, music, VFX).
 */
export function costReport(
  budgets: Partial<Record<BudgetDepartment, number>>,
  actual: Partial<Record<BudgetDepartment, number>>,
  pending: Partial<Record<BudgetDepartment, number>>,
  progress: { daysShot: number; shootDays: number },
) {
  const share = progress.shootDays > 0 ? Math.min(1, progress.daysShot / progress.shootDays) : 0;
  const rows: CostRow[] = BUDGET_DEPARTMENTS.filter((d) => (budgets[d] ?? 0) > 0 || (actual[d] ?? 0) > 0 || (pending[d] ?? 0) > 0).map((d) => {
    const budget = budgets[d] ?? 0;
    const spent = actual[d] ?? 0;
    const paced = share > 0 && spent > 0 ? spent / share - spent : 0;
    const estimateToComplete = round(Math.max(paced, budget - spent, 0));
    const estimateAtCompletion = spent + estimateToComplete;
    return {
      department: d, aboveLine: ABOVE_THE_LINE.includes(d), budget, actual: spent, pending: pending[d] ?? 0,
      usedPct: budget > 0 ? Math.round((spent / budget) * 1000) / 10 : null,
      estimateToComplete, estimateAtCompletion, variance: budget - estimateAtCompletion,
    };
  });
  const total = (k: keyof Pick<CostRow, 'budget' | 'actual' | 'pending' | 'estimateToComplete' | 'estimateAtCompletion' | 'variance'>) => rows.reduce((n, r) => n + r[k], 0);
  const spent = total('actual');
  return {
    rows,
    totals: { budget: total('budget'), actual: spent, pending: total('pending'), estimateToComplete: total('estimateToComplete'), estimateAtCompletion: total('estimateAtCompletion'), variance: total('variance') },
    burnPerShootDay: progress.daysShot > 0 ? round(spent / progress.daysShot) : null,
  };
}

/** Turns an amount into another currency with a rate the producer entered (1 unit of `from` = rate units of `to`). */
export const convert = (amount: number, rate: number | undefined) => (rate && rate > 0 ? Math.round(amount * rate) : amount);

// ---- Post ----
export const POST_STAGES = ['assembly', 'directors_cut', 'picture_lock', 'vfx', 'grade', 'mix', 'subtitles', 'delivery'] as const;
export type PostStage = (typeof POST_STAGES)[number];
export const POST_STAGE_LABELS: Record<PostStage, string> = {
  assembly: 'Assembly', directors_cut: "Director's cut", picture_lock: 'Picture lock', vfx: 'VFX shots', grade: 'Colour grade', mix: 'Sound mix', subtitles: 'Subtitles', delivery: 'Delivery',
};
/** Working days each stage takes for one episode, a sensible default a post supervisor edits. */
export const POST_STAGE_DAYS: Record<PostStage, number> = { assembly: 5, directors_cut: 5, picture_lock: 2, vfx: 7, grade: 3, mix: 3, subtitles: 2, delivery: 1 };
/** Stages that can run side by side once the picture is locked. */
const AFTER_LOCK: PostStage[] = ['vfx', 'grade', 'mix', 'subtitles'];
export const POST_TASK_STATUSES = ['not_started', 'in_progress', 'done', 'late'] as const;

const addWorkDays = (start: Date, days: number, off: number[]) => {
  const d = new Date(start);
  let left = days;
  while (left > 0) { d.setUTCDate(d.getUTCDate() + 1); if (!off.includes(d.getUTCDay())) left--; }
  return d;
};

/**
 * A post schedule per episode. The editor starts episode 1 the day after its footage is in, and
 * each later episode a few days after the one before; after picture lock, VFX, grade, mix and
 * subtitles run side by side and delivery follows the slowest of them.
 */
export function postSchedule(opts: { start: Date; episodes: number; daysOff?: number[]; stagger?: number; days?: Partial<Record<PostStage, number>> }) {
  const off = opts.daysOff ?? [5];
  const days = { ...POST_STAGE_DAYS, ...opts.days };
  const stagger = opts.stagger ?? days.assembly;
  const tasks: { episodeNumber: number; stage: PostStage; start: Date; due: Date }[] = [];
  for (let ep = 1; ep <= Math.max(1, opts.episodes); ep++) {
    let cursor = addWorkDays(opts.start, (ep - 1) * stagger, off);
    for (const stage of ['assembly', 'directors_cut', 'picture_lock'] as const) {
      const due = addWorkDays(cursor, days[stage], off);
      tasks.push({ episodeNumber: ep, stage, start: cursor, due });
      cursor = due;
    }
    const lock = cursor;
    let last = lock;
    for (const stage of AFTER_LOCK) {
      if (days[stage] <= 0) continue;
      const due = addWorkDays(lock, days[stage], off);
      tasks.push({ episodeNumber: ep, stage, start: lock, due });
      if (due > last) last = due;
    }
    tasks.push({ episodeNumber: ep, stage: 'delivery', start: last, due: addWorkDays(last, days.delivery, off) });
  }
  return tasks;
}
