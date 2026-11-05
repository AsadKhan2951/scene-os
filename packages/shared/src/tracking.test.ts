import { describe, expect, it } from 'vitest';
import { riskFlags, type RiskInput } from './tracking';

const calm: RiskInput = { healthReasons: [], costOverrunPct: null, scheduleConflicts: null, scheduleApproved: null, shootDaysBehind: 0, daysToShoot: null, scenesNotBrokenDown: 0, leadsWithoutActor: 0, postLate: 0, failedAiRuns: 0 };

describe('riskFlags', () => {
  it('is on track with nothing to flag', () => {
    expect(riskFlags(calm)).toEqual({ status: 'on_track', flags: [] });
  });
  it('raises money, schedule and cast risks with red first', () => {
    const r = riskFlags({ ...calm, costOverrunPct: 4, scheduleConflicts: 2, daysToShoot: 5, scheduleApproved: false, leadsWithoutActor: 1 });
    expect(r.status).toBe('at_risk');
    expect(r.flags[0].level).toBe('red');
    expect(r.flags.map((f) => f.area)).toEqual(['schedule', 'cast', 'money', 'schedule']);
  });
  it('ignores casting and breakdown far from the shoot', () => {
    expect(riskFlags({ ...calm, leadsWithoutActor: 3, scenesNotBrokenDown: 10, daysToShoot: 60 }).flags).toHaveLength(0);
  });
  it('keeps the original health reasons in their areas', () => {
    const r = riskFlags({ ...calm, healthReasons: [{ level: 'amber', text: '82% of the budget is used' }, { level: 'red', text: '2 delayed milestones' }] });
    expect(r.flags.map((f) => f.area)).toEqual(['milestones', 'money']);
  });
});
