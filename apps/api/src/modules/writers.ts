import { Router } from 'express';
import { z } from 'zod';
import { scriptEpisodeSchema, storySchema, storyUpdateSchema, storyboardGenerateSchema, frameUpdateSchema } from '@sceneos/shared';
import { ScriptEpisode, Story, StoryboardFrame } from '../models';
import { me } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { generateText } from '../lib/anthropic';
import { plainText } from '@sceneos/shared';
import { higgsfieldReady } from '../lib/higgsfield';
import { JOB_OPTIONS, storyboardQueue } from '../lib/queue';

export const writersRouter = Router();

const LANGUAGE_RULE: Record<string, string> = {
  english: 'Write in English.',
  roman_urdu: 'Write in Roman Urdu (Urdu in Latin script), the way Pakistani drama writers draft.',
  urdu: 'Write in Urdu script (right to left).',
};
const WRITER_SYSTEM = `You are the Writers Hub assistant inside Scene OS, a production system for Pakistani television drama.
You help professional writers develop their own material. Stay faithful to the story they describe; do not add plot the writer has not implied.
Ground the writing in Pakistani serial-drama conventions: family dynamics, culturally specific relationships and long-running emotional arcs.
Return only the requested text, with no title line, no preamble and no notes to the writer.
Write plain text only. Never use markdown: no #, no asterisks, no bold or italics, no horizontal rules.`;

/** The guided questions the wizard asks before anything is generated. */
export const WIZARD_QUESTIONS = [
  'What is the story about, in one breath?',
  'Whose emotional journey do we follow?',
  'What does the family stand to lose if the lead says no?',
  'Who or what stands in the lead’s way?',
  'Where and when is it set, and what is the tone?',
  'How does it end, or what question should the ending leave open?',
];
writersRouter.get('/wizard-questions', (_req, res) => { res.json(WIZARD_QUESTIONS); });

// ---- Stories ----
writersRouter.get('/stories', h(async (req, res) => {
  const where = req.query.productionId ? { productionId: oid(req.query.productionId, 'productionId') } : {};
  res.json(await Story.find(where).sort({ updatedAt: -1 }).lean());
}));
writersRouter.post('/stories', h(async (req, res) => {
  res.status(201).json(await Story.create({ ...storySchema.parse(req.body), createdBy: me(req).id }));
}));
writersRouter.get('/stories/:id', h(async (req, res) => {
  const story = await Story.findById(oid(req.params.id)).lean();
  if (!story) throw notFound('Story');
  res.json(story);
}));
writersRouter.patch('/stories/:id', h(async (req, res) => {
  const input = storyUpdateSchema.parse(req.body);
  const story = await Story.findById(oid(req.params.id));
  if (!story) throw notFound('Story');
  const unlocking = input.locked === false && story.locked;
  if (unlocking && me(req).role !== 'admin') throw new HttpError(403, 'Only admins can unlock a one-liner');
  if (story.locked && !unlocking && input.oneLiner !== undefined) throw new HttpError(409, 'Unlock the one-liner before editing it');
  story.set(input);
  if (input.locked === true) story.lockedAt = new Date();
  await story.save();
  res.json(story);
}));

/** Drama formats get a flowing narrative one-liner first, not a scene list. */
writersRouter.post('/stories/:id/one-liner', h(async (req, res) => {
  const story = await Story.findById(oid(req.params.id));
  if (!story) throw notFound('Story');
  if (story.locked) throw new HttpError(409, 'Unlock the one-liner before rewriting it');
  const answers = story.answers.map((a) => `Q: ${a.question}\nA: ${a.answer}`).join('\n\n');
  story.oneLiner = plainText(await generateText(WRITER_SYSTEM,
    `Write the one-liner for a ${story.format.replace('_', ' ')} titled "${story.title}".
A one-liner here is a flowing narrative treatment of three to five paragraphs: what the story is about, whose journey it follows, the stakes, the family and social dynamics, and the direction of the arc. It is not a scene list.
${LANGUAGE_RULE[story.language]}

The writer's answers:
${answers || '(no answers yet; write from the title alone and keep it short)'}`));
  await story.save();
  res.json(story);
}));

// ---- Script episodes ----
writersRouter.get('/stories/:id/episodes', h(async (req, res) => {
  res.json(await ScriptEpisode.find({ storyId: oid(req.params.id) }).sort({ number: 1 }).select('-revisions.content').lean());
}));

/** Adds planned, unwritten episode slots up to the given episode number. */
writersRouter.post('/stories/:id/episodes/plan', h(async (req, res) => {
  const storyId = oid(req.params.id);
  const { upTo } = z.object({ upTo: z.number().int().min(1).max(500) }).parse(req.body);
  const existing = new Set((await ScriptEpisode.find({ storyId }).select('number').lean()).map((e) => e.number));
  const rows = [];
  for (let number = 1; number <= upTo; number++) if (!existing.has(number)) rows.push({ storyId, number, status: 'planned' });
  if (rows.length) await ScriptEpisode.insertMany(rows);
  res.json({ created: rows.length });
}));

writersRouter.get('/episodes/:id', h(async (req, res) => {
  const episode = await ScriptEpisode.findById(oid(req.params.id)).lean();
  if (!episode) throw notFound('Episode');
  res.json(episode);
}));

/** Saving new content keeps the previous draft as a revision. */
writersRouter.patch('/episodes/:id', h(async (req, res) => {
  const input = scriptEpisodeSchema.parse(req.body);
  const episode = await ScriptEpisode.findById(oid(req.params.id));
  if (!episode) throw notFound('Episode');
  if (input.content !== undefined && input.content !== episode.content && episode.content) {
    episode.revisions.push({ label: `Draft ${episode.revisions.length + 1}`, content: episode.content, by: me(req).name, at: new Date() });
    if (episode.revisions.length > 30) episode.revisions.shift();
  }
  episode.set(input);
  if (input.content && episode.status === 'planned') episode.status = 'drafting';
  await episode.save();
  res.json(episode);
}));

/** Writes a pilot or later episode from the one-liner. Only runs when the writer asks for it. */
writersRouter.post('/episodes/:id/generate', h(async (req, res) => {
  const episode = await ScriptEpisode.findById(oid(req.params.id));
  if (!episode) throw notFound('Episode');
  const story = await Story.findById(episode.storyId).lean();
  if (!story) throw notFound('Story');
  if (!story.oneLiner) throw new HttpError(409, 'Write the one-liner first');
  const earlier = await ScriptEpisode.find({ storyId: story._id, number: { $lt: episode.number }, status: 'written' }).sort({ number: -1 }).limit(1).lean();
  const content = plainText(await generateText(WRITER_SYSTEM,
    `Write episode ${episode.number}${episode.number === 1 ? ' (the pilot)' : ''} of "${story.title}" as a full screenplay.
Number every scene and start each with a heading such as "1. INT. LOCATION - TIME" or "2. EXT. LOCATION - TIME". Follow each heading with action lines, then dialogue with the character name on its own line.
Scene headings stay in English capitals. ${LANGUAGE_RULE[story.language]}

One-liner:
${story.oneLiner}

${episode.outline ? `What this episode covers: ${episode.outline}\n` : ''}${earlier[0] ? `How the previous episode ended:\n${earlier[0].content.slice(-2500)}` : ''}`, 16000));
  if (episode.content) episode.revisions.push({ label: `Draft ${episode.revisions.length + 1}`, content: episode.content, by: me(req).name, at: new Date() });
  episode.content = content;
  episode.status = 'written';
  await episode.save();
  res.json(episode);
}));

// ---- Storyboards: one scene at a time, drawn by the worker ----
writersRouter.get('/episodes/:id/frames', h(async (req, res) => {
  res.json(await StoryboardFrame.find({ scriptEpisodeId: oid(req.params.id) }).sort({ sceneNumber: 1, order: 1 }).lean());
}));

writersRouter.post('/storyboards/generate', h(async (req, res) => {
  const job = storyboardGenerateSchema.parse(req.body);
  if (!(await ScriptEpisode.exists({ _id: job.scriptEpisodeId }))) throw notFound('Episode');
  await storyboardQueue().add('scene', { kind: 'scene', ...job }, JOB_OPTIONS);
  res.status(202).json({ queued: true, images: higgsfieldReady() });
}));

writersRouter.patch('/frames/:id', h(async (req, res) => {
  // (redraw and clip have their own routes below)
  const frame = await StoryboardFrame.findByIdAndUpdate(oid(req.params.id), frameUpdateSchema.parse(req.body), { new: true });
  if (!frame) throw notFound('Frame');
  res.json(frame);
}));

/** Draws one frame again, using the note left on it. */
writersRouter.post('/frames/:id/redraw', h(async (req, res) => {
  if (!higgsfieldReady()) throw new HttpError(503, 'Image drawing is not set up yet. Add HIGGSFIELD_API_KEY on the server');
  const frame = await StoryboardFrame.findByIdAndUpdate(oid(req.params.id), { status: 'queued', error: null }, { new: true });
  if (!frame) throw notFound('Frame');
  await storyboardQueue().add('frame', { kind: 'frame', frameId: String(frame._id) }, JOB_OPTIONS);
  res.status(202).json(frame);
}));

/** Makes a short motion clip from an approved frame. Each clip spends Higgsfield credits. */
writersRouter.post('/frames/:id/clip', h(async (req, res) => {
  if (!higgsfieldReady()) throw new HttpError(503, 'Motion clips are not set up yet. Add HIGGSFIELD_API_KEY on the server');
  const frame = await StoryboardFrame.findById(oid(req.params.id));
  if (!frame) throw notFound('Frame');
  if (frame.status !== 'approved') throw new HttpError(409, 'Approve the frame before making a motion clip');
  if (!frame.imageUrl) throw new HttpError(409, 'This frame has no image to animate yet');
  if (['queued', 'drawing'].includes(frame.videoStatus)) throw new HttpError(409, 'A clip is already being made for this frame');
  frame.set({ videoStatus: 'queued', videoError: null });
  await frame.save();
  await storyboardQueue().add('clip', { kind: 'clip', frameId: String(frame._id) }, JOB_OPTIONS);
  res.status(202).json(frame);
}));

writersRouter.get('/storyboards/status', (_req, res) => { res.json({ images: higgsfieldReady() }); });
