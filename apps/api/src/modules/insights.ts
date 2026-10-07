import { Router } from 'express';
import { healthThresholds } from '../config/env';
import { CallSheet, Episode, ExpenseSheet } from '../models';
import { h, oid } from '../lib/http';
import { portfolio, spendByCategory } from './insights.service';

export const insightsRouter = Router();

/** Active and on-hold productions with scenes, budget and health. */
insightsRouter.get('/portfolio', h(async (_req, res) => {
  res.json(await portfolio({ status: { $in: ['active', 'on_hold'] } }));
}));

insightsRouter.get('/health', h(async (_req, res) => {
  const rows = await portfolio({ status: { $in: ['active', 'on_hold'] } });
  const order = { at_risk: 0, needs_attention: 1, on_track: 2 };
  rows.sort((a, b) => order[a.health.status] - order[b.health.status]);
  res.json({ thresholds: healthThresholds, rows });
}));

/** What the command centre shows first: decisions waiting, today's shoot, this week's deliveries. */
insightsRouter.get('/command-centre', h(async (_req, res) => {
  const start = new Date(); start.setHours(0, 0, 0, 0);
  const end = new Date(start); end.setDate(end.getDate() + 1);
  const week = new Date(start); week.setDate(week.getDate() + 7);
  const [rows, pending, today, drafts, airing] = await Promise.all([
    portfolio({ status: { $in: ['active', 'on_hold'] } }),
    ExpenseSheet.find({ status: 'submitted' }).sort({ submittedAt: 1 }).populate('productionId', 'title').lean(),
    CallSheet.find({ shootDate: { $gte: start, $lt: end } }).populate('productionId', 'title').lean(),
    CallSheet.find({ status: 'draft', shootDate: { $gte: end } }).sort({ shootDate: 1 }).limit(3).populate('productionId', 'title').lean(),
    Episode.find({ airDate: { $gte: start, $lt: week } }).sort({ airDate: 1 }).populate('productionId', 'title').lean(),
  ]);
  res.json({ portfolio: rows, pendingSheets: pending, shootsToday: today, draftCallSheets: drafts, airingThisWeek: airing });
}));

insightsRouter.get('/budget', h(async (_req, res) => {
  const rows = await portfolio({ status: { $in: ['active', 'on_hold'] } });
  const sum = (pick: (r: (typeof rows)[number]) => number) => rows.reduce((total, r) => total + pick(r), 0);
  const budget = sum((r) => r.budget.budget);
  const approved = sum((r) => r.budget.approved);
  res.json({
    totals: { budget, approved, pending: sum((r) => r.budget.pending), remaining: budget - approved, usedPct: budget > 0 ? (approved / budget) * 100 : null },
    highBurn: rows.filter((r) => (r.budget.usedPct ?? 0) >= healthThresholds.budgetAmberPct).map((r) => r.id),
    rows,
  });
}));

/** Category split and a simple shoot-cost forecast for one production. */
insightsRouter.get('/budget/:productionId', h(async (req, res) => {
  const id = oid(req.params.productionId, 'productionId');
  const [row] = await portfolio({ _id: id });
  const categories = await spendByCategory(id);
  const costPerScene = row && row.scenes.recorded > 0 ? row.budget.approved / row.scenes.recorded : null;
  res.json({
    row,
    categories,
    forecast: costPerScene === null || !row ? null : {
      costPerScene,
      scenesLeft: row.scenes.remaining,
      costToFinish: costPerScene * row.scenes.remaining,
      leftAfterShoot: row.budget.remaining - costPerScene * row.scenes.remaining,
    },
  });
}));
