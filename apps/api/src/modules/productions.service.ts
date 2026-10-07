import { PIPELINE_STAGES, type ProductionCreate } from '@sceneos/shared';
import { Episode, Production } from '../models';
import type { AuthUser } from '../middleware/auth';
import { HttpError, notFound } from '../lib/http';
import { audit } from '../lib/audit';

export async function createProduction(input: ProductionCreate, user: AuthUser) {
  const now = new Date();
  const stages = PIPELINE_STAGES.map((s) => ({ ...s, status: s.order === 1 ? 'in_progress' : 'pending', startedAt: s.order === 1 ? now : undefined }));
  const production = await Production.create({ ...input, stages, currentStage: 1, createdBy: user.id });
  await audit(user, 'production.created', { productionId: production._id });
  return production;
}

/** Completes the current stage and starts the next one. Admin only; callers check the role. */
export async function advanceStage(productionId: string, note: string | undefined, user: AuthUser, via: 'user' | 'dreamer' = 'user') {
  const production = await Production.findById(productionId);
  if (!production) throw notFound('Production');
  const current = production.stages.find((s) => s.order === production.currentStage);
  if (!current) throw new HttpError(409, 'This production has no pipeline stages');
  if (current.status === 'completed') throw new HttpError(409, 'All 15 stages are already complete');
  const now = new Date();
  current.status = 'completed';
  current.completedAt = now;
  if (note) current.note = note;
  const next = production.stages.find((s) => s.order === production.currentStage + 1);
  if (next) {
    next.status = 'in_progress';
    next.startedAt = now;
    production.currentStage = next.order;
  } else {
    production.status = 'completed';
  }
  await production.save();
  await audit(user, 'stage.completed', { productionId, via, detail: { stage: current.name, note, next: next?.name ?? null } });
  return production;
}

export async function setProductionStatus(productionId: string, status: string, user: AuthUser, via: 'user' | 'dreamer' = 'user') {
  const production = await Production.findByIdAndUpdate(productionId, { status }, { new: true, runValidators: true });
  if (!production) throw notFound('Production');
  await audit(user, 'production.status', { productionId, via, detail: { status } });
  return production;
}

/** Creates one row per episode that does not exist yet, with the channel's delivery checklist. */
export async function initEpisodes(productionId: string, scenesPerEpisode = 0) {
  const production = await Production.findById(productionId).lean();
  if (!production) throw notFound('Production');
  const existing = new Set((await Episode.find({ productionId }).select('number').lean()).map((e) => e.number));
  const rows = [];
  for (let number = 1; number <= production.totalEpisodes; number++) {
    if (existing.has(number)) continue;
    rows.push({
      productionId,
      number,
      totalScenes: scenesPerEpisode,
      deliveryItems: production.deliveryRequirements.map((label) => ({ label, status: 'pending' })),
    });
  }
  if (rows.length) await Episode.insertMany(rows);
  return { created: rows.length };
}
