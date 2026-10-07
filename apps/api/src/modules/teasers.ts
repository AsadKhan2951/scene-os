import { existsSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { TEASER_END_CARD_SECONDS, TEASER_MUSIC_LABELS, extractJsonObject, sceneDurationRange, sceneMarks, sceneText, teaserCreateSchema, teaserPlanSchema, teaserTiming, teaserUpdateSchema } from '@sceneos/shared';
import { env } from '../config/env';
import { Character, ScriptEpisode, Story, StoryboardFrame, Teaser } from '../models';
import { me } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { generateText } from '../lib/anthropic';
import { audioReady } from '../lib/elevenlabs';
import { higgsfieldReady } from '../lib/higgsfield';
import { storyboardQueue } from '../lib/queue';

export const teasersRouter = Router();
export const teaserFile = (id: string) => path.join(env.MEDIA_DIR, 'teasers', `${id}.mp4`);

/**
 * The planning model must think like a Pakistani channel promo producer.
 * These rules exist because a generic "South Asian drama" prompt drifts to Bollywood.
 */
const PROMO_SYSTEM = `You are a senior promo producer at a Pakistani entertainment channel. You cut first-look teasers for Urdu drama serials of the kind that air at 8 pm on Pakistani television.

What a Pakistani drama serial teaser is:
- Grounded and realistic. Ordinary Pakistani homes, courtyards, drawing rooms, kitchens, rooftops, old-city streets, shops, hospitals, courts. Real middle-class and upper-middle-class Pakistani life.
- Emotion carried by faces, silences, glances, a hand on a doorframe, a letter, a closed door. Restraint, not spectacle.
- People dress as Pakistanis do at home and outside: shalwar kameez, dupatta, chadar, simple kurta, waistcoat, plain office clothes. Modest. Natural, minimal make-up. Jewellery only when the scene is a wedding.
- The voice-over is one calm narrator in the style of Pakistani channel promos: a few short, weighty Urdu lines that pose the story's question. Pure Urdu vocabulary.
- Music supports the mood quietly: piano, strings, sitar, flute, a soft hum.

What it must never become:
- Not Bollywood and not an Indian soap. No song-and-dance, no item numbers, no slow-motion hair flips, no thunder-and-zoom reaction shots, no glittering sets, no heavy bridal glamour in everyday scenes.
- No Hindi vocabulary in the voice-over (write "mohabbat", "zindagi", "khandaan", "faisla"; never "pyaar", "parivaar", "dharm", "shanti"). No Indian cultural markers such as sindoor, bindi, mangalsutra, mandir or sarees as everyday wear.
- No action-film visuals, guns, chases or explosions unless the story is plainly about them.
- No text, captions, logos or watermarks inside any picture.

Stay faithful to the story you are given. Do not invent plot. Reply with a JSON object only, no prose and no code fence.`;

async function planTeaser(storyId: string, input: ReturnType<typeof teaserCreateSchema.parse>) {
  const story = await Story.findById(storyId).lean();
  if (!story) throw notFound('Story');
  if (!story.oneLiner) throw new HttpError(409, 'Write the one-liner first. The teaser is planned from it');
  const [characters, pilot] = await Promise.all([
    Character.find({ storyId }).lean(),
    ScriptEpisode.findOne({ storyId, status: 'written' }).sort({ number: 1 }).lean(),
  ]);
  const t = teaserTiming(input.durationSeconds);
  const music = input.music === 'no_music' ? 'none' : `${TEASER_MUSIC_LABELS[input.music]}${input.musicNotes ? `. Also: ${input.musicNotes}` : ''}`;
  const voice = !input.voiceOver ? 'No voice-over. Return an empty string for voiceOverScript.'
    : input.voiceLanguage === 'urdu'
      ? `A ${input.voice} narrator, in Urdu written in Urdu script (so it is pronounced correctly), at most ${t.voiceOverWords} words in total, three to five short lines separated by line breaks.`
      : `A ${input.voice} narrator, in English, at most ${t.voiceOverWords} words in total, three to five short lines separated by line breaks.`;

  const raw = await generateText(PROMO_SYSTEM, `Plan a ${input.durationSeconds}-second first-look teaser for the drama serial "${story.title}".

Tone the producer asked for: ${input.tone}.
Music the producer asked for: ${music}.
Voice-over: ${voice}

Return this JSON object:
{
  "characters": [{ "name": "...", "look": "..." }],
  "shots": [{ "visual": "...", "motion": "..." }],
  "voiceOverScript": "...",
  "musicPrompt": "..."
}

Rules for each field:
- "characters": only the people who appear in the shots, at most 5. "look" is one fixed, specific physical description in English that will be repeated word for word in every picture so the person looks the same each time: age, build, face shape, skin tone, hair, facial hair, and the exact clothes and colours they wear. Invent an ordinary, believable Pakistani face; never name or resemble a real actor or public figure.
- "shots": exactly ${t.shots} shots, in the order they play, each about ${t.shotSeconds} seconds. Together they tell the heart of the story: the world, the person, what is at stake, the pressure, the turn, and an open question. "visual" is an English description of one photographable moment: who (by name), where exactly, what they are doing, the framing (wide, medium, close-up), the time of day and light. "motion" is one sentence on the small natural movement and slow camera move in that shot.
- "voiceOverScript": as specified above.
- "musicPrompt": ${input.music === 'no_music' ? 'an empty string.' : 'one English sentence describing instrumental music for the whole teaser: instruments, mood, tempo and how it builds, written for a music generator. Instrumental only, no lyrics.'}

The story (one-liner):
${story.oneLiner}

Characters the writer defined:
${characters.map((c) => `- ${c.name}${c.ageRange ? `, ${c.ageRange}` : ''}: ${c.description ?? ''}`).join('\n') || '(none listed; take them from the one-liner)'}
${pilot ? `\nOpening of the pilot script, for concrete moments and settings:\n${pilot.content.slice(0, 5000)}` : ''}`, 3500);

  const plan = teaserPlanSchema.parse(extractJsonObject(raw));
  return { plan: { ...plan, shots: plan.shots.slice(0, t.shots) }, title: story.title };
}

type CreateInput = ReturnType<typeof teaserCreateSchema.parse>;

const musicBrief = (input: CreateInput) => (input.music === 'no_music' ? 'none' : `${TEASER_MUSIC_LABELS[input.music]}${input.musicNotes ? `. Also: ${input.musicNotes}` : ''}`);
function voiceBrief(input: CreateInput, words: number) {
  if (!input.voiceOver) return 'No voice-over. Return an empty string for voiceOverScript.';
  const language = input.voiceLanguage === 'urdu' ? 'in Urdu written in Urdu script (so it is pronounced correctly)' : 'in English';
  return `A ${input.voice} narrator, ${language}, at most ${words} words in total, two to four short lines separated by line breaks.`;
}

/**
 * Turns one storyboard scene into a video plan, frame for frame.
 * The shots are the storyboard frames in their order; nothing is added, dropped or reordered.
 */
async function planScene(input: CreateInput & { scriptEpisodeId: string; sceneNumber: number }) {
  const [story, episode, frames, characters] = await Promise.all([
    Story.findById(input.storyId).lean(),
    ScriptEpisode.findById(input.scriptEpisodeId).lean(),
    StoryboardFrame.find({ scriptEpisodeId: input.scriptEpisodeId, sceneNumber: input.sceneNumber, status: { $in: ['approved', 'needs_review', 'needs_image'] } }).sort({ order: 1 }).lean(),
    Character.find({ storyId: input.storyId }).lean(),
  ]);
  if (!story) throw notFound('Story');
  if (!episode) throw notFound('Episode');
  if (!frames.length) throw new HttpError(409, 'This scene has no storyboard frames yet. Draw the scene first');
  const range = sceneDurationRange(frames.length);
  if (input.durationSeconds < range.min || input.durationSeconds > range.max) {
    throw new HttpError(400, `This scene has ${frames.length} frames, so the video can be ${range.min} to ${range.max} seconds long`);
  }
  const heading = sceneMarks(episode.content).find((m) => m.number === input.sceneNumber)?.heading ?? `Scene ${input.sceneNumber}`;
  const seconds = Math.round(((input.durationSeconds - TEASER_END_CARD_SECONDS) / frames.length) * 10) / 10;

  const raw = await generateText(PROMO_SYSTEM, `A director has storyboarded one scene of the drama serial "${story.title}" as ${frames.length} pencil-sketch frames. Turn that storyboard into a realistic live-action version, frame for frame, so the team can see exactly how the scene will look on screen.

This is not a promo and not a summary. Do not add, drop, merge or reorder frames. Each shot must show the same moment, the same people, the same action and the same framing as its storyboard frame.

Scene heading: ${heading}
Mood the producer asked for: ${input.tone}.
Music the producer asked for: ${musicBrief(input)}.
Voice-over: ${voiceBrief(input, Math.floor((input.durationSeconds - 4) * 1.6))} If there is a voice-over it only says what this scene is about; it does not tell the rest of the story.

Return this JSON object:
{
  "characters": [{ "name": "...", "look": "..." }],
  "shots": [{ "visual": "...", "motion": "..." }],
  "voiceOverScript": "...",
  "musicPrompt": "..."
}

Rules for each field:
- "characters": only the named people who appear in these frames. "look" is one fixed, specific physical description in English that will be repeated word for word in every picture so the person looks the same each time: age, build, face shape, skin tone, hair, facial hair, and the exact clothes and colours they wear in this scene. Take clothing and props from the scene text. Invent an ordinary, believable Pakistani face; never name or resemble a real actor or public figure.
- "shots": exactly ${frames.length} shots, shot 1 for frame 1 and so on, each about ${seconds} seconds on screen. "visual" is an English description of that exact frame as a photograph: who (by name), where exactly, what they are doing at that instant, the framing given for the frame (keep it: wide stays wide, close-up stays close-up), the time of day and the light from the scene heading. Keep continuity between shots: same place, same weather, same light, same clothes, same props. "motion" is one sentence describing the movement that happens in that frame, taken from its action, plus a slow natural camera move.
- "voiceOverScript": as specified above.
- "musicPrompt": ${input.music === 'no_music' ? 'an empty string.' : 'one English sentence describing instrumental music for this scene: instruments, mood and tempo, written for a music generator. Instrumental only, no lyrics.'}

The storyboard frames, in order:
${frames.map((f, i) => `Frame ${i + 1} (${f.shot ?? 'shot'}): ${f.action ?? ''}${f.dialogue ? ` Line spoken: "${f.dialogue}"` : ''}\n  Sketch description: ${f.prompt ?? ''}`).join('\n')}

The scene as written in the script:
${sceneText(episode.content, input.sceneNumber).slice(0, 4000)}

Characters the writer defined:
${characters.map((c) => `- ${c.name}${c.ageRange ? `, ${c.ageRange}` : ''}: ${c.description ?? ''}`).join('\n') || '(none listed)'}`, 3500);

  const plan = teaserPlanSchema.parse(extractJsonObject(raw));
  // The shot list must match the storyboard one to one. If the model miscounted, fall back to the frames themselves.
  const shots = frames.map((f, i) => plan.shots.length === frames.length
    ? plan.shots[i]
    : { visual: `${f.shot ?? 'Shot'} of this moment: ${f.prompt ?? f.action ?? ''}`, motion: f.action ?? '' });
  return { plan: { ...plan, shots }, sceneHeading: heading };
}

teasersRouter.get('/status', (_req, res) => { res.json({ images: higgsfieldReady(), audio: audioReady() }); });

teasersRouter.get('/', h(async (req, res) => {
  res.json(await Teaser.find({ storyId: oid(req.query.storyId, 'storyId') }).sort({ createdAt: -1 }).limit(20).lean());
}));

/** Step one: answer the questions, get a plan to review. Nothing is generated at Higgsfield yet. */
teasersRouter.post('/', h(async (req, res) => {
  const input = teaserCreateSchema.parse(req.body);
  if (Boolean(input.scriptEpisodeId) !== Boolean(input.sceneNumber)) throw new HttpError(400, 'Choose both the episode and the scene');
  const scene = input.scriptEpisodeId && input.sceneNumber ? await planScene({ ...input, scriptEpisodeId: input.scriptEpisodeId, sceneNumber: input.sceneNumber }) : null;
  const { plan } = scene ?? await planTeaser(input.storyId, input);
  res.status(201).json(await Teaser.create({
    ...input, ...plan, sceneHeading: scene?.sceneHeading,
    shots: plan.shots.map((s) => ({ ...s, status: 'waiting' })),
    status: 'planned', createdBy: me(req).name,
  }));
}));

teasersRouter.get('/:id', h(async (req, res) => {
  const teaser = await Teaser.findById(oid(req.params.id)).lean();
  if (!teaser) throw notFound('Teaser');
  res.json({ ...teaser, hasVideo: existsSync(teaserFile(String(teaser._id))) });
}));

/** Edit the plan. A shot whose picture description changed is drawn again on the next render. */
teasersRouter.patch('/:id', h(async (req, res) => {
  const input = teaserUpdateSchema.parse(req.body);
  const teaser = await Teaser.findById(oid(req.params.id));
  if (!teaser) throw notFound('Teaser');
  if (['queued', 'rendering'].includes(teaser.status)) throw new HttpError(409, 'Wait for the teaser to finish before changing it');
  const looksChanged = input.characters !== undefined && JSON.stringify(input.characters) !== JSON.stringify(teaser.characters.map((c) => ({ name: c.name, look: c.look })));
  if (input.shots) {
    if (input.shots.length !== teaser.shots.length) throw new HttpError(400, `This teaser has ${teaser.shots.length} shots. Keep the same number`);
    input.shots.forEach((next, i) => {
      const shot = teaser.shots[i];
      if (next.visual !== shot.visual || looksChanged) shot.set({ imageUrl: null, clipUrl: null, status: 'waiting', error: null });
      else if (next.motion !== shot.motion) shot.set({ clipUrl: null, status: 'waiting', error: null });
      shot.set({ visual: next.visual, motion: next.motion });
    });
  } else if (looksChanged) {
    teaser.shots.forEach((shot) => shot.set({ imageUrl: null, clipUrl: null, status: 'waiting', error: null }));
  }
  const { shots: _shots, ...rest } = input;
  teaser.set(rest);
  await teaser.save();
  res.json(teaser);
}));

/** Step two: make it. Shots that are already done are reused, so a retry only pays for what is missing. */
teasersRouter.post('/:id/render', h(async (req, res) => {
  if (!higgsfieldReady()) throw new HttpError(503, 'Pictures and clips are not set up yet. Add HIGGSFIELD_API_KEY on the server');
  const teaser = await Teaser.findById(oid(req.params.id));
  if (!teaser) throw notFound('Teaser');
  if (['queued', 'rendering'].includes(teaser.status)) throw new HttpError(409, 'This teaser is already being made');
  teaser.set({ status: 'queued', step: 'Waiting to start', error: null });
  await teaser.save();
  // One attempt only: a blind retry would pay for the same pictures and clips twice.
  await storyboardQueue().add('teaser', { kind: 'teaser', teaserId: String(teaser._id) }, { attempts: 1, removeOnComplete: 50, removeOnFail: 100 });
  res.status(202).json(teaser);
}));

teasersRouter.get('/:id/video', h(async (req, res) => {
  const file = teaserFile(oid(req.params.id));
  if (!existsSync(file)) throw notFound('Teaser video');
  if (req.query.download) res.setHeader('Content-Disposition', `attachment; filename="teaser-${req.params.id}.mp4"`);
  res.sendFile(file, { headers: { 'Content-Type': 'video/mp4', 'Cache-Control': 'private, no-cache' } });
}));

teasersRouter.delete('/:id', h(async (req, res) => {
  const teaser = await Teaser.findById(oid(req.params.id));
  if (!teaser) throw notFound('Teaser');
  if (['queued', 'rendering'].includes(teaser.status)) throw new HttpError(409, 'Wait for the teaser to finish before deleting it');
  await teaser.deleteOne();
  const { rm } = await import('node:fs/promises');
  await rm(teaserFile(String(teaser._id)), { force: true });
  res.status(204).end();
}));

export const END_CARD = TEASER_END_CARD_SECONDS;
