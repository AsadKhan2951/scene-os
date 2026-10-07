import { Router } from 'express';
import { z } from 'zod';
import { evaluationSchema, SIGN_OFF_ROLES } from '@sceneos/shared';
import { Evaluation } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { HttpError, h, oid } from '../lib/http';
import { audit } from '../lib/audit';

export const evaluationsRouter = Router();

evaluationsRouter.get('/:productionId', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  res.json((await Evaluation.findOne({ productionId }).lean()) ?? { productionId, signOffs: {} });
}));

evaluationsRouter.put('/:productionId', h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  res.json(await Evaluation.findOneAndUpdate({ productionId }, evaluationSchema.parse(req.body), { new: true, upsert: true, setDefaultsOnInsert: true }));
}));

/** Records a sign-off with the signer's name and time. A sign-off cannot be replaced. */
evaluationsRouter.post('/:productionId/sign-off', requireAdmin, h(async (req, res) => {
  const productionId = oid(req.params.productionId, 'productionId');
  const { role } = z.object({ role: z.enum(SIGN_OFF_ROLES) }).parse(req.body);
  const evaluation = await Evaluation.findOneAndUpdate({ productionId }, {}, { new: true, upsert: true, setDefaultsOnInsert: true });
  if (evaluation.signOffs?.[role]?.at) throw new HttpError(409, 'This sign-off is already recorded');
  evaluation.set(`signOffs.${role}`, { by: me(req).name, at: new Date() });
  await evaluation.save();
  await audit(me(req), 'evaluation.signed', { productionId, detail: { role } });
  res.json(evaluation);
}));
