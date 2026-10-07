import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

export const STORYBOARD_QUEUE = 'storyboard';
/** scene: break a scene into frames and draw them. frame: redraw one image. clip: make a motion clip from one frame. */
export type StoryboardJob =
  | { kind: 'scene'; scriptEpisodeId: string; sceneNumber: number }
  | { kind: 'frame'; frameId: string }
  | { kind: 'clip'; frameId: string }
  | { kind: 'teaser'; teaserId: string };
export const JOB_OPTIONS = { attempts: 2, backoff: { type: 'exponential' as const, delay: 5000 }, removeOnComplete: 100, removeOnFail: 200 };

/** BullMQ needs maxRetriesPerRequest: null on its connection. */
export const redisConnection = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

let queue: Queue<StoryboardJob> | null = null;
export function storyboardQueue() {
  queue ??= new Queue<StoryboardJob>(STORYBOARD_QUEUE, { connection: redisConnection() });
  return queue;
}
