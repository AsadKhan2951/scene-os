import { Router } from 'express';
import ExcelJS from 'exceljs';
import { z } from 'zod';
import { FRAME_ASPECTS, PITCH_AUDIENCES, STYLE_PRESETS, sceneMarks, shotSizeOf } from '@sceneos/shared';
import { AiRun, Character, LookBook, PitchDeck, Scene, ScriptEpisode, Story, StoryboardFrame } from '../models';
import { me } from '../middleware/auth';
import { HttpError, h, notFound, oid } from '../lib/http';
import { setAi } from '../lib/ai/context';
import { ensureCredits } from '../lib/ai/credits';
import { startRun } from '../lib/runs';
import { buildPptx, fetchImage, type DeckSlide } from '../lib/pptx';

/**
 * Direction: the whole film as a storyboard, the AI Director's realistic renders, the shot list,
 * the look book and the pitch deck. Promos and scene previs are made by the teasers module.
 */
export const directionRouter = Router();

async function storyOrThrow(id: unknown) {
  const story = await Story.findById(oid(id, 'storyId')).lean();
  if (!story) throw notFound('Story');
  return story;
}

/** Every frame of the story with the scene it belongs to, in film order. */
async function filmFrames(storyId: unknown) {
  const episodes = await ScriptEpisode.find({ storyId }).sort({ number: 1 }).select('number content').lean();
  const [frames, scenes] = await Promise.all([
    StoryboardFrame.find({ scriptEpisodeId: { $in: episodes.map((e) => e._id) } }).sort({ sceneNumber: 1, order: 1 }).lean(),
    Scene.find({ storyId }).select('number heading location time characters scriptEpisodeId').lean(),
  ]);
  const episodeOf = new Map<string, (typeof episodes)[number]>(episodes.map((e) => [String(e._id), e]));
  const groups = new Map<string, { episodeId: string; episodeNumber: number; sceneNumber: number; heading: string; location: string; time: string; characters: string[]; frames: typeof frames }>();
  for (const f of frames) {
    const ep = episodeOf.get(String(f.scriptEpisodeId));
    if (!ep) continue;
    const key = `${ep.number}:${f.sceneNumber}`;
    if (!groups.has(key)) {
      const scene = scenes.find((s) => s.number === f.sceneNumber && (!s.scriptEpisodeId || String(s.scriptEpisodeId) === String(ep._id)));
      const heading = scene?.heading ?? sceneMarks(ep.content ?? '').find((m) => m.number === f.sceneNumber)?.heading ?? `Scene ${f.sceneNumber}`;
      groups.set(key, {
        episodeId: String(ep._id), episodeNumber: ep.number, sceneNumber: f.sceneNumber, heading,
        location: scene?.location ?? heading.replace(/^(INT|EXT|INT\.?\/EXT)\.?\s*/i, '').split(/\s+-\s+/)[0] ?? '',
        time: scene?.time ?? (heading.split(/\s+-\s+/).pop() ?? ''),
        characters: (scene?.characters ?? []).map((c) => c.toUpperCase()), frames: [],
      });
    }
    groups.get(key)!.frames.push(f);
  }
  return [...groups.values()].sort((a, b) => a.episodeNumber - b.episodeNumber || a.sceneNumber - b.sceneNumber);
}

// ---- Whole-film storyboard ----
directionRouter.get('/stories/:storyId/board', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const q = z.object({ character: z.string().max(100).optional(), location: z.string().max(200).optional(), time: z.enum(['day', 'night', 'dawn_dusk']).optional(), key: z.coerce.boolean().optional() }).parse(req.query);
  const all = await filmFrames(story._id);
  const castOf = (s: (typeof all)[number]) => new Set([...s.characters, ...s.frames.flatMap((f) => f.cast.map((c) => (c.name ?? '').toUpperCase()))]);
  const isNight = (t: string) => /NIGHT|RAAT/i.test(t);
  const isDawn = (t: string) => /DAWN|DUSK|SUBAH|SHAAM|MORNING|EVENING/i.test(t);
  const scenes = all
    .filter((s) => !q.character || castOf(s).has(q.character.toUpperCase()))
    .filter((s) => !q.location || s.location.toUpperCase() === q.location.toUpperCase())
    .filter((s) => !q.time || (q.time === 'night' ? isNight(s.time) : q.time === 'dawn_dusk' ? isDawn(s.time) : !isNight(s.time) && !isDawn(s.time)))
    .map((s) => ({ ...s, frames: q.key ? s.frames.filter((f) => f.keyFrame) : s.frames }))
    .filter((s) => s.frames.length);
  const frames = all.flatMap((s) => s.frames);
  res.json({
    scenes,
    filters: {
      characters: [...new Set(all.flatMap((s) => [...castOf(s)]))].filter(Boolean).sort(),
      locations: [...new Set(all.map((s) => s.location).filter(Boolean))].sort(),
    },
    totals: { scenes: all.length, frames: frames.length, rendered: frames.filter((f) => f.render?.status === 'ready').length, keyFrames: frames.filter((f) => f.keyFrame).length, scriptScenes: story.stats?.scenes ?? null },
  });
}));

directionRouter.get('/frames/:id', h(async (req, res) => {
  const frame = await StoryboardFrame.findById(oid(req.params.id)).lean();
  if (!frame) throw notFound('Frame');
  const runs = await AiRun.find({ type: 'frame.render', 'input.frameId': String(frame._id) }).sort({ createdAt: -1 }).limit(1).select('status error createdAt').lean();
  res.json({ ...frame, renderRun: runs[0] ?? null });
}));

/** The AI Director: one realistic picture of a storyboard frame in the chosen look. */
directionRouter.post('/frames/:id/render', h(async (req, res) => {
  const look = z.object({
    preset: z.enum(STYLE_PRESETS).optional(), lens: z.string().max(60).optional(), camera: z.string().max(60).optional(),
    light: z.string().max(80).optional(), aspect: z.enum(FRAME_ASPECTS).default('16:9'),
  }).parse(req.body ?? {});
  const frame = await StoryboardFrame.findById(oid(req.params.id));
  if (!frame) throw notFound('Frame');
  if (['queued', 'drawing'].includes(frame.render?.status ?? '')) throw new HttpError(409, 'This frame is already being rendered');
  const episode = await ScriptEpisode.findById(frame.scriptEpisodeId).select('storyId').lean();
  const story = episode ? await Story.findById(episode.storyId).select('productionId').lean() : null;
  setAi({ feature: 'direction', action: 'render', storyId: episode ? String(episode.storyId) : undefined, productionId: story?.productionId ? String(story.productionId) : undefined });
  await ensureCredits('direction.render');
  frame.set({ 'render.status': 'queued', 'render.error': null });
  await frame.save();
  res.status(202).json(await startRun('frame.render', { frameId: String(frame._id), ...look }, {
    storyId: episode ? String(episode.storyId) : undefined, productionId: story?.productionId ? String(story.productionId) : undefined,
    title: `Render sc ${frame.sceneNumber} frame ${frame.order}`,
  }));
}));

directionRouter.patch('/frames/:id/key', h(async (req, res) => {
  const { keyFrame } = z.object({ keyFrame: z.boolean() }).parse(req.body);
  const frame = await StoryboardFrame.findByIdAndUpdate(oid(req.params.id), { keyFrame }, { new: true }).lean();
  if (!frame) throw notFound('Frame');
  res.json(frame);
}));

// ---- Shot list ----
/** Rough minutes to light and shoot a setup, by shot size: wide setups take longest. */
const SETUP_MINUTES: Record<string, number> = { EWS: 60, WS: 45, MWS: 35, MS: 30, TWO: 30, OTS: 25, MCU: 20, CU: 20, ECU: 15, POV: 20, INSERT: 10, '': 30 };

async function shotList(storyId: unknown) {
  const scenes = await filmFrames(storyId);
  return scenes.map((s) => {
    // Shots with the same size and lens in one scene usually share a lighting setup.
    const setups = new Map<string, number>();
    const shots = s.frames.filter((f) => f.status !== 'failed').map((f, i) => {
      const size = shotSizeOf(f.shot);
      const setupKey = `${size}|${f.lens ?? ''}`;
      if (!setups.has(setupKey)) setups.set(setupKey, setups.size + 1);
      return {
        frameId: String(f._id), shot: `${s.sceneNumber}${String.fromCharCode(65 + (i % 26))}`, label: f.shot ?? '', size, lens: f.lens ?? '', camera: f.camera ?? '',
        cast: f.cast.map((c) => c.name).filter(Boolean) as string[], light: f.light ?? '', props: f.props ?? '', action: f.action ?? '', dialogue: f.dialogue ?? '',
        setup: setups.get(setupKey)!, imageUrl: f.render?.url || f.imageUrl || null, keyFrame: f.keyFrame,
      };
    });
    const minutes = [...setups.keys()].reduce((n, k) => n + (SETUP_MINUTES[k.split('|')[0]] ?? 30), 0) + shots.length * 5;
    return { episodeNumber: s.episodeNumber, sceneNumber: s.sceneNumber, heading: s.heading, setups: setups.size, minutes, shots };
  });
}

directionRouter.get('/stories/:storyId/shot-list', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const scenes = await shotList(story._id);
  res.json({ scenes, totals: { shots: scenes.reduce((n, s) => n + s.shots.length, 0), setups: scenes.reduce((n, s) => n + s.setups, 0), minutes: scenes.reduce((n, s) => n + s.minutes, 0) } });
}));

directionRouter.get('/stories/:storyId/shot-list.xlsx', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const scenes = await shotList(story._id);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'Scene OS';
  const ws = wb.addWorksheet('Shot list');
  ws.columns = [
    { header: 'Ep', width: 5 }, { header: 'Shot', width: 7 }, { header: 'Scene heading', width: 34 }, { header: 'Setup', width: 7 }, { header: 'Size', width: 8 },
    { header: 'Shot label', width: 26 }, { header: 'Lens', width: 12 }, { header: 'Camera', width: 16 }, { header: 'Cast', width: 22 }, { header: 'Action', width: 44 },
    { header: 'Light', width: 18 }, { header: 'Props', width: 20 }, { header: 'Key frame', width: 9 },
  ];
  ws.getRow(1).font = { bold: true };
  ws.views = [{ state: 'frozen', ySplit: 1 }];
  for (const s of scenes) for (const sh of s.shots) ws.addRow([s.episodeNumber, sh.shot, s.heading, sh.setup, sh.size, sh.label, sh.lens, sh.camera, sh.cast.join(', '), sh.action, sh.light, sh.props, sh.keyFrame ? 'Yes' : '']);
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename="shot-list-${story.title.replace(/[^\w-]+/g, '_')}.xlsx"`);
  await wb.xlsx.write(res);
  res.end();
}));

// ---- Look book ----
directionRouter.get('/stories/:storyId/lookbook', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const [book, run] = await Promise.all([
    LookBook.findOne({ storyId: story._id }).lean(),
    AiRun.findOne({ storyId: String(story._id), type: 'direction.lookbook' }).sort({ createdAt: -1 }).select('status').lean(),
  ]);
  const frames = book?.keyFrameIds?.length ? await StoryboardFrame.find({ _id: { $in: book.keyFrameIds } }).select('sceneNumber order shot action imageUrl render.url').lean() : [];
  res.json({ book, run, keyFrames: book ? book.keyFrameIds.map((id) => frames.find((f) => String(f._id) === String(id))).filter(Boolean) : [] });
}));

directionRouter.post('/stories/:storyId/lookbook', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  setAi({ feature: 'direction', action: 'lookbook', storyId: String(story._id), productionId: story.productionId ? String(story.productionId) : undefined });
  await ensureCredits('direction.lookbook');
  res.status(202).json(await startRun('direction.lookbook', { storyId: String(story._id) }, { storyId: String(story._id), productionId: story.productionId ? String(story.productionId) : undefined }));
}));

directionRouter.patch('/stories/:storyId/lookbook', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const input = z.object({
    vision: z.string().max(4000),
    palette: z.array(z.object({ hex: z.string().regex(/^#[0-9a-f]{6}$/i), name: z.string().max(60), use: z.string().max(200) })).max(10),
    sections: z.array(z.object({ key: z.string().max(40), title: z.string().max(120), body: z.string().max(3000), imageUrls: z.array(z.string().url()).max(6).default([]) })).max(10),
  }).partial().parse(req.body);
  const book = await LookBook.findOneAndUpdate({ storyId: story._id }, { $set: input }, { new: true }).lean();
  if (!book) throw notFound('Look book');
  res.json(book);
}));

// ---- Pitch deck ----
directionRouter.get('/stories/:storyId/pitch', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const decks = await PitchDeck.find({ storyId: story._id }).sort({ createdAt: -1 }).limit(10).lean();
  const runs = await AiRun.find({ _id: { $in: decks.map((d) => d.runId).filter(Boolean) } }).select('status').lean();
  res.json(decks.map((d) => ({ ...d, runStatus: runs.find((r) => String(r._id) === d.runId)?.status ?? null })));
}));

directionRouter.post('/stories/:storyId/pitch', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  const { audience } = z.object({ audience: z.enum(PITCH_AUDIENCES) }).parse(req.body);
  setAi({ feature: 'direction', action: 'pitch', storyId: String(story._id), productionId: story.productionId ? String(story.productionId) : undefined });
  await ensureCredits('direction.pitch');
  const deck = await PitchDeck.create({ storyId: story._id, productionId: story.productionId, audience, title: story.title, createdBy: me(req).name });
  const run = await startRun('direction.pitch', { storyId: String(story._id), audience, deckId: String(deck._id) }, {
    storyId: String(story._id), productionId: story.productionId ? String(story.productionId) : undefined, title: `Pitch deck: ${story.title}`,
  });
  deck.set({ runId: String(run._id) });
  await deck.save();
  res.status(202).json({ deck, run });
}));

const slideEditSchema = z.object({
  title: z.string().max(120), subtitle: z.string().max(200), body: z.string().max(1500),
  bullets: z.array(z.string().max(200)).max(8), imageUrl: z.string().url().or(z.literal('')), notes: z.string().max(1500),
}).partial();

directionRouter.patch('/pitch/:id/slides/:index', h(async (req, res) => {
  const deck = await PitchDeck.findById(oid(req.params.id));
  if (!deck) throw notFound('Pitch deck');
  const i = Number(req.params.index);
  const slide = deck.slides[i];
  if (!slide) throw notFound('Slide');
  const input = slideEditSchema.parse(req.body);
  slide.set({ ...input, ...(input.imageUrl === '' ? { imageUrl: null } : {}) });
  await deck.save();
  res.json(deck);
}));

directionRouter.get('/pitch/:id', h(async (req, res) => {
  const deck = await PitchDeck.findById(oid(req.params.id)).lean();
  if (!deck) throw notFound('Pitch deck');
  res.json(deck);
}));

directionRouter.delete('/pitch/:id', h(async (req, res) => {
  await PitchDeck.deleteOne({ _id: oid(req.params.id) });
  res.status(204).end();
}));

/** The deck as a PowerPoint file. Pictures are fetched and embedded; a missing one leaves the slide as text. */
directionRouter.get('/pitch/:id/deck.pptx', h(async (req, res) => {
  const deck = await PitchDeck.findById(oid(req.params.id)).lean();
  if (!deck) throw notFound('Pitch deck');
  if (!deck.slides.length) throw new HttpError(409, 'This deck is still being written');
  const images = await Promise.all(deck.slides.map((s) => fetchImage(s.imageUrl)));
  const slides: DeckSlide[] = deck.slides.map((s, i) => ({
    title: s.title ?? '', subtitle: s.subtitle ?? undefined, body: s.body ?? undefined, bullets: s.bullets ?? [],
    image: images[i], notes: s.notes ?? undefined, cover: s.kind === 'title',
  }));
  const file = buildPptx(slides, { title: `${deck.title ?? 'Pitch'} pitch deck`, author: me(req).name });
  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.presentationml.presentation');
  res.setHeader('Content-Disposition', `attachment; filename="pitch-${(deck.title ?? 'deck').replace(/[^\w-]+/g, '_')}-${deck.audience}.pptx"`);
  res.send(file);
}));

/** Characters with a locked face, for the AI Director's cast strip. */
directionRouter.get('/stories/:storyId/faces', h(async (req, res) => {
  const story = await storyOrThrow(req.params.storyId);
  res.json(await Character.find({ storyId: story._id }).select('name role lookImageUrl soulId locked').lean());
}));
