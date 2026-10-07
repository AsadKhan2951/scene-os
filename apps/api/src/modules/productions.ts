import { Router } from 'express';
import { z } from 'zod';
import { episodeUpdateSchema, productionCreateSchema, productionUpdateSchema, stageAdvanceSchema, PRODUCTION_FORMATS, PRODUCTION_STATUSES } from '@sceneos/shared';
import { Episode, Production } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { audit } from '../lib/audit';
import { advanceStage, createProduction, initEpisodes, setProductionStatus } from './productions.service';

export const productionsRouter = Router();
const escapeRegex = (s: string) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

productionsRouter.get('/', h(async (req, res) => {
  const q = z.object({
    search: z.string().max(100).optional(),
    status: z.enum(PRODUCTION_STATUSES).optional(),
    format: z.enum(PRODUCTION_FORMATS).optional(),
  }).parse(req.query);
  const where: Record<string, unknown> = {};
  if (q.status) where.status = q.status;
  if (q.format) where.format = q.format;
  if (q.search) {
    const rx = new RegExp(escapeRegex(q.search), 'i');
    where.$or = [{ title: rx }, { writer: rx }, { director: rx }];
  }
  res.json(await Production.find(where).sort({ createdAt: -1 }).lean());
}));

productionsRouter.post('/', h(async (req, res) => {
  res.status(201).json(await createProduction(productionCreateSchema.parse(req.body), me(req)));
}));

productionsRouter.get('/:id', h(async (req, res) => {
  const production = await Production.findById(oid(req.params.id)).lean();
  if (!production) throw notFound('Production');
  res.json(production);
}));

productionsRouter.patch('/:id', h(async (req, res) => {
  const input = productionUpdateSchema.parse(req.body);
  if (input.deliveryRequirements && me(req).role !== 'admin') throw new HttpError(403, 'Only admins can change a channel’s requirements');
  const production = await Production.findByIdAndUpdate(oid(req.params.id), input, { new: true, runValidators: true });
  if (!production) throw notFound('Production');
  if (input.status) await audit(me(req), 'production.status', { productionId: production._id, detail: { status: input.status } });
  res.json(production);
}));

productionsRouter.post('/:id/duplicate', h(async (req, res) => {
  const source = await Production.findById(oid(req.params.id)).lean();
  if (!source) throw notFound('Production');
  const copy = await createProduction({
    title: `${source.title} (copy)`, format: source.format, genre: source.genre ?? undefined, writer: source.writer ?? undefined,
    director: source.director ?? undefined, channel: source.channel ?? undefined, totalEpisodes: source.totalEpisodes, totalBudget: source.totalBudget,
  }, me(req));
  res.status(201).json(copy);
}));

productionsRouter.post('/:id/status', h(async (req, res) => {
  const { status } = z.object({ status: z.enum(PRODUCTION_STATUSES) }).parse(req.body);
  res.json(await setProductionStatus(oid(req.params.id), status, me(req)));
}));

productionsRouter.post('/:id/stages/advance', requireAdmin, h(async (req, res) => {
  const { note } = stageAdvanceSchema.parse(req.body);
  res.json(await advanceStage(oid(req.params.id), note, me(req)));
}));

// ---- Episodes: scene tracking and the status board ----
productionsRouter.get('/:id/episodes', h(async (req, res) => {
  res.json(await Episode.find({ productionId: oid(req.params.id) }).sort({ number: 1 }).lean());
}));

productionsRouter.post('/:id/episodes/init', h(async (req, res) => {
  const { scenesPerEpisode } = z.object({ scenesPerEpisode: z.number().int().min(0).max(500).default(0) }).parse(req.body ?? {});
  res.json(await initEpisodes(oid(req.params.id), scenesPerEpisode));
}));

productionsRouter.patch('/:id/episodes/:number', h(async (req, res) => {
  const input = episodeUpdateSchema.parse(req.body);
  const episode = await Episode.findOne({ productionId: oid(req.params.id), number: Number(req.params.number) });
  if (!episode) throw notFound('Episode');
  const { board, ...rest } = input;
  Object.assign(episode, rest);
  if (board) Object.assign(episode.board!, board);
  if (episode.recordedScenes > episode.totalScenes) throw new HttpError(400, 'Recorded scenes cannot be more than total scenes');
  await episode.save();
  res.json(episode);
}));

/** Marks an episode delivered. Refused until every checklist item is done. */
productionsRouter.post('/:id/episodes/:number/deliver', h(async (req, res) => {
  const episode = await Episode.findOne({ productionId: oid(req.params.id), number: Number(req.params.number) });
  if (!episode) throw notFound('Episode');
  const open = episode.deliveryItems.filter((i) => i.status !== 'done').length;
  if (open > 0) throw new HttpError(409, `${open} checklist item${open === 1 ? ' is' : 's are'} not done yet`);
  episode.board!.delivery = 'done';
  episode.deliveredAt = new Date();
  await episode.save();
  await audit(me(req), 'episode.delivered', { productionId: episode.productionId, detail: { episode: episode.number } });
  res.json(episode);
}));
