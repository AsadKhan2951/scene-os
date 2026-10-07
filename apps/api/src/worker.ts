import { Worker, type Job } from 'bullmq';
import { z } from 'zod';
import { extractJsonArray, sceneText } from '@sceneos/shared';
import { connectDb } from './db';
import { generateJson } from './lib/anthropic';
import { generateClip, generateImage, higgsfieldReady, keep } from './lib/higgsfield';
import { STORYBOARD_QUEUE, redisConnection, type StoryboardJob } from './lib/queue';
import { ART_DIRECTOR, ART_DIRECTOR_SHORT } from './lib/artDirector';
import { Character, ScriptEpisode, StoryboardFrame, Teaser } from './models';
import { renderTeaser } from './teaser.render';

const STYLE = 'Hand-drawn pencil storyboard sketch, black and white, loose cinematic linework, wide 16:9 film frame.';
const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong').slice(0, 300);

const framesSchema = z.array(z.object({
  shot: z.string(),
  action: z.string(),
  dialogue: z.string().nullish().transform((v) => v ?? ''),
  prompt: z.string(),
  cast: z.array(z.object({ name: z.string(), wardrobe: z.string().nullish().transform((v) => v ?? ''), facing: z.string().nullish().transform((v) => v ?? '') })).nullish().transform((v) => v ?? []),
  location: z.string().nullish().transform((v) => v ?? ''),
  light: z.string().nullish().transform((v) => v ?? ''),
  lens: z.string().nullish().transform((v) => v ?? ''),
  camera: z.string().nullish().transform((v) => v ?? ''),
  props: z.string().nullish().transform((v) => v ?? ''),
})).min(1).max(6);

type FrameDoc = InstanceType<typeof StoryboardFrame>;

/** Draws the image for one frame and saves the result on it. Never throws. */
async function drawFrame(frame: FrameDoc) {
  frame.set({ status: 'drawing', error: null });
  await frame.save();
  try {
    const note = frame.redrawNote ? ` Change requested: ${frame.redrawNote}.` : '';
    // The sketch is drawn from the same continuity sheet the video will use, so the two agree.
    const sheet = [
      ...frame.cast.map((c) => `${c.name} wears ${c.wardrobe || 'everyday clothes'}, ${c.facing || 'facing the camera'}.`),
      frame.location ? `Place: ${frame.location}.` : '', frame.light ? `Light: ${frame.light}.` : '', frame.lens ? `Lens: ${frame.lens}.` : '', frame.props ? `Props: ${frame.props}.` : '',
    ].filter(Boolean).join(' ');
    const made = await generateImage(`${STYLE} ${frame.prompt} ${sheet}${note} No lettering or captions in the drawing.`);
    const kept = await keep(made, `storyboards/${frame.scriptEpisodeId}/${frame._id}.jpg`);
    frame.set({ imageUrl: kept.url, filesPermanent: kept.permanent, status: 'needs_review', videoUrl: null, videoStatus: 'none' });
  } catch (err) {
    frame.set({ status: 'failed', error: message(err) });
  }
  await frame.save();
}

async function drawScene(scriptEpisodeId: string, sceneNumber: number) {
  const episode = await ScriptEpisode.findById(scriptEpisodeId).lean();
  if (!episode) throw new Error('Episode not found');
  const scene = sceneText(episode.content, sceneNumber);
  if (!scene) throw new Error(`Scene ${sceneNumber} was not found in the script`);

  const [characters, earlier] = await Promise.all([
    Character.find({ storyId: episode.storyId }).lean(),
    // What people wore in the scene before, so a costume only changes when the story changes it.
    StoryboardFrame.find({ scriptEpisodeId, sceneNumber: sceneNumber - 1 }).sort({ order: -1 }).limit(1).lean(),
  ]);
  const frames = await generateJson(
    ART_DIRECTOR,
    `Break this scene into 3 to 6 sequential storyboard frames. Each frame is also a continuity sheet: the realistic video of the scene is built from it later, so anything left vague here will come out wrong there. Reply with a JSON array.

Each item:
- "shot": the shot size (wide, mid shot, close-up, over the shoulder, insert).
- "action": one sentence, in the same language as the scene, of what happens in this frame.
- "dialogue": the key line spoken, or an empty string.
- "cast": the named characters visible in this frame, each as { "name", "wardrobe", "facing" }. "wardrobe" is their exact clothes in English with garment, fabric and colour (for example "ash-grey cotton chadar over a faded olive lawn shalwar kameez, brown rubber chappal") and what they carry. A person wears the same thing in every frame of the scene, written in the same words, unless the script makes them change; if they change, say so plainly from the frame where it happens (for example "now in a navy-blue chadar over the same olive kameez"). "facing" is one of: toward camera, three-quarter left, three-quarter right, profile left, profile right, from behind.
- "location": exactly where the camera is and what it sees of the place, consistent across the frames.
- "light": the hour, where the light comes from and its colour, the same across the frames.
- "lens": the lens for this shot size, for example "24mm, deep focus".
- "camera": camera height and the one slow move, for example "eye level, slow push-in".
- "props": the props in frame and who holds them in which hand, or an empty string.
- "prompt": an English description of the frame as one picture: who, where in frame, the pose at this instant, the framing. No text or captions in the picture.

Characters the writer defined:
${characters.map((c) => `- ${c.name}${c.ageRange ? `, ${c.ageRange}` : ''}: ${c.description ?? ''}`).join('\n') || '(none listed)'}
${earlier[0]?.cast?.length ? `\nIn the previous scene they wore: ${earlier[0].cast.map((c) => `${c.name}: ${c.wardrobe}`).join('; ')}. Keep it only if this scene follows straight on in the same place and time.\n` : ''}
The scene:
${scene}`,
    '[',
    (raw) => framesSchema.parse(extractJsonArray(raw)),
    ART_DIRECTOR_SHORT,
  );

  // Approved frames are kept; anything else for this scene is redrawn.
  await StoryboardFrame.deleteMany({ scriptEpisodeId, sceneNumber, status: { $ne: 'approved' } });
  const ready = higgsfieldReady();
  const docs = await StoryboardFrame.insertMany(frames.map((f, i) => ({
    ...f, scriptEpisodeId, sceneNumber, order: i + 1, status: ready ? 'queued' : 'needs_image',
  })));
  if (!ready) return;
  for (const doc of docs) { const frame = await StoryboardFrame.findById(doc._id); if (frame) await drawFrame(frame); }
}

async function makeClip(frameId: string) {
  const frame = await StoryboardFrame.findById(frameId);
  if (!frame?.imageUrl) return;
  frame.set({ videoStatus: 'drawing', videoError: null });
  await frame.save();
  try {
    const motion = `${frame.action ?? ''} Subtle, natural motion and a slow cinematic camera move. Keep the sketch style of the image.`.trim();
    const made = await generateClip(motion, frame.imageUrl);
    const kept = await keep(made, `storyboards/${frame.scriptEpisodeId}/${frame._id}.mp4`);
    frame.set({ videoUrl: kept.url, videoStatus: 'ready', filesPermanent: frame.filesPermanent && kept.permanent });
  } catch (err) {
    frame.set({ videoStatus: 'failed', videoError: message(err) });
  }
  await frame.save();
}

async function handle(job: Job<StoryboardJob>) {
  const data = job.data;
  if (data.kind === 'teaser') return renderTeaser(data.teaserId);
  if (data.kind === 'clip') return makeClip(data.frameId);
  if (data.kind === 'frame') {
    const frame = await StoryboardFrame.findById(data.frameId);
    if (frame) await drawFrame(frame);
    return;
  }
  return drawScene(data.scriptEpisodeId, data.sceneNumber);
}

async function main() {
  await connectDb();
  // A teaser that was mid-render when the worker last stopped can never finish; say so instead of spinning forever.
  await Teaser.updateMany({ status: { $in: ['queued', 'rendering'] } }, { $set: { status: 'failed', step: null, error: 'The server restarted while this teaser was being made. Start it again; finished shots are reused.' } });
  const worker = new Worker<StoryboardJob>(STORYBOARD_QUEUE, handle, { connection: redisConnection(), concurrency: 3, lockDuration: 120_000 });
  // When every retry of a scene has failed, leave a visible "failed" frame so the person is not left waiting.
  worker.on('failed', async (job, err) => {
    console.error(`Storyboard job ${job?.id} (${job?.data.kind}) failed:`, err.message);
    if (!job || job.data.kind !== 'scene' || job.attemptsMade < (job.opts.attempts ?? 1)) return;
    const { scriptEpisodeId, sceneNumber } = job.data;
    await StoryboardFrame.deleteMany({ scriptEpisodeId, sceneNumber, status: 'failed' });
    await StoryboardFrame.create({ scriptEpisodeId, sceneNumber, order: 99, status: 'failed', action: 'This scene could not be drawn. Try again.', error: message(err) }).catch(() => {});
  });
  console.log(`Scene OS worker ready. Higgsfield ${higgsfieldReady() ? 'connected' : 'not set up'}.`);
  const stop = async () => { await worker.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

main().catch((err) => {
  console.error('Worker failed to start', err);
  process.exit(1);
});
