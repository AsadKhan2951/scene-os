import express, { Router } from 'express';
import { z } from 'zod';
import { STYLE_PRESET_LABELS } from '@sceneos/shared';
import { AiRun, Character, ScriptEpisode, ScriptFile, Story } from '../models';
import { me } from '../middleware/auth';
import { HttpError, h, notFound, oid, queryFlag } from '../lib/http';
import { audit } from '../lib/audit';
import { generateText } from '../lib/anthropic';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';
import { transcribe } from '../lib/elevenlabs';
import { startRun } from '../lib/runs';
import { askAboutScript } from '../lib/scripts/ai';
import { formatOf } from '../lib/scripts/parse';
import { styleForStory } from '../lib/style';

/**
 * Script Director: import a script (or dictate the story), the intake run that reads it, and
 * the characters it finds (lock, regenerate). The run itself is in workflows/scriptIntake.ts.
 */
export const scriptDirectorRouter = Router();
const raw = express.raw({ type: () => true, limit: '25mb' });
/** Files are kept in MongoDB until read, and a document cannot pass 16 MB. */
const MAX_FILE = 15 * 1024 * 1024;

/** Upload a script file and start reading it. Body: the file bytes. */
scriptDirectorRouter.post('/stories/:id/import', raw, h(async (req, res) => {
  const storyId = oid(req.params.id);
  const { name, episode } = z.object({ name: z.string().min(3).max(300), episode: z.coerce.number().int().min(1).max(500).default(1) }).parse(req.query);
  const story = await Story.findById(storyId);
  if (!story) throw notFound('Story');
  const format = formatOf(name);
  if (!format) throw new HttpError(400, 'Upload a .fdx, .fountain, .pdf, .docx or .txt file. InPage and Celtx scripts: export them as PDF (or FDX from Celtx)');
  const data = req.body as Buffer;
  if (!Buffer.isBuffer(data) || !data.length) throw new HttpError(400, 'The file is empty');
  if (data.length > MAX_FILE) throw new HttpError(413, 'The file is over 15 MB. Export the script as text or FDX, or without pictures');
  if (await AiRun.exists({ storyId: String(storyId), type: 'script.intake', status: { $in: ['queued', 'running'] }, updatedAt: { $gt: new Date(Date.now() - 3 * 3600_000) } })) throw new HttpError(409, 'This story is already being read. Wait for it to finish');
  setAi({ feature: 'writers', action: 'intake', storyId: String(storyId), productionId: story.productionId ? String(story.productionId) : undefined });
  await ensureCredits('writers.intake');
  const file = await ScriptFile.create({ storyId, name, format, size: data.length, data });
  story.set({ sourceFile: { name, format, importedAt: new Date() } });
  await story.save();
  const run = await startRun('script.intake', { storyId: String(storyId), fileId: String(file._id), format, episodeNumber: episode }, {
    storyId: String(storyId), productionId: story.productionId ? String(story.productionId) : undefined, title: `Reading ${name}`,
  });
  await audit(me(req), 'script.imported', { productionId: story.productionId, detail: { story: story.title, file: name } });
  res.status(202).json(run);
}));

/** What the Intake and Characters screens show: the story's numbers, coverage, cast and latest run. */
scriptDirectorRouter.get('/stories/:id/overview', h(async (req, res) => {
  const storyId = oid(req.params.id);
  const [story, characters, run, episodes] = await Promise.all([
    Story.findById(storyId).lean(),
    Character.find({ storyId }).sort({ lineCount: -1, createdAt: 1 }).lean(),
    AiRun.findOne({ storyId, type: 'script.intake' }).sort({ createdAt: -1 }).select('_id status createdAt').lean(),
    ScriptEpisode.find({ storyId }).select('number status').sort({ number: 1 }).lean(),
  ]);
  if (!story) throw notFound('Story');
  res.json({ story, characters, run, episodes });
}));

/** Dictation: speech in any language to text, tidied into a written synopsis in that language. */
scriptDirectorRouter.post('/dictate', raw, h(async (req, res) => {
  const { seconds, tidy } = z.object({ seconds: z.coerce.number().min(1).max(1800).default(60), tidy: queryFlag.default('true') }).parse(req.query);
  const audio = req.body as Buffer;
  if (!Buffer.isBuffer(audio) || audio.length < 1000) throw new HttpError(400, 'The recording is empty');
  setAi({ feature: 'writers', action: 'dictate' });
  await ensureCredits('writers.dictate');
  const heard = await transcribe(audio, String(req.get('content-type') ?? 'audio/webm'), seconds).catch((err) => { throw new HttpError(502, err instanceof Error ? err.message : 'Dictation failed'); });
  if (!heard.text) throw new HttpError(422, 'Nothing was heard. Try again a little closer to the microphone');
  const text = tidy
    ? await generateText('You tidy dictated story ideas into clean written prose. Keep the speaker\'s language and script exactly (Urdu stays in Urdu script, Roman Urdu stays Roman Urdu, English stays English). Fix only punctuation, false starts and repeated words. Never add ideas. Return only the text.', heard.text, 4000, 'fast')
    : heard.text;
  res.json({ text, raw: heard.text, language: heard.language });
}));

scriptDirectorRouter.post('/characters/:id/lock', h(async (req, res) => {
  const { locked } = z.object({ locked: z.boolean().default(true) }).parse(req.body ?? {});
  const c = await Character.findByIdAndUpdate(oid(req.params.id), { locked, lockedAt: locked ? new Date() : null }, { new: true });
  if (!c) throw notFound('Character');
  await audit(me(req), locked ? 'character.locked' : 'character.unlocked', { detail: { name: c.name } });
  res.json(c);
}));

/** Writes one character's characterisation again from the script. Refused while locked. */
scriptDirectorRouter.post('/characters/:id/regenerate', h(async (req, res) => {
  const c = await Character.findById(oid(req.params.id));
  if (!c) throw notFound('Character');
  if (c.locked) throw new HttpError(409, 'Unlock the character before regenerating it');
  const episodes = await ScriptEpisode.find({ storyId: c.storyId, content: { $ne: '' } }).sort({ number: 1 }).lean();
  const script = episodes.map((e) => e.content).join('\n\n').slice(0, 400_000);
  if (!script) throw new HttpError(409, 'There is no script to read yet. Import or write it first');
  setAi({ feature: 'writers', action: 'character', storyId: String(c.storyId) });
  await ensureCredits('writers.character');
  const style = await styleForStory(c.storyId);
  const row = await askAboutScript({
    system: 'You are a senior script editor. Answer only from what the screenplay shows; never invent plot.', script, shape: 'object', tier: 'deep', maxTokens: 8000,
    schema: z.object({ backstory: z.string(), want: z.string(), need: z.string(), arc: z.string(), voice: z.string(), relationships: z.string(), physical: z.string() }),
    task: `Write the characterisation of ${c.name}. The project's style is "${STYLE_PRESET_LABELS[style.preset]}", set in ${style.country ?? 'the script\'s country'}. Reply with { "backstory": 2 sentences, "want", "need", "arc": start to end, "voice": how they speak, "relationships": tie to each main character, "physical": age, build, face, hair, marks, bearing }.`,
  });
  c.set(row);
  await c.save();
  res.json(c);
}));
