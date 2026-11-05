import { Router } from 'express';
import { z } from 'zod';
import { AiRun } from '../models';
import { h, notFound, oid } from '../lib/http';
import { aiContext } from '../lib/ai/context';
import { answerRun, retryRun } from '../lib/runs';

/** Long AI runs: their live step checklist, the questions they wait on, and retry. */
export const runsRouter = Router();

runsRouter.get('/', h(async (req, res) => {
  const q = z.object({ productionId: z.string().optional(), storyId: z.string().optional(), type: z.string().max(60).optional() }).parse(req.query);
  const where: Record<string, unknown> = { orgId: aiContext().orgId };
  if (q.productionId) where.productionId = oid(q.productionId, 'productionId');
  if (q.storyId) where.storyId = oid(q.storyId, 'storyId');
  if (q.type) where.type = q.type;
  res.json(await AiRun.find(where).sort({ createdAt: -1 }).limit(20).select('-steps.output').lean());
}));

runsRouter.get('/:id', h(async (req, res) => {
  const run = await AiRun.findById(oid(req.params.id)).select('-steps.output').lean();
  if (!run) throw notFound('Run');
  res.json(run);
}));

runsRouter.post('/:id/answer', h(async (req, res) => {
  const { key, answer } = z.object({ key: z.string().min(1).max(100), answer: z.union([z.string().max(4000), z.boolean(), z.array(z.string().max(400)).max(50)]) }).parse(req.body);
  res.json(await answerRun(oid(req.params.id), key, answer));
}));

runsRouter.post('/:id/retry', h(async (req, res) => {
  res.json(await retryRun(oid(req.params.id)));
}));
