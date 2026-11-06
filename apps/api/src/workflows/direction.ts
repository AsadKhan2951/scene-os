import { z } from 'zod';
import { PITCH_AUDIENCE_LABELS, PITCH_SLIDES, STYLE_PRESET_LABELS, extractJsonObject, type PitchAudience, type StylePreset } from '@sceneos/shared';
import { Character, Location, LookBook, PitchDeck, Person, Production, Scene, ScriptEpisode, Story, StoryboardFrame } from '../models';
import { defineWorkflow } from '../lib/runs';
import { generateJson } from '../lib/anthropic';
import { artDirectorFor } from '../lib/artDirector';
import { styleForStory } from '../lib/style';
import { generateImage, generateImageFrom, keep } from '../lib/higgsfield';
import { castFace, faceForFrame } from '../lib/casting';

/**
 * Direction runs: the AI Director's realistic render of a storyboard frame, the look book and the
 * pitch deck. Every one starts from what is already decided (continuity sheet, locked faces,
 * location boards, costume looks), so the pictures and words agree with the storyboard.
 */

const nul = <T extends z.ZodTypeAny>(t: T) => t.nullish().transform((v) => v ?? undefined);
const facingAway = (facing: string | null | undefined) => /\b(back|behind|away)\b/i.test(facing ?? '');

// ---- Realistic render of one frame ----
export interface RenderInput { frameId: string; preset?: StylePreset; lens?: string; camera?: string; light?: string; aspect?: string }

/** The frame's story and the scene it belongs to. */
async function frameContext(frameId: string) {
  const frame = await StoryboardFrame.findById(frameId);
  if (!frame) throw new Error('Frame not found');
  const episode = await ScriptEpisode.findById(frame.scriptEpisodeId).select('storyId').lean();
  if (!episode) throw new Error('Episode not found');
  // In a serial every episode numbers its scenes from 1, so the scene is found within the frame's episode.
  const scene = await Scene.findOne({ storyId: episode.storyId, scriptEpisodeId: frame.scriptEpisodeId, number: frame.sceneNumber }).lean()
    ?? await Scene.findOne({ storyId: episode.storyId, number: frame.sceneNumber }).lean();
  const location = scene?.locationId ? await Location.findById(scene.locationId).lean() : null;
  return { frame, storyId: episode.storyId, scene, location };
}

/** The photographic prompt for one frame, from its continuity sheet and the chosen look. */
async function composePrompt(frameId: string, look: Omit<RenderInput, 'frameId'>) {
  const { frame, storyId, location } = await frameContext(frameId);
  const style = await styleForStory(storyId);
  const brief = artDirectorFor({ ...style, preset: look.preset ?? style.preset });
  const sheet = [
    ...frame.cast.map((c) => `${c.name}: wears ${c.wardrobe || 'as established'}; ${c.facing || 'facing camera'}`),
    `Place: ${frame.location || location?.description || location?.name || 'as in the scene'}`,
    `Light: ${look.light || frame.light || 'as the scene sets it'}`,
    `Lens: ${look.lens || frame.lens || 'as the frame label says'}`,
    `Camera: ${look.camera || frame.camera || 'still'}`,
    frame.props ? `Props: ${frame.props}` : '',
  ].filter(Boolean).join('\n');
  await StoryboardFrame.updateOne({ _id: frameId }, { $set: { 'render.status': 'drawing', 'render.error': null } });
  return generateJson(brief.short, `Turn this storyboard frame into one prompt for a photorealistic film still, ${look.aspect ?? '16:9'}.
Keep the frame exactly: same moment, same people in the same places, the same shot size and the same way each person faces the camera. Someone seen from behind stays seen from behind.
Frame label: ${frame.shot ?? ''}
Action: ${frame.action ?? ''}
Sketch description: ${frame.prompt ?? ''}
Continuity sheet:
${sheet}
Look of the film: ${brief.look}
${location?.palette?.length ? `Location palette: ${location.palette.join(', ')}` : ''}
Reply with { "prompt": one English paragraph under 120 words: who by name, where they stand, the frozen action, facing, shot size and lens, light and colour, film grain. No text in the picture. }`,
  (raw) => z.object({ prompt: z.string().min(10) }).parse(extractJsonObject(raw)).prompt, undefined, 3000, 'fast');
}

export const renderWorkflow = defineWorkflow<RenderInput>({
  type: 'frame.render',
  title: 'Realistic frame',
  feature: 'direction',
  quote: 'direction.render',
  steps: [{ key: 'compose', label: 'Read the continuity sheet' }, { key: 'draw', label: 'Render the frame' }],
  async run(r) {
    const { frameId, ...look } = r.input;
    // A failed attempt keeps the last good render on screen, with the error beside it.
    const failed = async (err: unknown) => {
      const before = await StoryboardFrame.findById(frameId).select('render.url').lean();
      await StoryboardFrame.updateOne({ _id: frameId }, { $set: { 'render.status': before?.render?.url ? 'ready' : 'failed', 'render.error': (err instanceof Error ? err.message : 'Render failed').slice(0, 300) } });
    };
    const prompt = await r.step('compose', async () => {
      try { return await composePrompt(frameId, look); } catch (err) { await failed(err); throw err; }
    });

    await r.step('draw', async () => {
      const { frame, storyId, location } = await frameContext(frameId);
      const names = frame.cast.filter((c) => !facingAway(c.facing)).map((c) => (c.name ?? '').toUpperCase());
      const characters = names.length ? await Character.find({ storyId }).select('name soulId lookImageUrl').lean() : [];
      const face = { soulId: faceForFrame(frame.cast, characters) };
      const photo = characters.find((c) => names.includes(c.name.toUpperCase()) && c.lookImageUrl);
      const plate = location?.board?.[0]?.imageUrl;
      try {
        // A trained face is the strongest hold on a person; otherwise the casting photo and the location plate guide the picture.
        const made = face?.soulId
          ? await generateImage(prompt, face.soulId, 1, look.aspect)
          : photo?.lookImageUrl || plate
            ? await generateImageFrom(`${prompt} Keep the person's face from the first reference${plate ? ' and the place from the location photo' : ''}.`, [photo?.lookImageUrl, plate].filter((u): u is string => !!u), look.aspect)
            : await generateImage(prompt, undefined, 1, look.aspect);
        const kept = await keep(made, `renders/${frame._id}-${Date.now()}.jpg`);
        frame.set({ render: { url: kept.url, status: 'ready', error: null, preset: look.preset, lens: look.lens, camera: look.camera, light: look.light, aspect: look.aspect ?? '16:9', prompt, at: new Date() } });
        await frame.save();
        return kept.url;
      } catch (err) {
        await failed(err);
        throw err;
      }
    });
  },
});

// ---- A fixed face for one character ----
export const faceWorkflow = defineWorkflow<{ characterId: string }>({
  type: 'character.face',
  title: 'Fixed face',
  feature: 'direction',
  quote: 'direction.face',
  steps: [{ key: 'cast', label: 'Cast and train the face' }],
  async run(r) {
    await r.step('cast', async () => {
      const made = await castFace(r.input.characterId, (text) => r.note('cast', text));
      return made.lookImageUrl;
    });
  },
});

// ---- What the film already knows about itself, for the look book and the pitch ----
async function filmFacts(storyId: string) {
  const story = await Story.findById(storyId).lean();
  if (!story) throw new Error('Story not found');
  const [production, characters, locations, episodes] = await Promise.all([
    story.productionId ? Production.findById(story.productionId).lean() : null,
    Character.find({ storyId }).lean(),
    story.productionId ? Location.find({ productionId: story.productionId }).lean() : [],
    ScriptEpisode.find({ storyId }).select('_id').lean(),
  ]);
  const frames = await StoryboardFrame.find({ scriptEpisodeId: { $in: episodes.map((e) => e._id) }, status: { $in: ['approved', 'needs_review'] } })
    .sort({ keyFrame: -1, sceneNumber: 1, order: 1 }).limit(60).lean();
  const style = await styleForStory(storyId);
  const roleRank = { lead: 0, antagonist: 1, supporting: 2, minor: 3 } as Record<string, number>;
  const cast = [...characters].sort((a, b) => (roleRank[a.role ?? 'minor'] ?? 3) - (roleRank[b.role ?? 'minor'] ?? 3) || (b.sceneCount ?? 0) - (a.sceneCount ?? 0)).slice(0, 8);
  const text = [
    `Title: ${story.title}`, story.logline ? `Logline: ${story.logline}` : '', story.genre ? `Genre: ${story.genre}` : '',
    `Style: ${STYLE_PRESET_LABELS[style.preset]}, set in ${style.country ?? 'the script\'s country'}, dialogue in ${style.language ?? 'the script\'s language'}.`,
    production ? `Format: ${production.format}, ${production.totalEpisodes} episodes${production.channel ? `, for ${production.channel}` : ''}. Budget: ${production.totalBudget ? `${production.currency} ${production.totalBudget.toLocaleString('en-US')}` : 'not set'}.` : '',
    story.stats ? `Script: ${story.stats.scenes ?? '?'} scenes, ${story.stats.pages ?? '?'} pages, about ${story.stats.runtimeMinutes ?? '?'} minutes.` : '',
    story.coverage?.summary ? `Coverage: ${story.coverage.summary}` : '',
    `Story: ${(story.oneLiner || '').slice(0, 6000)}`,
    `Characters:\n${cast.map((c) => `- ${c.name} (${c.role ?? 'role not set'}): ${[c.description, c.want && `wants ${c.want}`, c.arc && `arc: ${c.arc}`, c.physical].filter(Boolean).join('; ')}${c.looks?.length ? ` Costume looks: ${c.looks.map((l) => `${l.name} (${l.items.map((i) => `${i.name} ${i.color ?? ''}`).join(', ')})`).join('; ')}` : ''}`).join('\n')}`,
    `Locations:\n${locations.slice(0, 12).map((l) => `- ${l.name}: ${l.description ?? ''}${l.palette?.length ? ` palette ${l.palette.join(' ')}` : ''}`).join('\n') || '(none grouped yet)'}`,
    `Storyboard frames (id: scene, shot, action):\n${frames.map((f) => `- ${f._id}: sc ${f.sceneNumber}, ${f.shot ?? ''}, ${f.action ?? ''}${f.keyFrame ? ' [KEY]' : ''}`).join('\n') || '(none yet)'}`,
  ].filter(Boolean).join('\n');
  return { story, production, characters: cast, locations, frames, style, text };
}

const frameImage = (f: { render?: { url?: string | null } | null; imageUrl?: string | null }) => f.render?.url || f.imageUrl || undefined;

// ---- Look book ----
export interface LookBookInput { storyId: string }

const lookBookSchema = z.object({
  vision: z.string(),
  palette: z.array(z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i), name: z.string(), use: z.string() })).min(3).max(8),
  sections: z.array(z.object({ key: z.enum(['tone', 'light', 'camera', 'wardrobe', 'production_design', 'sound']), title: z.string(), body: z.string() })).min(4).max(6),
  characters: z.array(z.object({ name: z.string(), look: z.string() })).max(8),
  locations: z.array(z.object({ name: z.string(), mood: z.string() })).max(12),
  keyFrameIds: z.array(z.string()).max(12).catch([]),
});

export const lookBookWorkflow = defineWorkflow<LookBookInput>({
  type: 'direction.lookbook',
  title: 'Look book',
  feature: 'direction',
  quote: 'direction.lookbook',
  steps: [{ key: 'write', label: 'Write the look book' }, { key: 'save', label: 'Lay out pictures' }],
  async run(r) {
    const facts = await filmFacts(r.input.storyId);
    const brief = artDirectorFor(facts.style);
    const book = await r.step('write', () => generateJson(`${brief.full}\nYou are the film's director writing its look book for the crew. Reply with JSON only.`, `Write the look book for this film from what has been decided so far. Do not invent cast, places or plot that are not below.
${facts.text}

Reply with {
 "vision": two short paragraphs: how the film should feel and why it looks the way it does,
 "palette": 4 to 6 colours { "hex": "#rrggbb", "name": plain name, "use": where it appears },
 "sections": one each for tone, light, camera, wardrobe, production_design and sound: { "key", "title", "body": 3 to 5 sentences of concrete choices },
 "characters": the main characters { "name", "look": 1 to 2 sentences on how they look and dress and how that changes },
 "locations": the main places { "name" (as listed), "mood": one sentence },
 "keyFrameIds": up to 9 storyboard frame ids (from the list) that best show the film, in story order
}`, (raw) => lookBookSchema.parse(extractJsonObject(raw)), brief.short, 12000));

    await r.step('save', async () => {
      const byId = new Map(facts.frames.map((f) => [String(f._id), f]));
      const keyFrames = book.keyFrameIds.filter((id) => byId.has(id));
      const images = keyFrames.map((id) => frameImage(byId.get(id)!)).filter((u): u is string => !!u);
      const charImage = (name: string) => facts.characters.find((c) => c.name.toUpperCase() === name.toUpperCase())?.lookImageUrl ?? undefined;
      const loc = (name: string) => facts.locations.find((l) => l.name.toUpperCase() === name.toUpperCase());
      await LookBook.findOneAndUpdate({ storyId: r.input.storyId }, {
        storyId: r.input.storyId, productionId: facts.story.productionId, title: facts.story.title, logline: facts.story.logline ?? '',
        vision: book.vision, palette: book.palette,
        sections: book.sections.map((s, i) => ({ ...s, imageUrls: images.slice(i * 2, i * 2 + 2) })),
        characters: book.characters.map((c) => ({ ...c, imageUrl: charImage(c.name) })),
        locations: book.locations.map((l) => ({ ...l, imageUrl: loc(l.name)?.board?.[0]?.imageUrl, palette: loc(l.name)?.palette ?? [] })),
        keyFrameIds: keyFrames,
      }, { upsert: true });
      if (keyFrames.length) await StoryboardFrame.updateMany({ _id: { $in: keyFrames } }, { $set: { keyFrame: true } });
      return keyFrames.length;
    });
  },
});

// ---- Pitch deck ----
export interface PitchInput { storyId: string; audience: PitchAudience; deckId: string }

const AUDIENCE_FOCUS: Record<PitchAudience, string> = {
  streamer: 'a streaming platform: binge hook, series engine, global audience, how the episodes end, comparable shows on streamers.',
  tv_channel: 'a TV channel: the slot and the family audience, episode count, advertisers, the stars, the OST.',
  investor: 'a private investor: budget, recoupment plan (TV, digital, international sales), risk and why this team delivers on time.',
  festival_fund: 'a festival or film fund: the director\'s voice, cultural specificity, why this story now, artistic risk.',
};

const slidesSchema = z.object({
  slides: z.array(z.object({
    kind: z.enum(PITCH_SLIDES), title: z.string(), subtitle: nul(z.string()), body: nul(z.string()),
    bullets: z.array(z.string()).max(6).catch([]), image: nul(z.string()), notes: nul(z.string()),
  })).min(10).max(16),
});

export const pitchWorkflow = defineWorkflow<PitchInput>({
  type: 'direction.pitch',
  title: 'Pitch deck',
  feature: 'direction',
  quote: 'direction.pitch',
  steps: [{ key: 'write', label: 'Write 14 slides' }, { key: 'save', label: 'Add pictures' }],
  async run(r) {
    const { storyId, audience, deckId } = r.input;
    const facts = await filmFacts(storyId);
    const book = await LookBook.findOne({ storyId }).lean();
    const team = facts.production ? await Person.find({ productionId: facts.production._id, department: { $in: ['direction', 'production', 'camera', 'cast'] } }).select('name role').limit(8).lean().catch(() => []) : [];
    // The project's own writer and director count as team, as well as people added to it.
    const credits = [
      facts.production?.writer ? `${facts.production.writer} (writer)` : '',
      facts.production?.director ? `${facts.production.director} (director)` : '',
      ...team.map((p) => `${p.name} (${p.role})`),
    ].filter(Boolean);
    const teamLine = credits.length ? `Team: ${[...new Set(credits)].join(', ')}` : 'Team: not entered';
    const deck = await r.step('write', () => generateJson(`You write pitch decks that get films and series made. Plain, confident, specific; no hype words. Reply with JSON only.`, `Write a 14-slide pitch deck for ${PITCH_AUDIENCE_LABELS[audience]}. It is for ${AUDIENCE_FOCUS[audience]}
Only use facts below. Where a fact is missing (budget, team, comparables), write what the producer must fill in, in square brackets, rather than inventing numbers or names. Comparables are titles of real, well-known films or series in the same lane, said plainly as "X meets Y".
${facts.text}
${book ? `Look book vision: ${book.vision}` : ''}
${teamLine}

Reply with { "slides": exactly 14 slides in this order: ${PITCH_SLIDES.join(', ')}. Each { "kind", "title" (under 8 words), "subtitle", "body" (at most 60 words), "bullets" (0 to 5, each under 12 words), "image": one of "character:<name>", "frame:<id>", "location:<name>" or "", "notes": what the presenter says, 2 sentences } }`,
    (raw) => slidesSchema.parse(extractJsonObject(raw)), undefined, 12000));

    await r.step('save', async () => {
      const frameById = new Map(facts.frames.map((f) => [String(f._id), f]));
      const pick = (ref?: string) => {
        if (!ref) return undefined;
        const [kind, ...rest] = ref.split(':');
        const key = rest.join(':').trim();
        if (kind === 'frame') { const f = frameById.get(key); return f ? frameImage(f) : undefined; }
        if (kind === 'character') return facts.characters.find((c) => c.name.toUpperCase() === key.toUpperCase())?.lookImageUrl ?? undefined;
        if (kind === 'location') return facts.locations.find((l) => l.name.toUpperCase() === key.toUpperCase())?.board?.[0]?.imageUrl ?? undefined;
        return undefined;
      };
      // Slides that asked for no picture or a missing one get a key frame, so the deck is never bare.
      const spare = [...(book?.keyFrameIds ?? []).map((id) => frameById.get(String(id))), ...facts.frames].map((f) => (f ? frameImage(f) : undefined)).filter((u): u is string => !!u);
      let s = 0;
      const slides = deck.slides.map((d) => {
        const wantsPicture = ['title', 'world', 'look_book', 'tone', 'story'].includes(d.kind);
        const imageUrl = pick(d.image) ?? (wantsPicture ? spare[s++ % Math.max(1, spare.length)] : undefined);
        return { kind: d.kind, title: d.title, subtitle: d.subtitle, body: d.body, bullets: d.bullets, imageUrl, notes: d.notes };
      });
      await PitchDeck.updateOne({ _id: deckId }, { $set: { slides, title: facts.story.title } });
      return slides.length;
    });
  },
});
