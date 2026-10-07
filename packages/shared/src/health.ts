export type HealthStatus = 'on_track' | 'needs_attention' | 'at_risk';

export interface HealthThresholds {
  budgetAmberPct: number;
  budgetRedPct: number;
  pendingAmberCount: number;
  pendingRedCount: number;
}

/**
 * PLACEHOLDER levels. The product guide describes the rules ("elevated budget burn",
 * "a high volume of pending expenses") but gives no numbers. Confirm these with the
 * business before launch; they can also be overridden with HEALTH_* env vars on the API.
 */
export const DEFAULT_HEALTH_THRESHOLDS: HealthThresholds = {
  budgetAmberPct: 75,
  budgetRedPct: 90,
  pendingAmberCount: 2,
  pendingRedCount: 5,
};

export interface HealthSignals {
  /** null when the production is not on floor yet */
  scenePct: number | null;
  /** null when no budget is set */
  budgetPct: number | null;
  delayedMilestones: number;
  pendingSheets: number;
}

export interface HealthResult {
  status: HealthStatus;
  reasons: string[];
}

export function computeHealth(s: HealthSignals, t: HealthThresholds = DEFAULT_HEALTH_THRESHOLDS): HealthResult {
  const red: string[] = [];
  const amber: string[] = [];
  if (s.delayedMilestones > 0) red.push(`${s.delayedMilestones} delayed milestone${s.delayedMilestones === 1 ? '' : 's'}`);
  if (s.pendingSheets >= t.pendingRedCount) red.push(`${s.pendingSheets} expense sheets waiting for approval`);
  else if (s.pendingSheets >= t.pendingAmberCount) amber.push(`${s.pendingSheets} expense sheets waiting for approval`);
  if (s.budgetPct !== null) {
    if (s.budgetPct >= t.budgetRedPct) red.push(`${Math.round(s.budgetPct)}% of the budget is used`);
    else if (s.budgetPct >= t.budgetAmberPct) amber.push(`${Math.round(s.budgetPct)}% of the budget is used`);
  }
  if (red.length) return { status: 'at_risk', reasons: [...red, ...amber] };
  if (amber.length) return { status: 'needs_attention', reasons: amber };
  return { status: 'on_track', reasons: [] };
}

export interface BudgetSummary {
  budget: number;
  approved: number;
  pending: number;
  remaining: number;
  usedPct: number | null;
}

export function computeBudget(budget: number, approved: number, pending: number): BudgetSummary {
  return {
    budget,
    approved,
    pending,
    remaining: budget - approved,
    usedPct: budget > 0 ? (approved / budget) * 100 : null,
  };
}

export function scenePct(total: number, recorded: number): number | null {
  return total > 0 ? (recorded / total) * 100 : null;
}
