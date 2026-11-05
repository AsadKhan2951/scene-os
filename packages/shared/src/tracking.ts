import type { HealthStatus } from './health';

/**
 * Tracking: one list of risk flags per project from every part of Scene OS (money, shoot plan,
 * cast, post, milestones, approvals). The flags are worked out by rules, so they are free and
 * the same every time; AI is only used to explain them in plain words ("why at risk").
 */

export const RISK_AREAS = ['money', 'schedule', 'cast', 'post', 'milestones', 'approvals', 'script', 'ai'] as const;
export type RiskArea = (typeof RISK_AREAS)[number];
export interface RiskFlag { level: 'red' | 'amber'; area: RiskArea; text: string }

export interface RiskInput {
  /** Reasons already found by the original health rules (budget used, pending sheets, delayed milestones). */
  healthReasons: { level: 'red' | 'amber'; text: string }[];
  /** How far the estimate at completion is over the budget, in percent; null when there is no budget. */
  costOverrunPct: number | null;
  /** Actor date clashes left in the shoot plan; null when there is no plan. */
  scheduleConflicts: number | null;
  scheduleApproved: boolean | null;
  /** Shoot days whose date has passed with no expenses logged for them. */
  shootDaysBehind: number;
  /** Days until the first shoot day; negative once the shoot has started; null without a plan. */
  daysToShoot: number | null;
  scenesNotBrokenDown: number;
  leadsWithoutActor: number;
  postLate: number;
  failedAiRuns: number;
}

export function riskFlags(i: RiskInput): { status: HealthStatus; flags: RiskFlag[] } {
  const flags: RiskFlag[] = [];
  const add = (level: RiskFlag['level'], area: RiskArea, text: string) => flags.push({ level, area, text });
  for (const r of i.healthReasons) add(r.level, /budget/i.test(r.text) ? 'money' : /milestone/i.test(r.text) ? 'milestones' : 'approvals', r.text);
  if (i.costOverrunPct !== null && i.costOverrunPct > 0) add(i.costOverrunPct >= 10 ? 'red' : 'amber', 'money', `Heading ${Math.round(i.costOverrunPct)}% over budget at the current burn`);
  if (i.scheduleConflicts) add('red', 'schedule', `${i.scheduleConflicts} actor date clash${i.scheduleConflicts === 1 ? '' : 'es'} in the shoot plan`);
  if (i.daysToShoot !== null && i.daysToShoot >= 0 && i.daysToShoot <= 14 && i.scheduleApproved === false) add('amber', 'schedule', `Shoot starts in ${i.daysToShoot} day${i.daysToShoot === 1 ? '' : 's'} and the plan is not approved`);
  if (i.shootDaysBehind > 0) add(i.shootDaysBehind >= 3 ? 'red' : 'amber', 'schedule', `${i.shootDaysBehind} planned shoot day${i.shootDaysBehind === 1 ? '' : 's'} passed with nothing logged`);
  if (i.leadsWithoutActor > 0 && i.daysToShoot !== null && i.daysToShoot <= 21) add(i.daysToShoot <= 7 ? 'red' : 'amber', 'cast', `${i.leadsWithoutActor} lead part${i.leadsWithoutActor === 1 ? '' : 's'} not cast and the shoot is ${i.daysToShoot <= 0 ? 'on' : `${i.daysToShoot} days away`}`);
  if (i.scenesNotBrokenDown > 0 && i.daysToShoot !== null && i.daysToShoot <= 21) add('amber', 'script', `${i.scenesNotBrokenDown} scene${i.scenesNotBrokenDown === 1 ? '' : 's'} not broken down yet`);
  if (i.postLate > 0) add(i.postLate >= 3 ? 'red' : 'amber', 'post', `${i.postLate} post task${i.postLate === 1 ? '' : 's'} past due`);
  if (i.failedAiRuns > 0) add('amber', 'ai', `${i.failedAiRuns} AI job${i.failedAiRuns === 1 ? '' : 's'} failed this week`);
  flags.sort((a, b) => (a.level === b.level ? 0 : a.level === 'red' ? -1 : 1));
  const status: HealthStatus = flags.some((f) => f.level === 'red') ? 'at_risk' : flags.length ? 'needs_attention' : 'on_track';
  return { status, flags };
}

/** Report types on the Tracking screen. */
export const TRACKING_REPORTS = ['daily_production', 'investor_update', 'cost_summary'] as const;
export type TrackingReport = (typeof TRACKING_REPORTS)[number];
export const TRACKING_REPORT_LABELS: Record<TrackingReport, string> = {
  daily_production: 'Daily production report', investor_update: 'Weekly investor update', cost_summary: 'Cost report summary',
};
