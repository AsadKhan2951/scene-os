import { describe, expect, it } from 'vitest';
import { budgetTotals, costReport, departmentBudgets, estimateLines, postSchedule, type Quantities, type RateLine } from './money';

const q: Quantities = {
  shootDays: 20, prepDays: 10, postWeeks: 6, episodes: 6, runtimeMinutes: 240,
  cast: [{ character: 'MANNAT', actor: 'Ayesha', role: 'lead', days: 15, dayRate: 100 }, { character: 'RAZA', role: 'supporting', days: 5 }],
  extraDays: 40, locations: [{ name: 'Harbour', days: 6, costPerDay: 50 }, { name: 'Market', days: 3 }],
  companyMoves: 4, vfxShots: 0, stuntScenes: 1, vehicleDays: 10,
};
const rates: RateLine[] = [
  { department: 'camera', item: 'Camera package and crew', basis: 'shoot_day', low: 10, high: 20 },
  { department: 'cast', item: 'Supporting actor', basis: 'supporting_day', low: 30, high: 60 },
  { department: 'locations', item: 'Location fee', basis: 'location_day', low: 20, high: 40 },
  { department: 'vfx', item: 'VFX shot', basis: 'vfx_shot', low: 100, high: 300 },
  { department: 'director', item: 'Director', basis: 'episode', low: 200, high: 300 },
];

describe('estimateLines', () => {
  const lines = estimateLines(q, rates);
  it('multiplies quantities by rates and skips empty lines', () => {
    expect(lines.find((l) => l.item === 'Camera package and crew')).toMatchObject({ qty: 20, low: 200, high: 400 });
    expect(lines.find((l) => l.department === 'vfx')).toBeUndefined();
  });
  it('uses an actor or location own rate before the rate card', () => {
    expect(lines.find((l) => l.item === 'MANNAT (Ayesha)')).toMatchObject({ low: 1500, high: 1500, source: 'actor' });
    expect(lines.find((l) => l.item === 'RAZA (not cast yet)')).toMatchObject({ low: 150, high: 300, source: 'rate_card' });
    expect(lines.find((l) => l.item === 'Harbour')).toMatchObject({ low: 300, source: 'location' });
    expect(lines.find((l) => l.item === 'Market')).toMatchObject({ low: 60, high: 120 });
  });
  it('adds contingency and splits above and below the line', () => {
    const t = budgetTotals(lines, 10);
    expect(t.aboveLine.low).toBe(1200 + 1500 + 150);
    expect(t.contingency.low).toBe(Math.round(t.subtotal.low * 0.1));
    expect(t.total.mid).toBe(Math.round((t.total.low + t.total.high) / 2));
  });
});

describe('costReport', () => {
  it('projects spend at the pace of the days shot', () => {
    const r = costReport({ camera: 1000, post_production: 500 }, { camera: 600 }, { camera: 50 }, { daysShot: 5, shootDays: 20 });
    const camera = r.rows.find((x) => x.department === 'camera')!;
    expect(camera.estimateToComplete).toBe(1800);
    expect(camera.variance).toBe(1000 - 2400);
    expect(r.rows.find((x) => x.department === 'post_production')!.estimateAtCompletion).toBe(500);
    expect(r.burnPerShootDay).toBe(120);
  });
  it('totals department budgets from estimate lines', () => {
    expect(departmentBudgets([{ department: 'camera', low: 100, high: 200 }, { department: 'camera', low: 10, high: 10 }])).toEqual({ camera: 160 });
  });
});

describe('postSchedule', () => {
  it('runs post stages in order and lets the finishing stages overlap', () => {
    const tasks = postSchedule({ start: new Date('2026-12-01T00:00:00Z'), episodes: 2, daysOff: [0] });
    const ep1 = tasks.filter((t) => t.episodeNumber === 1);
    expect(ep1.map((t) => t.stage)).toEqual(['assembly', 'directors_cut', 'picture_lock', 'vfx', 'grade', 'mix', 'subtitles', 'delivery']);
    const lock = ep1.find((t) => t.stage === 'picture_lock')!;
    expect(ep1.find((t) => t.stage === 'grade')!.start.getTime()).toBe(lock.due.getTime());
    const vfx = ep1.find((t) => t.stage === 'vfx')!;
    expect(ep1.find((t) => t.stage === 'delivery')!.start.getTime()).toBe(vfx.due.getTime());
    expect(tasks.filter((t) => t.episodeNumber === 2)[0].start.getTime()).toBeGreaterThan(ep1[0].start.getTime());
    expect(tasks.every((t) => t.due.getUTCDay() !== 0)).toBe(true);
  });
});
