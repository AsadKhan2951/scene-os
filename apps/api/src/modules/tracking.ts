import { Router } from 'express';
import { z } from 'zod';
import {
  BUDGET_DEPARTMENT_LABELS, INTERNATIONAL_STAGES, POST_STAGE_LABELS, TRACKING_REPORTS, TRACKING_REPORT_LABELS, extractJsonObject, riskFlags,
  type BudgetDepartment, type PostStage, type RiskInput, type TrackingReport,
} from '@sceneos/shared';
import { healthThresholds } from '../config/env';
import { Actor, AiRun, AuditLog, CallSheet, Character, ExpenseSheet, Milestone, PostTask, Production, Report, RiskNote, Rush, Scene, Schedule, Story } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { generateJson, generateText } from '../lib/anthropic';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';
import { portfolio } from './insights.service';
import { report as costReport } from './money';

/**
 * Tracking: every project on its stage flow with risk flags from all of Scene OS, an AI
 * explanation of why a project is at risk, project reports, and the audit log.
 */
export const trackingRouter = Router();

const startOfToday = () => { const d = new Date(); d.setHours(0, 0, 0, 0); return d; };
const DAY = 86_400_000;

/** Everything the risk rules read, for one project. */
export async function riskInput(productionId: string): Promise<RiskInput> {
  const today = startOfToday();
  const [row] = await portfolio({ _id: productionId });
  if (!row) throw notFound('Project');
  const story = await Story.findOne({ productionId }).sort({ updatedAt: -1 }).select('_id').lean();
  const [schedule, cost, logged, notBroken, leads, actors, postLate, failed] = await Promise.all([
    Schedule.findOne({ productionId }).sort({ status: 1, createdAt: -1 }).select('days conflicts status').lean(),
    costReport(productionId).catch(() => null),
    ExpenseSheet.distinct('shootDate', { productionId, status: { $ne: 'draft' } }),
    story ? Scene.countDocuments({ storyId: story._id, brokenDownAt: null }) : 0,
    story ? Character.find({ storyId: story._id, role: { $in: ['lead', 'antagonist'] } }).select('name').lean() : [],
    Actor.find({ productionId }).select('character').lean(),
    PostTask.countDocuments({ productionId, status: { $ne: 'done' }, due: { $lt: today } }),
    AiRun.countDocuments({ productionId, status: 'failed', createdAt: { $gte: new Date(Date.now() - 7 * DAY) } }),
  ]);
  const s = row.signals;
  const t = healthThresholds;
  const healthReasons: RiskInput['healthReasons'] = [];
  if (s.delayedMilestones > 0) healthReasons.push({ level: 'red', text: `${s.delayedMilestones} delayed milestone${s.delayedMilestones === 1 ? '' : 's'}` });
  if (s.pendingSheets >= t.pendingAmberCount) healthReasons.push({ level: s.pendingSheets >= t.pendingRedCount ? 'red' : 'amber', text: `${s.pendingSheets} expense sheets waiting for approval` });
  if (s.budgetPct !== null && s.budgetPct >= t.budgetAmberPct) healthReasons.push({ level: s.budgetPct >= t.budgetRedPct ? 'red' : 'amber', text: `${Math.round(s.budgetPct)}% of the budget is used` });

  const budgetTotal = cost ? cost.totals.budget + (cost.budget?.contingency ?? 0) : 0;
  const days = schedule?.days ?? [];
  const firstDay = days[0]?.date ? new Date(days[0].date) : null;
  const loggedDays = new Set(logged.map((d) => new Date(d as Date).toDateString()));
  // Only an approved plan says which days were meant to be shot; a draft's dates are not a commitment.
  const passed = schedule?.status === 'approved' ? days.filter((d) => d.date && new Date(d.date) < today) : [];
  const cast = new Set(actors.map((a) => (a.character ?? '').toUpperCase()));
  return {
    healthReasons,
    costOverrunPct: cost && budgetTotal > 0 && cost.totals.actual > 0 ? ((cost.totals.estimateAtCompletion - budgetTotal) / budgetTotal) * 100 : null,
    scheduleConflicts: schedule ? schedule.conflicts.filter((c) => c.kind !== 'hold').length : null,
    scheduleApproved: schedule ? schedule.status === 'approved' : null,
    shootDaysBehind: passed.filter((d) => !loggedDays.has(new Date(d.date!).toDateString())).length,
    daysToShoot: firstDay ? Math.round((firstDay.getTime() - today.getTime()) / DAY) : null,
    scenesNotBrokenDown: notBroken,
    leadsWithoutActor: leads.filter((c) => !cast.has(c.name.toUpperCase())).length,
    postLate,
    failedAiRuns: failed,
  };
}

/** Projects on their stage flow: phase, stage, risk flags and the last explanation. */
trackingRouter.get('/flow', h(async (_req, res) => {
  const productions = await Production.find({ status: { $in: ['active', 'on_hold'] } }).select('title format status currentStage stages stageFlow country currency').sort({ createdAt: -1 }).lean();
  const notes = await RiskNote.aggregate<{ _id: unknown; summary: string; createdAt: Date }>([
    { $match: { productionId: { $in: productions.map((p) => p._id) } } },
    { $sort: { createdAt: -1 } },
    { $group: { _id: '$productionId', summary: { $first: '$summary' }, createdAt: { $first: '$createdAt' } } },
  ]);
  const rows = await Promise.all(productions.map(async (p) => {
    const risk = riskFlags(await riskInput(String(p._id)));
    const stage = p.stages.find((s) => s.order === p.currentStage);
    const international = p.stages.length === INTERNATIONAL_STAGES.length;
    const note = notes.find((n) => String(n._id) === String(p._id));
    return {
      id: String(p._id), title: p.title, format: p.format, projectStatus: p.status,
      // The six international stages are the board's columns; the 15-step serial flow is placed by its phase.
      column: international ? stage?.name ?? 'Development' : ({ pre_production: 'Pre-production', production: 'Production', post_production: 'Post-production' } as Record<string, string>)[stage?.phase ?? 'pre_production'],
      stage: { order: p.currentStage, of: p.stages.length, name: stage?.name ?? '', flow: international ? 'international' : 'pakistani_15' },
      ...risk,
      note: note ? { summary: note.summary, at: note.createdAt } : null,
    };
  }));
  res.json({ columns: INTERNATIONAL_STAGES.map((s) => s.name), rows });
}));

trackingRouter.get('/:productionId/risk', h(async (req, res) => {
  const id = String(oid(req.params.productionId, 'productionId'));
  const [risk, note] = await Promise.all([riskInput(id).then(riskFlags), RiskNote.findOne({ productionId: id }).sort({ createdAt: -1 }).lean()]);
  res.json({ ...risk, note });
}));

/** "Why at risk": the flags explained in plain words with the next actions, by AI. */
trackingRouter.post('/:productionId/why', h(async (req, res) => {
  const id = String(oid(req.params.productionId, 'productionId'));
  const p = await Production.findById(id).select('title currentStage stages').lean();
  if (!p) throw notFound('Project');
  const input = await riskInput(id);
  const risk = riskFlags(input);
  setAi({ feature: 'reports', action: 'why_at_risk', productionId: id });
  await ensureCredits('tracking.why');
  const stage = p.stages.find((s) => s.order === p.currentStage)?.name ?? '';
  const out = risk.flags.length === 0
    ? { summary: `${p.title} has no risk signals right now.`, actions: [] as { action: string; who: string; area: string }[] }
    : await generateJson('You are a seasoned executive producer. You explain risk plainly to the people who run the project and say what to do next. Use only the facts given; no invented numbers. Reply with JSON only.',
      `Project: ${p.title}, stage "${stage}".
Risk flags (worst first):
${risk.flags.map((f) => `- [${f.level}] ${f.area}: ${f.text}`).join('\n')}
Facts: ${JSON.stringify(input)}
Reply with { "summary": two or three short sentences on why the project is ${risk.status === 'at_risk' ? 'at risk' : 'needing attention'} and what it will cost if nothing changes, "actions": up to 4 items { "action": one concrete next step, "who": the role who does it (producer, line producer, first AD, casting director, post supervisor, director), "area": one of money, schedule, cast, post, milestones, approvals, script, ai } }.`,
      (raw) => z.object({ summary: z.string(), actions: z.array(z.object({ action: z.string(), who: z.string(), area: z.string() })).max(4) }).parse(extractJsonObject(raw)), undefined, 3000, 'fast');
  res.status(201).json(await RiskNote.create({ productionId: id, status: risk.status, flags: risk.flags, summary: out.summary, actions: out.actions, createdBy: me(req).name }));
}));

// ---- Reports ----
const plain = (s: string) => s.replace(/^#+\s*/gm, '').replace(/\*\*(.+?)\*\*/g, '$1').replace(/^\s*[-*]\s+/gm, '- ').trim();

async function dailyFacts(productionId: string, date: Date) {
  const from = new Date(date); from.setHours(0, 0, 0, 0);
  const to = new Date(from.getTime() + DAY);
  const [schedule, sheet, rushes, call] = await Promise.all([
    Schedule.findOne({ productionId }).sort({ status: 1, createdAt: -1 }).select('days').lean(),
    ExpenseSheet.findOne({ productionId, shootDate: { $gte: from, $lt: to } }).lean(),
    Rush.find({ productionId, shootDate: { $gte: from, $lt: to } }).select('sceneNumber take circled').lean(),
    CallSheet.findOne({ productionId, shootDate: { $gte: from, $lt: to } }).lean(),
  ]);
  const day = schedule?.days.find((d) => d.date && new Date(d.date) >= from && new Date(d.date) < to);
  const planned = day ? await Scene.find({ _id: { $in: day.sceneIds } }).select('number heading').lean() : [];
  const shotScenes = [...new Set(rushes.map((r) => r.sceneNumber))];
  return {
    date: from.toDateString(),
    plannedDay: day ? { number: day.number, location: day.locationName, scenes: planned.map((s) => s.number), pagesEighths: day.eighths } : null,
    shot: { scenes: shotScenes, notShot: planned.map((s) => s.number).filter((n) => !shotScenes.includes(n)), takes: rushes.length, circled: rushes.filter((r) => r.circled).length },
    callSheet: call ? { status: call.status, location: call.location, entries: call.entries.length } : null,
    spend: sheet ? { status: sheet.status, requested: sheet.items.reduce((n, i) => n + (i.requested ?? 0), 0), approved: sheet.items.reduce((n, i) => n + (i.approved ?? 0), 0) } : null,
  };
}

trackingRouter.get('/:productionId/reports', h(async (req, res) => {
  const id = oid(req.params.productionId, 'productionId');
  res.json(await Report.find({ productionId: id }).sort({ createdAt: -1 }).limit(30).lean());
}));

trackingRouter.post('/:productionId/reports', h(async (req, res) => {
  const id = String(oid(req.params.productionId, 'productionId'));
  const { type, date } = z.object({ type: z.enum(TRACKING_REPORTS), date: z.coerce.date().optional() }).parse(req.body);
  const p = await Production.findById(id).select('title currency').lean();
  if (!p) throw notFound('Project');
  const title = `${TRACKING_REPORT_LABELS[type as TrackingReport]}: ${p.title}`;
  let content: string;
  if (type === 'cost_summary') {
    // Plain figures, no AI: the cost report written out.
    const c = await costReport(id);
    const m = (n: number) => `${c.production.currency} ${Math.round(n).toLocaleString('en-US')}`;
    content = [
      `${p.title}: cost report, ${new Date().toDateString()}`,
      `${c.progress.daysShot} of ${c.progress.shootDays || '?'} shoot days done.${c.burnPerShootDay ? ` Burn ${m(c.burnPerShootDay)} a shoot day.` : ''}`,
      `Budget ${m(c.totals.budget + (c.budget?.contingency ?? 0))} (with contingency). Spent ${m(c.totals.actual)}, waiting for approval ${m(c.totals.pending)}.`,
      `Estimate to complete ${m(c.totals.estimateToComplete)}; estimate at completion ${m(c.totals.estimateAtCompletion)}.`,
      '', 'By department:',
      ...c.rows.map((r) => `- ${BUDGET_DEPARTMENT_LABELS[r.department as BudgetDepartment]}: budget ${m(r.budget)}, spent ${m(r.actual)}${r.usedPct === null ? '' : ` (${r.usedPct}%)`}, at completion ${m(r.estimateAtCompletion)}${r.variance < 0 ? `, OVER by ${m(-r.variance)}` : ''}`),
    ].join('\n');
  } else {
    setAi({ feature: 'reports', action: type, productionId: id });
    await ensureCredits('tracking.report');
    if (type === 'daily_production') {
      const facts = await dailyFacts(id, date ?? new Date());
      if (!facts.plannedDay && !facts.shot.takes && !facts.spend) throw new HttpError(409, `Nothing was planned or logged for ${facts.date}`);
      content = plain(await generateText('You are a first assistant director writing the daily production report (DPR). Use only the facts given. Plain text, short lines, no markdown. Sections on their own lines: Day, Planned, Shot, Not shot and why unknown, Takes, Spend, Notes for tomorrow.',
        `Project ${p.title}. Amounts are in ${p.currency ?? 'PKR'}. Facts for ${facts.date}: ${JSON.stringify(facts)}`, 1500, 'fast'));
    } else {
      const [c, input, milestones, post] = await Promise.all([
        costReport(id),
        riskInput(id),
        Milestone.find({ productionId: id, status: { $ne: 'completed' } }).sort({ dueDate: 1 }).limit(6).select('title dueDate status').lean(),
        PostTask.find({ productionId: id }).select('episodeNumber stage status due').lean(),
      ]);
      const risk = riskFlags(input);
      const postDone = post.filter((t) => t.status === 'done');
      const facts = {
        progress: c.progress, money: { currency: c.production.currency, ...c.totals, contingency: c.budget?.contingency ?? 0, burnPerShootDay: c.burnPerShootDay },
        risk: risk.flags, milestones: milestones.map((x) => ({ title: x.title, due: x.dueDate, status: x.status })),
        post: post.length ? { tasks: post.length, done: postDone.length, latestDone: postDone.slice(-3).map((t) => `ep ${t.episodeNumber} ${POST_STAGE_LABELS[t.stage as PostStage]}`) } : null,
      };
      content = plain(await generateText('You write the weekly update a producer sends to investors: honest, calm, specific. Use only the facts given; never invent numbers. Plain text, no markdown, section names on their own lines: Headline, Progress, Money, Risks and what we are doing, Next week.',
        `Project ${p.title}, week ending ${new Date().toDateString()}. Facts: ${JSON.stringify(facts)}`, 2500));
    }
  }
  res.status(201).json(await Report.create({ type, productionId: id, title, content, createdBy: me(req).name }));
}));

// ---- Audit log ----
trackingRouter.get('/audit', requireAdmin, h(async (req, res) => {
  const q = z.object({
    productionId: z.string().regex(/^[a-f0-9]{24}$/i).optional(), action: z.string().max(80).optional(), by: z.string().max(120).optional(),
    before: z.coerce.date().optional(), limit: z.coerce.number().int().min(1).max(200).default(50),
  }).parse(req.query);
  const filter: Record<string, unknown> = {
    ...(q.productionId ? { productionId: q.productionId } : {}), ...(q.action ? { action: q.action } : {}),
    ...(q.by ? { by: q.by } : {}), ...(q.before ? { createdAt: { $lt: q.before } } : {}),
  };
  const [rows, actions, people] = await Promise.all([
    AuditLog.find(filter).sort({ createdAt: -1 }).limit(q.limit).lean(),
    AuditLog.distinct('action'),
    AuditLog.distinct('by'),
  ]);
  const productions = await Production.find({ _id: { $in: [...new Set(rows.map((r) => String(r.productionId ?? '')).filter(Boolean))] } }).select('title').lean();
  res.json({
    rows: rows.map((r) => ({ ...r, production: productions.find((p) => String(p._id) === String(r.productionId))?.title ?? null })),
    actions: (actions as string[]).sort(), people: (people as string[]).filter(Boolean).sort(),
    next: rows.length === q.limit ? rows.at(-1)?.createdAt : null,
  });
}));
