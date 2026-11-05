import { Router } from 'express';
import { z } from 'zod';
import { actorGenerateSchema, actorSchema, extractJsonArray } from '@sceneos/shared';
import { Actor, Character, Production, Story } from '../models';
import { crud } from '../lib/crud';
import { h, notFound } from '../lib/http';
import { generateJson } from '../lib/anthropic';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';

/**
 * The actor database: who can play which part and when they are free.
 * Real data is entered by the team; until then AI can fill it with clearly marked sample rows.
 */
export const actorsRouter = Router();

const generated = z.array(z.object({
  name: z.string().min(1),
  character: z.string().nullish().transform((v) => v ?? undefined),
  roleType: z.enum(['lead', 'supporting', 'antagonist', 'minor', 'extra']).catch('supporting'),
  agent: z.string().nullish().transform((v) => v ?? undefined),
  dayRate: z.number().nonnegative().nullish().transform((v) => v ?? undefined),
  currency: z.string().nullish().transform((v) => v ?? undefined),
  notes: z.string().nullish().transform((v) => v ?? undefined),
  availability: z.array(z.object({
    start: z.coerce.date(),
    end: z.coerce.date(),
    kind: z.enum(['booked', 'hold', 'unavailable']),
    note: z.string().nullish().transform((v) => v ?? undefined),
  })).nullish().transform((v) => v ?? []),
})).min(1).max(20);

/** Sample actors made by AI for a production, marked so nobody mistakes them for real bookings. */
actorsRouter.post('/generate', h(async (req, res) => {
  const { productionId, count } = actorGenerateSchema.parse(req.body);
  const production = await Production.findById(productionId).lean();
  if (!production) throw notFound('Production');
  setAi({ feature: 'actors', action: 'generate', productionId });
  await ensureCredits('actors.generate');
  const story = await Story.findOne({ productionId }).sort({ updatedAt: -1 }).lean();
  const characters = story ? await Character.find({ storyId: story._id }).lean() : [];
  const today = new Date().toISOString().slice(0, 10);
  const rows = await generateJson(
    'You create realistic SAMPLE data for a film and television production tool, used for testing until real data is entered. Invent fictional people only: never use or resemble the name of a real actor or public figure. Reply with JSON only, no prose and no code fence.',
    `Create ${count} sample actors for the production "${production.title}" (${production.format.replace('_', ' ')}${production.genre ? `, ${production.genre}` : ''}${production.channel ? `, for ${production.channel}` : ''}).
${characters.length ? `Cast them against these characters first, one actor each, then add the rest as supporting or minor parts:\n${characters.map((c) => `- ${c.name}${c.ageRange ? ` (${c.ageRange})` : ''}`).join('\n')}` : 'Invent plausible character names for them to play.'}

Reply with a JSON array. Each item:
- "name": a fictional actor's full name that fits where this production is made.
- "character": the part they would play.
- "roleType": one of lead, supporting, antagonist, minor, extra.
- "agent": a fictional agency name, or an empty string.
- "dayRate": a plausible day rate as a number, and "currency": a 3-letter currency code that fits the production.
- "notes": one short line about them.
- "availability": 1 to 3 blocks in the next 90 days starting ${today}, each { "start": "YYYY-MM-DD", "end": "YYYY-MM-DD", "kind": "booked" | "hold" | "unavailable", "note": short reason such as "other film" }. Make a few of them clash with each other so scheduling conflicts can be tested.`,
    (raw) => generated.parse(extractJsonArray(raw)),
    undefined,
    8000,
  );
  const docs = await Actor.insertMany(rows.map((r) => ({ ...r, productionId, source: 'ai_sample' })));
  res.status(201).json(docs);
}));

/** Removes the AI sample rows of a production, leaving real ones. */
actorsRouter.delete('/samples', h(async (req, res) => {
  const productionId = z.string().regex(/^[a-f0-9]{24}$/i).parse(req.query.productionId);
  const { deletedCount } = await Actor.deleteMany({ productionId, source: 'ai_sample' });
  res.json({ deleted: deletedCount ?? 0 });
}));

actorsRouter.use('/', crud(Actor, { schema: actorSchema, filters: ['productionId'], sort: { roleType: 1, name: 1 } }));
