import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { BREAKDOWN_CATEGORIES, BREAKDOWN_LABELS, INTERNATIONAL_STAGES } from '@sceneos/shared';
import { Actor, AiRun, CallSheet, Character, ExpenseSheet, Location, PostTask, Production, Scene, Schedule, Story } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { audit } from '../lib/audit';
import { generateText } from '../lib/anthropic';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';
import { startRun } from '../lib/runs';
import { dayOutOfDays, evaluate, plan, type CastDates, type PlanScene } from '../lib/schedule/solver';

/**
 * Production: breakdown, locations grouped from the script, and the shoot plan (stripboard,
 * actor dates, day-out-of-days, call sheet from a day). Works on the story linked to a project.
 */
export const productionRouter = Router();

const PHASE_LABELS = { pre_production: 'Pre-production', production: 'Production', post_production: 'Post-production' } as const;

async function storyOf(productionId: string) {
  const story = await Story.findOne({ productionId }).sort({ updatedAt: -1 }).lean();
  if (!story) throw new HttpError(409, 'Link a story with a script to this project first (Script Director, Intake)');
  return story;
}

/** One run of a kind per story at a time; a second click would pay twice for the same work. */
async function notAlreadyRunning(storyId: string, type: string) {
  // A run waiting for an answer does not block a fresh start; a queued one older than 3 hours was lost.
  if (await AiRun.exists({ storyId, type, status: { $in: ['queued', 'running'] }, updatedAt: { $gt: new Date(Date.now() - 3 * 3600_000) } })) throw new HttpError(409, 'This is already running. Wait for it to finish');
}

/** Everything the Breakdown, Locations and Shoot plan screens need for a project. */
productionRouter.get('/:productionId/overview', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  const story = await Story.findOne({ productionId }).sort({ updatedAt: -1 }).select('title stats').lean();
  const [scenes, locations, runs] = story ? await Promise.all([
    Scene.find({ storyId: story._id }).sort({ number: 1 }).lean(),
    Location.find({ productionId }).sort({ status: -1, createdAt: 1 }).lean(),
    AiRun.find({ storyId: String(story._id), type: { $in: ['script.breakdown', 'script.locations'] } }).sort({ createdAt: -1 }).limit(6).select('type status createdAt').lean(),
  ]) : [[], await Location.find({ productionId }).lean(), []];
  const latest = (type: string) => runs.find((r) => r.type === type) ?? null;
  const schedule = await Schedule.findOne({ productionId }).sort({ status: 1, createdAt: -1 }).select('days.number').lean();
  res.json({ story, scenes, locations, breakdownRun: latest('script.breakdown'), locationsRun: latest('script.locations'), shootDays: schedule?.days?.length ?? null });
}));

productionRouter.post('/:productionId/breakdown', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  const story = await storyOf(productionId);
  if (!(await Scene.exists({ storyId: story._id }))) throw new HttpError(409, 'Import the script first so its scenes are known');
  const { redo } = z.object({ redo: z.boolean().default(false) }).parse(req.body ?? {});
  await notAlreadyRunning(String(story._id), 'script.breakdown');
  setAi({ feature: 'production', action: 'breakdown', productionId, storyId: String(story._id) });
  const count = redo ? await Scene.countDocuments({ storyId: story._id }) : await Scene.countDocuments({ storyId: story._id, brokenDownAt: null });
  if (!count) throw new HttpError(409, 'Every scene is already broken down');
  await ensureCredits('production.breakdown', Math.max(1, count / 20));
  // Only after the credit check: a refused redo must not leave scenes marked as not broken down.
  if (redo) await Scene.updateMany({ storyId: story._id }, { $set: { brokenDownAt: null } });
  res.status(202).json(await startRun('script.breakdown', { storyId: String(story._id) }, { productionId, storyId: String(story._id), multiplier: Math.max(1, count / 20) }));
}));

productionRouter.post('/:productionId/locations/group', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  const story = await storyOf(productionId);
  await notAlreadyRunning(String(story._id), 'script.locations');
  setAi({ feature: 'locations', action: 'group', productionId, storyId: String(story._id) });
  await ensureCredits('production.locations');
  res.status(202).json(await startRun('script.locations', { storyId: String(story._id), productionId }, { productionId, storyId: String(story._id) }));
}));

productionRouter.post('/locations/:id/board', h(async (req, res) => {
  const loc = await Location.findById(oid(req.params.id)).lean();
  if (!loc) throw notFound('Location');
  setAi({ feature: 'locations', action: 'board', productionId: String(loc.productionId) });
  await ensureCredits('production.board');
  res.status(202).json(await startRun('location.board', { locationId: String(loc._id) }, { productionId: String(loc.productionId), storyId: loc.storyId ? String(loc.storyId) : undefined, title: `Art board: ${loc.name}` }));
}));

productionRouter.patch('/locations/:id/logistics', h(async (req, res) => {
  const input = z.object({ contact: z.string().max(300), power: z.string().max(300), unitBase: z.string().max(300), nearestHospital: z.string().max(300), shootDays: z.string().max(300) }).partial().parse(req.body);
  const loc = await Location.findById(oid(req.params.id));
  if (!loc) throw notFound('Location');
  loc.set({ logistics: { ...(loc.logistics ?? {}), ...input } });
  await loc.save();
  res.json(loc);
}));

/** Edit a scene's breakdown by hand. */
productionRouter.patch('/scenes/:id', h(async (req, res) => {
  const input = z.object({
    synopsis: z.string().max(500).optional(),
    elements: z.array(z.object({ category: z.enum(BREAKDOWN_CATEGORIES), name: z.string().min(1).max(200), qty: z.number().int().positive().optional() })).max(100).optional(),
    locationId: z.string().regex(/^[a-f0-9]{24}$/i).nullable().optional(),
  }).parse(req.body);
  const scene = await Scene.findByIdAndUpdate(oid(req.params.id), input, { new: true });
  if (!scene) throw notFound('Scene');
  res.json(scene);
}));

/** Breakdown sheets as a spreadsheet: one row per scene, one column per category. */
productionRouter.get('/:productionId/breakdown.xlsx', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  const story = await storyOf(productionId);
  const scenes = await Scene.find({ storyId: story._id }).sort({ number: 1 }).lean();
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scene OS';
  const ws = wb.addWorksheet('Breakdown');
  ws.columns = ['Scene', 'Heading', 'Pages', 'Synopsis', ...BREAKDOWN_CATEGORIES.map((c) => BREAKDOWN_LABELS[c])].map((header) => ({ header, width: header === 'Synopsis' || header === 'Heading' ? 40 : 18 }));
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const s of scenes) {
    const pages = `${Math.floor(s.eighths / 8) || ''}${s.eighths % 8 ? ` ${s.eighths % 8}/8` : ''}`.trim();
    ws.addRow([s.number, s.heading, pages, s.synopsis ?? '', ...BREAKDOWN_CATEGORIES.map((c) => s.elements.filter((e) => e.category === c).map((e) => (e.qty ? `${e.name} x${e.qty}` : e.name)).join(', '))]);
  }
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="breakdown-${story.title.replace(/[^\w-]+/g, '_')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// ---- Shoot plan ----

/** The scenes as the planner sees them, and who plays whom with their booked dates. */
async function planInputs(productionId: string, storyId: unknown) {
  const [scenes, locations, characters, actors] = await Promise.all([
    Scene.find({ storyId }).sort({ number: 1 }).lean(),
    Location.find({ productionId }).select('name').lean(),
    Character.find({ storyId }).select('name').lean(),
    Actor.find({ productionId }).lean(),
  ]);
  const locName = new Map(locations.map((l) => [String(l._id), l.name]));
  const planScenes: PlanScene[] = scenes.map((s) => ({
    id: String(s._id), number: s.number, location: (s.locationId && locName.get(String(s.locationId))) || s.location || 'UNKNOWN',
    time: s.time ?? '', eighths: s.eighths || 1,
    cast: [...new Set([...s.characters, ...s.elements.filter((e) => e.category === 'cast').map((e) => e.name)].map((n) => n.toUpperCase()))],
  }));
  const cast: CastDates = new Map();
  const names = new Set([...characters.map((c) => c.name.toUpperCase()), ...planScenes.flatMap((s) => s.cast)]);
  for (const name of names) {
    const actor = actors.find((a) => (a.character ?? '').toUpperCase() === name);
    cast.set(name, { actor: actor?.name ?? '', blocks: (actor?.availability ?? []).map((b) => ({ start: b.start, end: b.end, kind: b.kind as 'booked' | 'hold' | 'unavailable', note: b.note ?? undefined })) });
  }
  return { planScenes, cast };
}

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/**
 * The production timeline above the stripboard: each stage of the project's flow with its dates
 * and progress. Shoot dates come from this plan, post dates from the post schedule.
 */
async function timeline(productionId: string, days: { date?: Date | null }[]) {
  const [production, shot, post] = await Promise.all([
    Production.findById(productionId).select('stages currentStage').lean(),
    ExpenseSheet.distinct('shootDate', { productionId, status: { $ne: 'draft' } }),
    PostTask.find({ productionId }).select('start due status').lean(),
  ]);
  if (!production) return [];
  const shootFrom = days[0]?.date ?? null;
  const shootTo = days.at(-1)?.date ?? null;
  const shotDays = days.filter((d) => d.date && shot.some((x) => sameDay(new Date(x as Date), new Date(d.date!)))).length;
  const postFrom = post.reduce((m: Date | null, t) => (t.start && (!m || t.start < m) ? t.start : m), null as Date | null);
  const postTo = post.reduce((m: Date | null, t) => (t.due && (!m || t.due > m) ? t.due : m), null as Date | null);
  const postDone = post.length ? post.filter((t) => t.status === 'done').length / post.length : null;
  const international = production.stages.length === INTERNATIONAL_STAGES.length;
  // The 15-step serial flow is shown by its three phases.
  const groups = international
    ? production.stages.map((s) => ({ name: s.name, stages: [s] }))
    : (['pre_production', 'production', 'post_production'] as const).map((ph) => ({ name: PHASE_LABELS[ph], stages: production.stages.filter((s) => s.phase === ph) }));
  return groups.filter((g) => g.stages.length).map((g) => {
    const done = g.stages.filter((s) => s.status === 'completed').length;
    const current = g.stages.some((s) => s.order === production.currentStage);
    const isShoot = /^production$/i.test(g.name);
    const isPost = /^post/i.test(g.name);
    const progress = isShoot && days.length ? shotDays / days.length : isPost && postDone !== null ? postDone : done / g.stages.length;
    return {
      name: g.name, current,
      from: isShoot ? shootFrom : isPost ? postFrom : g.stages[0].startedAt ?? null,
      to: isShoot ? shootTo : isPost ? postTo : g.stages.at(-1)!.completedAt ?? null,
      progress: Math.round(Math.min(1, progress) * 100) / 100,
      ...(isShoot ? { shootDays: days.length, shotDays } : {}),
    };
  });
}

const scheduleView = async (schedule: InstanceType<typeof Schedule> | null) => {
  if (!schedule) return null;
  const { planScenes, cast } = await planInputs(String(schedule.productionId), schedule.storyId);
  const result = evaluate(schedule.days.map((d) => ({ locationName: d.locationName ?? '', sceneIds: d.sceneIds.map(String), companyMove: d.companyMove })), planScenes, cast, { startDate: schedule.startDate, daysOff: schedule.daysOff });
  const characters = await Character.find({ storyId: schedule.storyId }).select('name role').lean();
  const today = new Date();
  // Each person's booked dates and whether this plan clashes with them: Conflict, Hold or Clear.
  const dood = dayOutOfDays(result, planScenes, cast).map((r) => {
    const mine = result.conflicts.filter((c) => c.character === r.character);
    return {
      ...r,
      role: characters.find((c) => c.name.toUpperCase() === r.character)?.role ?? null,
      blocks: (cast.get(r.character)?.blocks ?? []).map((b) => ({ start: b.start, end: b.end, kind: b.kind, note: b.note ?? null })),
      dateStatus: mine.some((c) => c.kind !== 'hold') ? 'conflict' : mine.length ? 'hold' : 'clear',
    };
  });
  return {
    schedule, scenes: planScenes, dood,
    today: schedule.days.find((d) => d.date && sameDay(new Date(d.date), today))?.number ?? null,
    timeline: await timeline(String(schedule.productionId), schedule.days),
  };
};

productionRouter.get('/:productionId/schedule', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  res.json(await scheduleView(await Schedule.findOne({ productionId }).sort({ createdAt: -1 })));
}));

/** Builds a new shoot plan from the scenes, locations and actor dates. Replaces the draft. */
productionRouter.post('/:productionId/schedule', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  const input = z.object({
    startDate: z.coerce.date(),
    daysOff: z.array(z.number().int().min(0).max(6)).max(6).default([]),
    maxEighthsPerDay: z.number().int().min(8).max(120).default(40),
    explain: z.boolean().default(true),
  }).parse(req.body);
  const story = await storyOf(productionId);
  const { planScenes, cast } = await planInputs(productionId, story._id);
  if (!planScenes.length) throw new HttpError(409, 'Import the script first so its scenes are known');
  const result = plan(planScenes, cast, input);
  let explanation: string | undefined;
  // The explanation is a nice extra: if the AI is unavailable or out of credit, the plan is still saved.
  if (input.explain) try {
    setAi({ feature: 'production', action: 'explain', productionId });
    await ensureCredits('production.explain');
    const production = await Production.findById(productionId).select('title').lean();
    explanation = await generateText(
      'You are a first assistant director explaining a shoot schedule to the producer in three short plain lines. Use only the numbers given. No markdown.',
      `Project: ${production?.title}. ${result.stats.days} shoot days, ${result.stats.companyMoves} company moves, ${result.stats.holdingDays} actor holding days, ${result.conflicts.filter((c) => c.kind !== 'hold').length} date conflicts left, ${result.conflicts.filter((c) => c.kind === 'hold').length} on holds.
Days: ${result.days.map((d) => `day ${d.number} ${d.locationName} (${d.sceneIds.length} scenes)`).join('; ')}.
Conflicts: ${result.conflicts.map((c) => `day ${c.day} ${c.character} (${c.actor || 'no actor yet'}) ${c.kind}${c.note ? `, ${c.note}` : ''}`).join('; ') || 'none'}.`,
      1500, 'fast',
    );
  } catch (err) {
    console.warn('Shoot plan explanation skipped:', err instanceof Error ? err.message : err);
  }
  await Schedule.deleteMany({ productionId, status: 'draft' });
  const schedule = await Schedule.create({ productionId, storyId: story._id, ...input, days: result.days, conflicts: result.conflicts, stats: result.stats, explanation });
  await audit(me(req), 'schedule.planned', { productionId, detail: result.stats });
  res.status(201).json(await scheduleView(schedule));
}));

/** A manual change on the stripboard: the new order of days and scenes. Dates and actor conflicts are checked again. */
productionRouter.patch('/schedules/:id/days', h(async (req, res) => {
  const { days } = z.object({ days: z.array(z.object({ locationName: z.string().max(300), sceneIds: z.array(z.string().regex(/^[a-f0-9]{24}$/i)).max(200) })).max(500) }).parse(req.body);
  const schedule = await Schedule.findById(oid(req.params.id));
  if (!schedule) throw notFound('Schedule');
  const { planScenes, cast } = await planInputs(String(schedule.productionId), schedule.storyId);
  const result = evaluate(days.filter((d) => d.sceneIds.length), planScenes, cast, { startDate: schedule.startDate, daysOff: schedule.daysOff });
  schedule.set({ days: result.days, conflicts: result.conflicts, stats: result.stats, status: 'draft', approvedBy: null, approvedAt: null });
  await schedule.save();
  res.json(await scheduleView(schedule));
}));

productionRouter.post('/schedules/:id/approve', requireAdmin, h(async (req, res) => {
  const schedule = await Schedule.findById(oid(req.params.id));
  if (!schedule) throw notFound('Schedule');
  // One approved plan per project: the one approved before goes back to draft.
  await Schedule.updateMany({ productionId: schedule.productionId, _id: { $ne: schedule._id }, status: 'approved' }, { $set: { status: 'draft' } });
  schedule.set({ status: 'approved', approvedBy: me(req).name, approvedAt: new Date() });
  await schedule.save();
  await audit(me(req), 'schedule.approved', { productionId: schedule.productionId, detail: schedule.stats });
  res.json(await scheduleView(schedule));
}));

productionRouter.put('/schedules/:id/itinerary', h(async (req, res) => {
  const { items } = z.object({ items: z.array(z.object({ day: z.number().int().positive(), time: z.string().max(20).default(''), title: z.string().min(1).max(200), detail: z.string().max(500).default('') })).max(200) }).parse(req.body);
  const schedule = await Schedule.findByIdAndUpdate(oid(req.params.id), { itinerary: items.sort((a, b) => a.day - b.day || a.time.localeCompare(b.time)) }, { new: true });
  if (!schedule) throw notFound('Schedule');
  res.json(await scheduleView(schedule));
}));

/** A draft call sheet for one shoot day: its scenes, and the actors in them. */
productionRouter.post('/schedules/:id/days/:number/callsheet', h(async (req, res) => {
  const schedule = await Schedule.findById(oid(req.params.id));
  if (!schedule) throw notFound('Schedule');
  const day = schedule.days.find((d) => d.number === Number(req.params.number));
  if (!day) throw notFound('Shoot day');
  const { planScenes, cast } = await planInputs(String(schedule.productionId), schedule.storyId);
  const scenes = planScenes.filter((s) => day.sceneIds.map(String).includes(s.id));
  const characters = [...new Set(scenes.flatMap((s) => s.cast))];
  // Pressing it again refreshes the draft for that day instead of making a second sheet; a published sheet is never touched.
  const existing = await CallSheet.findOne({ productionId: schedule.productionId, shootDate: day.date });
  if (existing?.status === 'published') throw new HttpError(409, 'The call sheet for this day is already published. Change it in Call sheets');
  if (existing) await existing.deleteOne();
  const sheet = await CallSheet.create({
    productionId: schedule.productionId, shootDate: day.date, shootDay: day.number, location: day.locationName, status: 'draft',
    entries: [
      ...scenes.map((s, i) => ({ type: 'scene', name: `Sc ${s.number}`, role: `${s.location}, ${s.time}`, order: i })),
      ...characters.map((c, i) => ({ type: 'cast', name: cast.get(c)?.actor || c, role: c, order: 100 + i })),
    ],
  });
  res.status(201).json(sheet);
}));
