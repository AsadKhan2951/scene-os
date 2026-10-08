import { existsSync } from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import { TEASER_END_CARD_SECONDS, TEASER_MUSIC_LABELS, extractJsonObject, sceneDurationRange, sceneMarks, sceneText, teaserCreateSchema, teaserPlanSchema, teaserTiming, teaserUpdateSchema } from '@sceneos/shared';
import { env } from '../config/env';
import { Character, ScriptEpisode, Story, StoryboardFrame, Teaser } from '../models';
import { me } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { generateJson } from '../lib/anthropic';
import { ART_DIRECTOR, ART_DIRECTOR_SHORT } from '../lib/artDirector';
import { audioReady } from '../lib/elevenlabs';
import { higgsfieldReady } from '../lib/higgsfield';
import { storyboardQueue } from '../lib/queue';

export const teasersRouter = Router();
export const teaserFile = (id: string) => path.join(env.MEDIA_DIR, 'teasers', `${id}.mp4`);

/** A character who already has a face keeps it: the planner may change the clothes for a new scene, never the person. */
type Cast = { name: string; ageRange?: string | null; description?: string | null; look?: string | null }[];
const establishedRule = (cast: Cast) => (cast.some((c) => c.look)
  ? ' Some characters below already have an established look from an earlier video. For them, copy the physical part of that look word for word and only change the clothes if this material needs different ones.'
  : '');
const castLines = (cast: Cast) => cast.map((c) => `- ${c.name}${c.ageRange ? `, ${c.ageRange}` : ''}: ${c.description ?? ''}${c.look ? `\n  Established look: ${c.look}` : ''}`).join('\n');

async function planTeaser(storyId: string, input: ReturnType<typeof teaserCreateSchema.parse>) {
  const story = await Story.findById(storyId).lean();
  if (!story) throw notFound('Story');
  if (!story.oneLiner) throw new HttpError(409, 'Write the one-liner first. The teaser is planned from it');
  const [characters, pilot] = await Promise.all([
    Character.find({ storyId }).lean(),
    ScriptEpisode.findOne({ storyId, status: 'written' }).sort({ number: 1 }).lean(),
  ]);
  const t = teaserTiming(input.durationSeconds);
  const established = establishedRule(characters);
  const music = input.music === 'no_music' ? 'none' : `${TEASER_MUSIC_LABELS[input.music]}${input.musicNotes ? `. Also: ${input.musicNotes}` : ''}`;
  const voice = !input.voiceOver ? 'No voice-over. Return an empty string for voiceOverScript.'
    : input.voiceLanguage === 'urdu'
      ? `A ${input.voice} narrator, in Urdu written in Urdu script (so it is pronounced correctly), at most ${t.voiceOverWords} words in total, three to five short lines separated by line breaks.`
      : `A ${input.voice} narrator, in English, at most ${t.voiceOverWords} words in total, three to five short lines separated by line breaks.`;

  const plan = await generateJson(ART_DIRECTOR, `Plan a ${input.durationSeconds}-second first-look teaser for the drama serial "${story.title}".

Tone the producer asked for: ${input.tone}.
Music the producer asked for: ${music}.
Voice-over: ${voice}

Return this JSON object:
{
  "sceneBible": "...",
  "characters": [{ "name": "...", "look": "..." }],
  "shots": [{ "visual": "...", "motion": "...", "cast": ["..."] }],
  "voiceOverScript": "...",
  "musicPrompt": "..."
}

Rules for each field:
- "sceneBible": two or three sentences that fix the serial's overall look: the city and class of home, the season, the colour palette and the kind of light. It is attached to every picture.
- "characters": only the people who appear in the shots, at most 5. "look" is one fixed physical description in English, used to cast a single face that every shot is drawn from: exact age, build, height, face shape, skin tone, eyes, nose, hair and how it is worn, facial hair, any mark, then the exact clothes with fabric and colour.${established}
- "shots": exactly ${t.shots} shots, in the order they play, each about ${t.shotSeconds} seconds. Together they tell the heart of the story: the world, the person, what is at stake, the pressure, the turn, and an open question. "visual" is one photograph in English: who (by name only, never re-describe their face or clothes), where exactly, the frozen action, how they face the camera, shot size and lens, light. "motion" is the one simple action and the one slow camera move. "cast" lists the names of the characters visible in the shot, empty when nobody is.
- "voiceOverScript": as specified above.
- "musicPrompt": ${input.music === 'no_music' ? 'an empty string.' : 'one English sentence describing instrumental music for the whole teaser: instruments, mood, tempo and how it builds, written for a music generator. Instrumental only, no lyrics.'}

The story (one-liner):
${story.oneLiner}

Characters the writer defined:
${castLines(characters) || '(none listed; take them from the one-liner)'}
${pilot ? `\nOpening of the pilot script, for concrete moments and settings:\n${pilot.content.slice(0, 5000)}` : ''}`, (raw) => teaserPlanSchema.parse(extractJsonObject(raw)), ART_DIRECTOR_SHORT);

  return { plan: { ...plan, shots: plan.shots.slice(0, t.shots) }, title: story.title };
}

/** Everything the director fixed on a storyboard frame, written out for the planner. */
function frameBrief(f: { shot?: string | null; action?: string | null; dialogue?: string | null; prompt?: string | null; location?: string | null; light?: string | null; lens?: string | null; camera?: string | null; props?: string | null; redrawNote?: string | null; cast?: { name?: string | null; wardrobe?: string | null; facing?: string | null }[] | null }, i: number) {
  const lines = [`Frame ${i + 1} (${f.shot ?? 'shot'}): ${f.action ?? ''}${f.dialogue ? ` Line spoken: "${f.dialogue}"` : ''}`];
  for (const c of f.cast ?? []) lines.push(`  ${c.name}: wearing ${c.wardrobe || 'not specified'}; facing ${c.facing || 'not specified'}`);
  if (f.location) lines.push(`  Place: ${f.location}`);
  if (f.light) lines.push(`  Light: ${f.light}`);
  if (f.lens || f.camera) lines.push(`  Camera: ${[f.lens, f.camera].filter(Boolean).join(', ')}`);
  if (f.props) lines.push(`  Props: ${f.props}`);
  if (f.redrawNote) lines.push(`  Director's note: ${f.redrawNote}`);
  lines.push(`  Sketch description: ${f.prompt ?? ''}`);
  return lines.join('\n');
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
  const established = establishedRule(characters);

  const plan = await generateJson(ART_DIRECTOR, `A director has storyboarded one scene of the drama serial "${story.title}" as ${frames.length} pencil-sketch frames. Turn that storyboard into a realistic live-action version, frame for frame, so the team can see exactly how the scene will look on screen.

This is not a promo and not a summary. Do not add, drop, merge or reorder frames. Each shot must show the same moment, the same people, the same action and the same framing as its storyboard frame.

Scene heading: ${heading}
Mood the producer asked for: ${input.tone}.
Music the producer asked for: ${musicBrief(input)}.
Voice-over: ${voiceBrief(input, Math.floor((input.durationSeconds - 4) * 1.6))} If there is a voice-over it only says what this scene is about; it does not tell the rest of the story.

Return this JSON object:
{
  "sceneBible": "...",
  "characters": [{ "name": "...", "person": "...", "look": "..." }],
  "shots": [{ "visual": "...", "motion": "...", "cast": ["..."] }],
  "voiceOverScript": "...",
  "musicPrompt": "..."
}

Rules for each field:
- "sceneBible": three or four sentences that fix this one place at this one hour, taken from the scene heading and text: what the location looks like and what stands on each side, the weather, exactly where the light comes from and its colour, the palette, and which way the main character travels through it. It is attached to every picture, so it must be true for all of them.
- "characters": only the named people who appear in these frames. "look" is one fixed physical description in English, used to cast a single face that every shot is drawn from: exact age, build, height, face shape, skin tone, eyes, nose, hair and how it is worn, facial hair, any mark, then the exact clothes with fabric and colour and the props they carry in this scene, taken from the frames' wardrobe notes first and the scene text second.${established} "person" is the character's plain name. Normally there is one entry per person and "name" equals "person". If the frames put a person in different clothes at different points of the scene (a costume change), return one entry per costume: the same "person", a "name" such as "Mannat (blue chadar)", the physical part of "look" copied word for word, and only the clothes different.
- "shots": exactly ${frames.length} shots, shot 1 for frame 1 and so on, each about ${seconds} seconds on screen. "visual" is that exact frame as one photograph in English: who (by name only, never re-describe their face or clothes), where they stand in the place set by the sceneBible, the action frozen at that instant, how they face the camera (keep what the frame shows: from behind stays from behind), the frame's shot size (wide stays wide, close-up stays close-up) with its lens, and the light. "motion" is the one simple action that frame describes, starting from that pose, then one slow camera move. "cast" lists the "name" of each characters entry visible in the shot, using the entry with the costume that frame calls for; empty when nobody is.
- The frames' own notes on wardrobe, facing, lens, light and props are the director's decisions. Follow them exactly; only fill what they leave open.
- "voiceOverScript": as specified above.
- "musicPrompt": ${input.music === 'no_music' ? 'an empty string.' : 'one English sentence describing instrumental music for this scene: instruments, mood and tempo, written for a music generator. Instrumental only, no lyrics.'}

The storyboard frames, in order:
${frames.map((f, i) => frameBrief(f, i)).join('\n')}

The scene as written in the script:
${sceneText(episode.content, input.sceneNumber).slice(0, 4000)}

Characters the writer defined:
${castLines(characters) || '(none listed)'}`, (raw) => teaserPlanSchema.parse(extractJsonObject(raw)), ART_DIRECTOR_SHORT);

  // The shot list must match the storyboard one to one. If the model miscounted, fall back to the frames themselves.
  const shots = frames.map((f, i) => plan.shots.length === frames.length
    ? plan.shots[i]
    : { visual: `${f.shot ?? 'Shot'} of this moment: ${f.prompt ?? f.action ?? ''}`, motion: f.action ?? '', cast: [] as string[] });
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
  const before = new Map(teaser.characters.map((c) => [c.name, c]));
  const looksChanged = input.characters !== undefined && JSON.stringify(input.characters) !== JSON.stringify(teaser.characters.map((c) => ({ name: c.name, look: c.look })));
  const bibleChanged = input.sceneBible !== undefined && input.sceneBible !== teaser.sceneBible;
  const redrawAll = looksChanged || bibleChanged;
  if (input.shots) {
    if (input.shots.length !== teaser.shots.length) throw new HttpError(400, `This video has ${teaser.shots.length} shots. Keep the same number`);
    input.shots.forEach((next, i) => {
      const shot = teaser.shots[i];
      if (next.visual !== shot.visual || redrawAll) shot.set({ imageUrl: null, clipUrl: null, status: 'waiting', error: null });
      else if (next.motion !== shot.motion) shot.set({ clipUrl: null, status: 'waiting', error: null });
      shot.set({ visual: next.visual, motion: next.motion });
    });
  } else if (redrawAll) {
    teaser.shots.forEach((shot) => shot.set({ imageUrl: null, clipUrl: null, status: 'waiting', error: null }));
  }
  const { shots: _shots, characters, ...rest } = input;
  teaser.set(rest);
  // The cast face belongs to the person, so it survives an edit of the description; only the shots are redrawn.
  if (characters) teaser.set({ characters: characters.map((c) => ({ ...c, person: before.get(c.name)?.person, refImageUrl: before.get(c.name)?.refImageUrl, soulId: before.get(c.name)?.soulId })) });
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
