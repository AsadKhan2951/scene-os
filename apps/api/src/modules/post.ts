import { Router } from 'express';
import { z } from 'zod';
import { POST_STAGES, POST_TASK_STATUSES, postSchedule } from '@sceneos/shared';
import { EditVersion, PostTask, Production, Rush, Schedule } from '../models';
import { me } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { fcpXml, otio, type TimelineInput } from '../lib/premiere';

/**
 * Post: rushes logged per scene and take (circled takes, review comments at a timecode), edit
 * versions per episode, the post schedule, and timelines the editor opens in Premiere Pro.
 */
export const postRouter = Router();

async function productionOrThrow(id: unknown) {
  const p = await Production.findById(oid(id, 'productionId')).select('title totalEpisodes').lean();
  if (!p) throw notFound('Project');
  return p;
}

// ---- Rushes ----
const rushSchema = z.object({
  episodeNumber: z.number().int().positive().optional(),
  sceneNumber: z.number().int().positive(),
  take: z.number().int().positive(),
  camera: z.string().min(1).max(4).default('A'),
  clipName: z.string().min(1).max(200),
  shootDate: z.coerce.date().optional(),
  durationSeconds: z.number().positive().max(36_000).optional(),
  fps: z.number().positive().max(120).default(25),
  circled: z.boolean().default(false),
  url: z.string().url().optional(),
  uploadPct: z.number().min(0).max(100).optional(),
  notes: z.string().max(1000).optional(),
});

postRouter.get('/:productionId/rushes', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const q = z.object({ episode: z.coerce.number().int().optional(), scene: z.coerce.number().int().optional() }).parse(req.query);
  const rushes = await Rush.find({ productionId: p._id, ...(q.episode ? { episodeNumber: q.episode } : {}), ...(q.scene ? { sceneNumber: q.scene } : {}) })
    .sort({ episodeNumber: 1, sceneNumber: 1, take: 1, camera: 1 }).limit(2000).lean();
  // One summary row per scene: takes, circled takes and how much is uploaded.
  const scenes = new Map<string, { episodeNumber: number | null; sceneNumber: number; takes: number; circled: number; uploadPct: number; comments: number }>();
  for (const r of rushes) {
    const key = `${r.episodeNumber ?? ''}:${r.sceneNumber}`;
    const s = scenes.get(key) ?? { episodeNumber: r.episodeNumber ?? null, sceneNumber: r.sceneNumber, takes: 0, circled: 0, uploadPct: 0, comments: 0 };
    s.takes++; if (r.circled) s.circled++; s.uploadPct += r.url ? 100 : r.uploadPct ?? 0; s.comments += r.comments.length;
    scenes.set(key, s);
  }
  res.json({ rushes, scenes: [...scenes.values()].map((s) => ({ ...s, uploadPct: Math.round(s.uploadPct / Math.max(1, s.takes)) })) });
}));

/** Logs one take, or many from a camera report. */
postRouter.post('/:productionId/rushes', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const { rows } = z.object({ rows: z.array(rushSchema).min(1).max(500) }).parse(Array.isArray(req.body?.rows) ? req.body : { rows: [req.body] });
  const created = await Rush.insertMany(rows.map((r) => ({ ...r, productionId: p._id, uploadPct: r.url ? 100 : r.uploadPct ?? 0 })));
  res.status(201).json(created);
}));

postRouter.patch('/rushes/:id', h(async (req, res) => {
  const input = rushSchema.partial().parse(req.body);
  const rush = await Rush.findByIdAndUpdate(oid(req.params.id), { $set: { ...input, ...(input.url ? { uploadPct: 100 } : {}) } }, { new: true }).lean();
  if (!rush) throw notFound('Take');
  res.json(rush);
}));

postRouter.post('/rushes/:id/comments', h(async (req, res) => {
  const { text, seconds } = z.object({ text: z.string().min(1).max(1000), seconds: z.number().min(0).max(36_000).default(0) }).parse(req.body);
  const rush = await Rush.findByIdAndUpdate(oid(req.params.id), { $push: { comments: { by: me(req).name, text, seconds } } }, { new: true }).lean();
  if (!rush) throw notFound('Take');
  res.status(201).json(rush);
}));

postRouter.delete('/rushes/:id/comments/:commentId', h(async (req, res) => {
  await Rush.updateOne({ _id: oid(req.params.id) }, { $pull: { comments: { _id: oid(req.params.commentId) } } });
  res.status(204).end();
}));

postRouter.delete('/rushes/:id', h(async (req, res) => {
  await Rush.deleteOne({ _id: oid(req.params.id) });
  res.status(204).end();
}));

/** A scene's takes as a timeline: circled takes only when any are circled, in take order, with comments as markers. */
async function sceneTimeline(productionId: unknown, sceneNumber: number, episode?: number): Promise<TimelineInput> {
  const p = await productionOrThrow(productionId);
  const all = await Rush.find({ productionId: p._id, sceneNumber, ...(episode ? { episodeNumber: episode } : {}) }).sort({ take: 1, camera: 1 }).lean();
  if (!all.length) throw new HttpError(404, 'No takes are logged for this scene');
  const takes = all.some((r) => r.circled) ? all.filter((r) => r.circled) : all;
  return {
    name: `${p.title} ${episode ? `ep ${episode} ` : ''}sc ${sceneNumber} ${all.some((r) => r.circled) ? 'circled takes' : 'all takes'}`,
    fps: takes[0].fps ?? 25,
    clips: takes.map((r) => ({
      name: r.clipName, seconds: r.durationSeconds ?? 30, url: r.url, label: `Sc ${r.sceneNumber} T${r.take} ${r.camera}`,
      markers: r.comments.map((c) => ({ seconds: c.seconds ?? 0, text: c.text ?? '', by: c.by ?? undefined })),
    })),
  };
}

const fileName = (t: TimelineInput, ext: string) => `${t.name.replace(/[^\w-]+/g, '_')}.${ext}`;

postRouter.get('/:productionId/scenes/:scene/premiere.xml', h(async (req, res) => {
  const episode = req.query.episode ? Number(req.query.episode) : undefined;
  const t = await sceneTimeline(req.params.productionId, Number(req.params.scene), episode);
  res.setHeader('Content-Type', 'application/xml');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(t, 'xml')}"`);
  res.send(fcpXml(t));
}));

postRouter.get('/:productionId/scenes/:scene/timeline.otio', h(async (req, res) => {
  const episode = req.query.episode ? Number(req.query.episode) : undefined;
  const t = await sceneTimeline(req.params.productionId, Number(req.params.scene), episode);
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', `attachment; filename="${fileName(t, 'otio')}"`);
  res.send(JSON.stringify(otio(t), null, 2));
}));

// ---- Edit versions ----
postRouter.get('/:productionId/versions', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  res.json(await EditVersion.find({ productionId: p._id }).sort({ episodeNumber: 1, version: -1 }).limit(500).lean());
}));

postRouter.post('/:productionId/versions', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const input = z.object({
    episodeNumber: z.number().int().positive(), stage: z.enum(POST_STAGES).default('assembly'), name: z.string().max(120).optional(),
    url: z.string().url().optional(), projectFile: z.string().max(300).optional(), durationSeconds: z.number().positive().optional(), notes: z.string().max(2000).optional(),
  }).parse(req.body);
  const last = await EditVersion.findOne({ productionId: p._id, episodeNumber: input.episodeNumber }).sort({ version: -1 }).select('version').lean();
  res.status(201).json(await EditVersion.create({ ...input, productionId: p._id, version: (last?.version ?? 0) + 1, createdBy: me(req).name }));
}));

postRouter.delete('/versions/:id', h(async (req, res) => {
  await EditVersion.deleteOne({ _id: oid(req.params.id) });
  res.status(204).end();
}));

// ---- Post schedule ----
const today = () => { const d = new Date(); d.setUTCHours(0, 0, 0, 0); return d; };

postRouter.get('/:productionId/post-schedule', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const tasks = await PostTask.find({ productionId: p._id }).sort({ episodeNumber: 1, start: 1 }).lean();
  const now = today();
  res.json({
    episodes: p.totalEpisodes,
    tasks: tasks.map((t) => ({ ...t, late: t.status !== 'done' && !!t.due && t.due < now })),
  });
}));

/**
 * Builds the post schedule from the end of the shoot (or a given date). Tasks already started or
 * done keep their dates; the rest are planned again.
 */
postRouter.post('/:productionId/post-schedule', h(async (req, res) => {
  const p = await productionOrThrow(req.params.productionId);
  const input = z.object({
    start: z.coerce.date().optional(),
    daysOff: z.array(z.number().int().min(0).max(6)).max(6).default([5]),
    stagger: z.number().int().min(0).max(30).optional(),
    days: z.record(z.enum(POST_STAGES), z.number().int().min(0).max(60)).optional(),
  }).parse(req.body ?? {});
  let start = input.start;
  if (!start) {
    const schedule = await Schedule.findOne({ productionId: p._id }).sort({ status: 1, createdAt: -1 }).select('days').lean();
    const last = schedule?.days?.at(-1)?.date;
    start = last ? new Date(last) : today();
  }
  const plan = postSchedule({ start, episodes: p.totalEpisodes ?? 1, daysOff: input.daysOff, stagger: input.stagger, days: input.days });
  const kept = await PostTask.find({ productionId: p._id, status: { $in: ['in_progress', 'done'] } }).select('episodeNumber stage').lean();
  const keep = new Set(kept.map((t) => `${t.episodeNumber}:${t.stage}`));
  await PostTask.deleteMany({ productionId: p._id, status: { $nin: ['in_progress', 'done'] } });
  await PostTask.insertMany(plan.filter((t) => !keep.has(`${t.episodeNumber}:${t.stage}`)).map((t) => ({ ...t, productionId: p._id })));
  const tasks = await PostTask.find({ productionId: p._id }).sort({ episodeNumber: 1, start: 1 }).lean();
  res.status(201).json({ episodes: p.totalEpisodes, tasks });
}));

postRouter.patch('/post-tasks/:id', h(async (req, res) => {
  const input = z.object({ status: z.enum(POST_TASK_STATUSES), due: z.coerce.date(), start: z.coerce.date(), owner: z.string().max(120), notes: z.string().max(1000) }).partial().parse(req.body);
  const task = await PostTask.findByIdAndUpdate(oid(req.params.id), { $set: { ...input, ...(input.status === 'done' ? { doneAt: new Date() } : {}) } }, { new: true }).lean();
  if (!task) throw notFound('Post task');
  res.json(task);
}));
