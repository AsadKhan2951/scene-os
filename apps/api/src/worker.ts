import { Worker } from 'bullmq';
import { z } from 'zod';
import { connectDb } from './db';
import { generateText } from './lib/anthropic';
import { imageProvider } from './lib/images';
import { STORYBOARD_QUEUE, redisConnection, type StoryboardJob } from './lib/queue';
import { ScriptEpisode, StoryboardFrame } from './models';

const HEADING = /^\s*(\d+)\.\s*(?:INT|EXT)[.\s]/gim;

/** Returns the text of one numbered scene, or the whole text when it has no scene headings yet. */
export function sceneText(content: string, sceneNumber: number): string {
  const marks = [...content.matchAll(HEADING)].map((m) => ({ n: Number(m[1]), at: m.index ?? 0 }));
  if (!marks.length) return content.slice(0, 6000);
  const i = marks.findIndex((m) => m.n === sceneNumber);
  if (i === -1) return '';
  return content.slice(marks[i].at, marks[i + 1]?.at ?? content.length).trim();
}

const framesSchema = z.array(z.object({
  shot: z.string(),
  action: z.string(),
  dialogue: z.string().optional().default(''),
  prompt: z.string(),
})).min(1).max(6);

async function drawScene({ scriptEpisodeId, sceneNumber }: StoryboardJob) {
  const episode = await ScriptEpisode.findById(scriptEpisodeId).lean();
  if (!episode) throw new Error('Episode not found');
  const scene = sceneText(episode.content, sceneNumber);
  if (!scene) throw new Error(`Scene ${sceneNumber} was not found in the script`);

  const raw = await generateText(
    'You break a screenplay scene into storyboard frames for a Pakistani drama. Reply with a JSON array only, no prose and no code fence.',
    `Break this scene into 3 to 6 sequential frames. Each item: "shot" (e.g. wide, medium, close-up, over the shoulder, insert), "action" (one sentence, same language as the scene), "dialogue" (the key line, or empty), "prompt" (English description for a hand-drawn pencil storyboard sketch, 16:9).\n\n${scene}`,
    2000,
  );
  const frames = framesSchema.parse(JSON.parse(raw.replace(/^```(?:json)?|```$/g, '').trim()));

  // Approved frames are kept; anything else for this scene is redrawn.
  await StoryboardFrame.deleteMany({ scriptEpisodeId, sceneNumber, status: { $ne: 'approved' } });
  const provider = imageProvider();
  const docs = await StoryboardFrame.insertMany(frames.map((f, i) => ({
    ...f, scriptEpisodeId, sceneNumber, order: i + 1, status: provider ? 'drawing' : 'needs_image',
  })));
  if (!provider) return;

  for (const doc of docs) {
    try {
      doc.imageUrl = await provider.generate(`Hand-drawn pencil storyboard sketch, 16:9. ${doc.prompt}`);
      doc.set('status', 'needs_review');
    } catch (err) {
      doc.set('status', 'failed');
      doc.error = err instanceof Error ? err.message : 'Image generation failed';
    }
    await doc.save();
  }
}

async function main() {
  await connectDb();
  const worker = new Worker<StoryboardJob>(STORYBOARD_QUEUE, (job) => drawScene(job.data), { connection: redisConnection(), concurrency: 2 });
  worker.on('failed', (job, err) => console.error(`Storyboard job ${job?.id} failed:`, err.message));
  console.log('Scene OS worker ready');
  const stop = async () => { await worker.close(); process.exit(0); };
  process.on('SIGTERM', stop);
  process.on('SIGINT', stop);
}

if (process.env.VITEST !== 'true') {
  main().catch((err) => {
    console.error('Worker failed to start', err);
    process.exit(1);
  });
}
