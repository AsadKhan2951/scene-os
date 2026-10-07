import { describe, expect, it } from 'vitest';
import { computeBudget, computeHealth, scenePct } from './health';

const base = { scenePct: 40, budgetPct: 37, delayedMilestones: 0, pendingSheets: 0 };

describe('computeHealth', () => {
  it('is on track with no risk signal', () => {
    expect(computeHealth(base)).toEqual({ status: 'on_track', reasons: [] });
  });
  it('needs attention when several sheets are waiting', () => {
    expect(computeHealth({ ...base, pendingSheets: 3 }).status).toBe('needs_attention');
  });
  it('needs attention on elevated budget use', () => {
    expect(computeHealth({ ...base, budgetPct: 88 }).status).toBe('needs_attention');
  });
  it('is at risk with a delayed milestone', () => {
    const r = computeHealth({ ...base, delayedMilestones: 1 });
    expect(r.status).toBe('at_risk');
    expect(r.reasons[0]).toBe('1 delayed milestone');
  });
  it('is at risk past the budget risk level', () => {
    expect(computeHealth({ ...base, budgetPct: 95 }).status).toBe('at_risk');
  });
  it('ignores budget when none is set', () => {
    expect(computeHealth({ ...base, budgetPct: null }).status).toBe('on_track');
  });
});

describe('budget and scenes', () => {
  it('computes remaining and used', () => {
    expect(computeBudget(85_000_000, 31_450_000, 1_840_000)).toMatchObject({ remaining: 53_550_000, usedPct: 37 });
  });
  it('has no used percent without a budget', () => {
    expect(computeBudget(0, 100, 0).usedPct).toBeNull();
  });
  it('computes scene percent', () => {
    expect(scenePct(1040, 416)).toBe(40);
    expect(scenePct(0, 0)).toBeNull();
  });
});
