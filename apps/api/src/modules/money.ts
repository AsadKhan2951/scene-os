import { Router } from 'express';
import ExcelJS from 'exceljs';
import { Types } from 'mongoose';
import { z } from 'zod';
import {
  BUDGET_DEPARTMENTS, BUDGET_DEPARTMENT_LABELS, EXPENSE_TO_DEPARTMENT, budgetTotals, costReport, departmentBudgets, estimateLines, rateLineSchema,
  type BudgetDepartment, type RateLine,
} from '@sceneos/shared';
import { AiRun, Budget, ExpenseSheet, Production, RateCard, Schedule } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { audit } from '../lib/audit';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';
import { startRun } from '../lib/runs';
import { projectQuantities } from '../workflows/money';

/**
 * Expense and budgeting: the AI budget estimate (rate card x quantities), the producer's own
 * budget, and the cost report that sets both against approved daily expenses.
 */
export const moneyRouter = Router();

async function productionOrThrow(id: unknown) {
  const p = await Production.findById(oid(id, 'productionId')).lean();
  if (!p) throw notFound('Project');
  return p;
}

/** The budget the cost report runs against: the adopted one, else the newest. */
const workingBudget = (productionId: unknown) => Budget.findOne({ productionId }).sort({ adoptedAt: -1, createdAt: -1 }).lean();

moneyRouter.get('/:productionId/estimate', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const [budgets, rateCard] = await Promise.all([
    Budget.find({ productionId: p._id }).sort({ createdAt: -1 }).limit(6).lean(),
    RateCard.findOne({ productionId: p._id }).sort({ createdAt: -1 }).lean(),
  ]);
  const runs = await AiRun.find({ _id: { $in: budgets.map((b) => b.runId).filter(Boolean) } }).select('status').lean();
  res.json({
    production: { _id: p._id, title: p.title, currency: p.currency, country: p.country, totalBudget: p.totalBudget },
    budgets: budgets.map((b) => ({ ...b, runStatus: runs.find((r) => String(r._id) === b.runId)?.status ?? null })),
    rateCard,
  });
}));

/** Starts an AI estimate: a rate card if the project has none, then the maths. */
moneyRouter.post('/:productionId/estimate', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const { contingencyPct, redoRates } = z.object({ contingencyPct: z.number().min(0).max(30).default(10), redoRates: z.boolean().default(false) }).parse(req.body ?? {});
  setAi({ feature: 'money', action: 'estimate', productionId: String(p._id) });
  await ensureCredits('money.estimate');
  const budget = await Budget.create({ productionId: p._id, currency: p.currency ?? 'PKR', kind: 'estimate', contingencyPct });
  const run = await startRun('money.estimate', { productionId: String(p._id), budgetId: String(budget._id), redoRates }, { productionId: String(p._id), title: `Budget estimate: ${p.title}` });
  budget.set({ runId: String(run._id) });
  await budget.save();
  res.status(202).json({ budget, run });
}));

/** Prices the estimate again from the current rate card and project, with no AI (after editing rates). */
moneyRouter.post('/budgets/:id/recalculate', h(async (req, res) => {
  const budget = await Budget.findById(oid(req.params.id));
  if (!budget) throw notFound('Budget');
  if (budget.kind !== 'estimate') throw new HttpError(409, 'Only an estimate is priced from the rate card');
  const card = await RateCard.findOne({ productionId: budget.productionId }).sort({ createdAt: -1 }).lean();
  if (!card) throw new HttpError(409, 'Make an estimate first; it writes the rate card');
  const { basis, ...q } = await projectQuantities(String(budget.productionId));
  const lines = estimateLines(q, card.lines as RateLine[]);
  budget.set({ quantities: { ...q, basis }, lines, totals: budgetTotals(lines, budget.contingencyPct), currency: card.currency });
  await budget.save();
  res.json(budget);
}));

moneyRouter.put('/:productionId/rate-card', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const { lines } = z.object({ lines: z.array(rateLineSchema).min(1).max(80) }).parse(req.body);
  const card = await RateCard.findOneAndUpdate({ productionId: p._id }, { $set: { lines, estimate: false, currency: p.currency ?? 'PKR' }, $addToSet: { sources: `Edited by ${me(req).name}` } }, { new: true, sort: { createdAt: -1 }, upsert: true });
  res.json(card);
}));

const lineSchema = z.object({
  department: z.enum(BUDGET_DEPARTMENTS), item: z.string().min(1).max(160), qty: z.number().min(0).default(1), unit: z.string().max(40).default('flat'),
  low: z.number().min(0), high: z.number().min(0), note: z.string().max(300).optional(),
});

/** "Enter my own budget": department lines typed in by the producer (one figure each, so low = high). */
moneyRouter.post('/:productionId/own', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const input = z.object({
    contingencyPct: z.number().min(0).max(30).default(10),
    lines: z.array(z.object({ department: z.enum(BUDGET_DEPARTMENTS), item: z.string().max(160).optional(), amount: z.number().min(0) })).min(1).max(200),
  }).parse(req.body);
  const lines = input.lines.filter((l) => l.amount > 0).map((l) => ({ department: l.department, item: l.item || BUDGET_DEPARTMENT_LABELS[l.department], qty: 1, unit: 'flat', low: l.amount, high: l.amount, source: 'own' as const }));
  const budget = await Budget.create({ productionId: p._id, currency: p.currency ?? 'PKR', kind: 'own', contingencyPct: input.contingencyPct, lines, totals: budgetTotals(lines, input.contingencyPct) });
  res.status(201).json(budget);
}));

/** Edits a budget's lines, contingency or the exchange rates used to view it. Totals are worked out again. */
moneyRouter.patch('/budgets/:id', h(async (req, res) => {
  const input = z.object({
    lines: z.array(lineSchema.extend({ source: z.enum(['rate_card', 'actor', 'location', 'own']).default('own') })).max(300).optional(),
    contingencyPct: z.number().min(0).max(30).optional(),
    fxRates: z.array(z.object({ code: z.string().regex(/^[A-Z]{3}$/), rate: z.number().positive() })).max(8).optional(),
  }).parse(req.body);
  const budget = await Budget.findById(oid(req.params.id));
  if (!budget) throw notFound('Budget');
  budget.set(input);
  const lines = (input.lines ?? budget.lines).map((l) => ({ department: l.department as BudgetDepartment, low: l.low ?? 0, high: Math.max(l.low ?? 0, l.high ?? 0) }));
  budget.set({ totals: budgetTotals(lines, budget.contingencyPct) });
  await budget.save();
  res.json(budget);
}));

moneyRouter.delete('/budgets/:id', h(async (req, res) => {
  const budget = await Budget.findById(oid(req.params.id));
  if (!budget) throw notFound('Budget');
  if (budget.adoptedAt) throw new HttpError(409, 'This is the working budget. Adopt another one first');
  await budget.deleteOne();
  res.status(204).end();
}));

/** Makes a budget the project's working budget; the project total becomes its middle figure. Admins only. */
moneyRouter.post('/budgets/:id/adopt', requireAdmin, h(async (req, res) => {
  const budget = await Budget.findById(oid(req.params.id));
  if (!budget) throw notFound('Budget');
  const total = (budget.totals as { total?: { mid?: number } } | undefined)?.total?.mid;
  if (!total) throw new HttpError(409, 'This budget has no total yet');
  await Budget.updateMany({ productionId: budget.productionId, _id: { $ne: budget._id } }, { $set: { adoptedAt: null, adoptedBy: null } });
  budget.set({ adoptedAt: new Date(), adoptedBy: me(req).name });
  await budget.save();
  await Production.updateOne({ _id: budget.productionId }, { $set: { totalBudget: total } });
  await audit(me(req), 'budget.adopted', { productionId: budget.productionId, detail: { total, kind: budget.kind } });
  res.json(budget);
}));

/** Approved and pending spend by top-sheet department, and how many days have been shot. */
async function actuals(productionId: Types.ObjectId) {
  const rows = await ExpenseSheet.aggregate<{ _id: { status: string; category: string }; requested: number; approved: number }>([
    { $match: { productionId, status: { $in: ['approved', 'submitted'] } } },
    { $unwind: '$items' },
    { $group: { _id: { status: '$status', category: '$items.category' }, requested: { $sum: '$items.requested' }, approved: { $sum: { $ifNull: ['$items.approved', 0] } } } },
  ]);
  const actual: Partial<Record<BudgetDepartment, number>> = {};
  const pending: Partial<Record<BudgetDepartment, number>> = {};
  for (const r of rows) {
    const dept = EXPENSE_TO_DEPARTMENT[r._id.category as keyof typeof EXPENSE_TO_DEPARTMENT] ?? 'other';
    if (r._id.status === 'approved') actual[dept] = (actual[dept] ?? 0) + r.approved;
    else pending[dept] = (pending[dept] ?? 0) + r.requested;
  }
  const shotDates = await ExpenseSheet.distinct('shootDate', { productionId, status: 'approved' });
  return { actual, pending, daysShot: shotDates.length };
}

/** The cost report for one project; also read by Tracking for the overrun risk and the investor update. */
export async function report(productionId: unknown) {
  const p = await productionOrThrow(productionId);
  const [budget, schedule, spend] = await Promise.all([
    workingBudget(p._id),
    Schedule.findOne({ productionId: p._id }).sort({ status: 1, createdAt: -1 }).select('days').lean(),
    actuals(p._id as Types.ObjectId),
  ]);
  const budgets = budget ? departmentBudgets(budget.lines.map((l) => ({ department: l.department as BudgetDepartment, low: l.low ?? 0, high: l.high ?? 0 }))) : {};
  const shootDays = schedule?.days?.length || (budget?.quantities as { shootDays?: number } | undefined)?.shootDays || 0;
  const contingency = budget ? Math.round(((budget.totals as { contingency?: { low: number; high: number } })?.contingency?.low ?? 0) / 2 + ((budget.totals as { contingency?: { low: number; high: number } })?.contingency?.high ?? 0) / 2) : 0;
  const result = costReport(budgets, spend.actual, spend.pending, { daysShot: spend.daysShot, shootDays });
  return {
    production: { _id: p._id, title: p.title, currency: budget?.currency ?? p.currency, totalBudget: p.totalBudget },
    budget: budget ? { _id: budget._id, kind: budget.kind, adoptedAt: budget.adoptedAt, contingencyPct: budget.contingencyPct, contingency, fxRates: budget.fxRates, totals: budget.totals } : null,
    progress: { daysShot: spend.daysShot, shootDays },
    ...result,
  };
}

moneyRouter.get('/:productionId/cost-report', h(async (req, res) => { res.json(await report(req.params.productionId)); }));

/** The top sheet and cost report as a spreadsheet: one row per department, above the line first. */
moneyRouter.get('/:productionId/top-sheet.xlsx', h(async (req, res) => {
  const r = await report(req.params.productionId);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scene OS';
  const ws = wb.addWorksheet('Top sheet');
  ws.addRow([`${r.production.title}: top sheet and cost report`]).font = { bold: true, size: 14 };
  ws.addRow([`Currency ${r.production.currency}. ${r.progress.daysShot} of ${r.progress.shootDays || '?'} shoot days done. ${r.budget ? `Budget: ${r.budget.kind === 'own' ? 'producer\'s own' : 'AI estimate (middle of range)'}` : 'No budget yet'}.`]);
  ws.addRow([]);
  const header = ws.addRow(['Department', 'Line', 'Budget', 'Actual', 'Pending', 'Used %', 'Estimate to complete', 'Estimate at completion', 'Variance']);
  header.font = { bold: true };
  const money = '#,##0';
  for (const group of [true, false]) {
    for (const row of r.rows.filter((x) => x.aboveLine === group)) {
      ws.addRow([BUDGET_DEPARTMENT_LABELS[row.department], group ? 'Above' : 'Below', row.budget, row.actual, row.pending, row.usedPct === null ? '' : row.usedPct / 100, row.estimateToComplete, row.estimateAtCompletion, row.variance]);
    }
  }
  if (r.budget) ws.addRow([`Contingency ${r.budget.contingencyPct}%`, '', r.budget.contingency]);
  const t = ws.addRow(['Total', '', r.totals.budget + (r.budget?.contingency ?? 0), r.totals.actual, r.totals.pending, '', r.totals.estimateToComplete, r.totals.estimateAtCompletion, r.totals.variance + (r.budget?.contingency ?? 0)]);
  t.font = { bold: true };
  ws.columns.forEach((c, i) => { c.width = i === 0 ? 26 : 16; if (i >= 2 && i !== 5) c.numFmt = money; if (i === 5) c.numFmt = '0.0%'; });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="top-sheet-${r.production.title.replace(/[^\w-]+/g, '_')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));
