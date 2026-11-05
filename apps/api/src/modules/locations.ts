import { Router } from 'express';
import { z } from 'zod';
import { extractJsonObject, locationSchema, locationSearchSchema } from '@sceneos/shared';
import { Location, Production } from '../models';
import { me } from '../middleware/auth';
import { h, notFound, oid } from '../lib/http';
import { audit } from '../lib/audit';
import { generateJson } from '../lib/anthropic';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';
import { photoUri, placesReady, searchPlaces } from '../lib/google';

/**
 * Shoot locations. Real places come from Google Places; cost per day and permit time are
 * entered by the team, or estimated by AI and marked as an estimate.
 */
export const locationsRouter = Router();

locationsRouter.get('/status', (_req, res) => { res.json({ places: placesReady() }); });

locationsRouter.get('/', h(async (req, res) => {
  const productionId = oid(req.query.productionId, 'productionId');
  res.json(await Location.find({ productionId }).sort({ status: -1, createdAt: -1 }).lean());
}));

/** Searches Google for real places. Nothing is saved until the person picks one. */
locationsRouter.post('/search', h(async (req, res) => {
  const { productionId, query, region } = locationSearchSchema.parse(req.body);
  setAi({ feature: 'locations', action: 'search', productionId });
  await ensureCredits('locations.search');
  res.json(await searchPlaces(query, region));
}));

/** A viewable link for a Google place photo. */
locationsRouter.get('/photo', h(async (req, res) => {
  const { name, w } = z.object({ name: z.string().min(10).max(500), w: z.coerce.number().int().min(100).max(1600).default(800) }).parse(req.query);
  setAi({ feature: 'locations', action: 'photo' });
  res.json({ url: await photoUri(name, w) });
}));

locationsRouter.post('/', h(async (req, res) => {
  const input = locationSchema.parse(req.body);
  res.status(201).json(await Location.create({ ...input, costIsEstimate: false }));
}));

locationsRouter.patch('/:id', h(async (req, res) => {
  const input = locationSchema.partial().omit({ productionId: true }).parse(req.body);
  // A number typed by the team replaces the AI estimate.
  const typedCost = input.costPerDay !== undefined || input.permitDays !== undefined;
  const loc = await Location.findByIdAndUpdate(oid(req.params.id), { ...input, ...(typedCost ? { costIsEstimate: false } : {}) }, { new: true, runValidators: true });
  if (!loc) throw notFound('Location');
  res.json(loc);
}));

locationsRouter.post('/:id/lock', h(async (req, res) => {
  const { locked } = z.object({ locked: z.boolean().default(true) }).parse(req.body ?? {});
  const loc = await Location.findByIdAndUpdate(oid(req.params.id), { status: locked ? 'locked' : 'candidate', lockedAt: locked ? new Date() : null }, { new: true });
  if (!loc) throw notFound('Location');
  await audit(me(req), locked ? 'location.locked' : 'location.unlocked', { productionId: loc.productionId, detail: { name: loc.name } });
  res.json(loc);
}));

const estimateSchema = z.object({
  costPerDay: z.number().nonnegative(),
  currency: z.string().min(3).max(3),
  permitDays: z.number().int().min(0).max(365),
  note: z.string().max(400),
});

/** AI estimate of cost per shoot day and permit lead time. Marked as an estimate in the app. */
locationsRouter.post('/:id/estimate', h(async (req, res) => {
  const loc = await Location.findById(oid(req.params.id));
  if (!loc) throw notFound('Location');
  const production = await Production.findById(loc.productionId).lean();
  setAi({ feature: 'locations', action: 'estimate', productionId: String(loc.productionId) });
  await ensureCredits('locations.estimate');
  const est = await generateJson(
    'You are an experienced location manager. Give a realistic, conservative estimate for filming at a real place, based on what is typical for that kind of place in that city and country. Reply with JSON only, no prose and no code fence.',
    `Estimate the cost of one shoot day and the permit lead time for filming at:
Name: ${loc.name}
Address: ${loc.address ?? 'unknown'}
Kind of place (Google types): ${loc.types.join(', ') || 'unknown'}
Production: ${production?.title ?? 'a drama'} (${production?.format?.replace('_', ' ') ?? 'series'}), a mid-size unit of about 40 people.

Reply with { "costPerDay": number, "currency": "3-letter code of the local currency", "permitDays": whole days needed to get permission, "note": "one sentence on what the figure includes and the main assumption" }.`,
    (raw) => estimateSchema.parse(extractJsonObject(raw)),
    undefined,
    4000,
    'fast',
  );
  loc.set({ costPerDay: est.costPerDay, currency: est.currency, permitDays: est.permitDays, costIsEstimate: true, estimateNote: est.note });
  await loc.save();
  res.json(loc);
}));

locationsRouter.delete('/:id', h(async (req, res) => {
  const loc = await Location.findByIdAndDelete(oid(req.params.id));
  if (!loc) throw notFound('Location');
  res.status(204).end();
}));
