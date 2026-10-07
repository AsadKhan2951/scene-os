import { Worker, type Job } from 'bullmq';
import { z } from 'zod';
import { extractJsonArray, sceneText } from '@sceneos/shared';
import { connectDb } from './db';
import { generateText } from './lib/anthropic';
import { generateClip, generateImage, higgsfieldReady, keep } from './lib/higgsfield';
import { STORYBOARD_QUEUE, redisConnection, type StoryboardJob } from './lib/queue';
import { ScriptEpisode, StoryboardFrame } from './models';

const STYLE = 'Hand-drawn pencil storyboard sketch, black and white, loose cinematic linework, wide 16:9 film frame.';
const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong').slice(0, 300);

const framesSchema = z.array(z.object({
  shot: z.string(),
  action: z.string(),
  dialogue: z.string().nullish().transform((v) => v ?? ''),
  prompt: z.string(),
})).min(1).max(6);

type FrameDoc = InstanceType<typeof StoryboardFrame>;

/** Draws the image for one frame and saves the result on it. Never throws. */
async function drawFrame(frame: FrameDoc) {
  frame.set({ status: 'drawing', error: null });
  await frame.save();
  try {
    const note = frame.redrawNote ? ` Change requested: ${frame.redrawNote}.` : '';
    const made = await generateImage(`${STYLE} ${frame.prompt}${note}`);
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

  const raw = await generateText(
    'You break a screenplay scene into storyboard frames for a Pakistani drama. Reply with a JSON array only, no prose and no code fence.',
    `Break this scene into 3 to 6 sequential frames. Each item: "shot" (e.g. wide, medium, close-up, over the shoulder, insert), "action" (one sentence, same language as the scene), "dialogue" (the key line, or an empty string), "prompt" (English visual description of the frame: who, where, pose, framing, light; no text or captions in the picture).\n\n${scene}`,
    2000,
  );
  const frames = framesSchema.parse(extractJsonArray(raw));

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
  const worker = new Worker<StoryboardJob>(STORYBOARD_QUEUE, handle, { connection: redisConnection(), concurrency: 3 });
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
