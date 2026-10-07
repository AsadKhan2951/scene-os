import { computeBudget, computeHealth, scenePct } from '@sceneos/shared';
import { healthThresholds } from '../config/env';
import { Episode, ExpenseSheet, Milestone, Production } from '../models';

/**
 * One row per production with everything the dashboards and Dreamer need:
 * scenes, budget, pending approvals, delayed milestones and the resulting health.
 */
export async function portfolio(filter: Record<string, unknown> = {}) {
  const productions = await Production.find(filter).sort({ createdAt: -1 }).lean();
  const ids = productions.map((p) => p._id);

  // A milestone that passed its due date without being completed counts as delayed.
  await Milestone.updateMany({ productionId: { $in: ids }, status: { $in: ['pending', 'in_progress'] }, dueDate: { $lt: startOfToday() } }, { status: 'delayed' });

  const [scenes, money, delayed] = await Promise.all([
    Episode.aggregate<{ _id: unknown; total: number; recorded: number }>([
      { $match: { productionId: { $in: ids } } },
      { $group: { _id: '$productionId', total: { $sum: '$totalScenes' }, recorded: { $sum: '$recordedScenes' } } },
    ]),
    ExpenseSheet.aggregate<{ _id: { p: unknown; s: string }; sheets: number; requested: number; approved: number }>([
      { $match: { productionId: { $in: ids }, status: { $in: ['submitted', 'approved'] } } },
      { $project: { productionId: 1, status: 1, requested: { $sum: '$items.requested' }, approved: { $sum: '$items.approved' } } },
      { $group: { _id: { p: '$productionId', s: '$status' }, sheets: { $sum: 1 }, requested: { $sum: '$requested' }, approved: { $sum: '$approved' } } },
    ]),
    Milestone.aggregate<{ _id: unknown; n: number }>([
      { $match: { productionId: { $in: ids }, status: 'delayed' } },
      { $group: { _id: '$productionId', n: { $sum: 1 } } },
    ]),
  ]);

  return productions.map((p) => {
    const key = String(p._id);
    const sc = scenes.find((s) => String(s._id) === key);
    const approved = money.find((m) => String(m._id.p) === key && m._id.s === 'approved');
    const pending = money.find((m) => String(m._id.p) === key && m._id.s === 'submitted');
    const budget = computeBudget(p.totalBudget, approved?.approved ?? 0, pending?.requested ?? 0);
    const signals = {
      scenePct: scenePct(sc?.total ?? 0, sc?.recorded ?? 0),
      budgetPct: budget.usedPct,
      delayedMilestones: delayed.find((d) => String(d._id) === key)?.n ?? 0,
      pendingSheets: pending?.sheets ?? 0,
    };
    const stage = p.stages.find((s) => s.order === p.currentStage);
    return {
      id: key,
      title: p.title,
      format: p.format,
      genre: p.genre,
      writer: p.writer,
      director: p.director,
      channel: p.channel,
      status: p.status,
      totalEpisodes: p.totalEpisodes,
      currentStage: p.currentStage,
      stageName: stage?.name ?? '',
      scenes: { total: sc?.total ?? 0, recorded: sc?.recorded ?? 0, remaining: (sc?.total ?? 0) - (sc?.recorded ?? 0) },
      budget: { ...budget, sheets: (approved?.sheets ?? 0) + (pending?.sheets ?? 0) },
      signals,
      health: computeHealth(signals, healthThresholds),
    };
  });
}
export type PortfolioRow = Awaited<ReturnType<typeof portfolio>>[number];

function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Approved spend by category for one production, largest first. */
export async function spendByCategory(productionId: string) {
  const { Types } = await import('mongoose');
  return ExpenseSheet.aggregate<{ _id: string; approved: number }>([
    { $match: { productionId: new Types.ObjectId(productionId), status: 'approved' } },
    { $unwind: '$items' },
    { $group: { _id: '$items.category', approved: { $sum: '$items.approved' } } },
    { $sort: { approved: -1 } },
  ]);
}
