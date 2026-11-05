import { Router } from 'express';
import { z } from 'zod';
import { ACTION_QUOTES, AI_FEATURE_LABELS, CREDIT_USD, creditGrantSchema, creditSettingsSchema } from '@sceneos/shared';
import { CreditAccount, CreditLedger, UsageEvent } from '../models';
import { me, requireAdmin } from '../middleware/auth';
import { h } from '../lib/http';
import { audit } from '../lib/audit';
import { aiContext } from '../lib/ai/context';
import { available, getAccount, grantCredits } from '../lib/ai/credits';
import { env } from '../config/env';

/** The workspace's AI credits: balance, what was spent on what, and admin top-ups. */
export const creditsRouter = Router();

const monthStart = () => { const d = new Date(); return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1)); };

creditsRouter.get('/', h(async (_req, res) => {
  const { orgId } = aiContext();
  const acc = await getAccount(orgId);
  const since = monthStart();
  const [byFeature, byProvider] = await Promise.all([
    UsageEvent.aggregate<{ _id: string; credits: number; costUsd: number; calls: number }>([
      { $match: { orgId, createdAt: { $gte: since } } },
      { $group: { _id: '$feature', credits: { $sum: '$credits' }, costUsd: { $sum: '$costUsd' }, calls: { $sum: 1 } } },
      { $sort: { credits: -1 } },
    ]),
    UsageEvent.aggregate<{ _id: { provider: string; model: string }; credits: number; costUsd: number; calls: number; inputTokens: number; outputTokens: number; cacheReadTokens: number }>([
      { $match: { orgId, createdAt: { $gte: since } } },
      { $group: { _id: { provider: '$provider', model: '$model' }, credits: { $sum: '$credits' }, costUsd: { $sum: '$costUsd' }, calls: { $sum: 1 }, inputTokens: { $sum: '$inputTokens' }, outputTokens: { $sum: '$outputTokens' }, cacheReadTokens: { $sum: '$cacheReadTokens' } } },
      { $sort: { credits: -1 } },
    ]),
  ]);
  res.json({
    balance: acc.balance,
    held: acc.held,
    available: available(acc),
    monthlyCredits: acc.monthlyCredits,
    markup: acc.markup,
    hardLimit: acc.hardLimit,
    creditUsd: env.CREDIT_USD ?? CREDIT_USD,
    usedThisMonth: byFeature.reduce((s, f) => s + f.credits, 0),
    byFeature: byFeature.map((f) => ({ feature: f._id, label: AI_FEATURE_LABELS[f._id as keyof typeof AI_FEATURE_LABELS] ?? f._id, credits: f.credits, costUsd: f.costUsd, calls: f.calls })),
    byModel: byProvider.map((p) => ({ provider: p._id.provider, model: p._id.model, credits: p.credits, costUsd: p.costUsd, calls: p.calls, inputTokens: p.inputTokens, outputTokens: p.outputTokens, cacheReadTokens: p.cacheReadTokens })),
    quotes: ACTION_QUOTES,
  });
}));

/** The latest metered calls, newest first. */
creditsRouter.get('/usage', h(async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  res.json(await UsageEvent.find({ orgId: aiContext().orgId }).sort({ createdAt: -1 }).limit(limit).lean());
}));

creditsRouter.get('/ledger', requireAdmin, h(async (req, res) => {
  const { limit } = z.object({ limit: z.coerce.number().int().min(1).max(500).default(100) }).parse(req.query);
  res.json(await CreditLedger.find({ orgId: aiContext().orgId }).sort({ createdAt: -1 }).limit(limit).lean());
}));

creditsRouter.post('/grant', requireAdmin, h(async (req, res) => {
  const { credits, note } = creditGrantSchema.parse(req.body);
  const acc = await grantCredits(aiContext().orgId, credits, me(req).id, note ?? `Added by ${me(req).name}`);
  await audit(me(req), 'credits.granted', { detail: { credits, note } });
  res.json(acc);
}));

creditsRouter.patch('/settings', requireAdmin, h(async (req, res) => {
  const input = creditSettingsSchema.parse(req.body);
  const { orgId } = aiContext();
  await getAccount(orgId);
  const acc = await CreditAccount.findOneAndUpdate({ orgId }, { $set: input }, { new: true });
  await audit(me(req), 'credits.settings', { detail: input });
  res.json(acc);
}));
