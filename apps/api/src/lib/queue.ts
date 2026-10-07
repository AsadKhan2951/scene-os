import { Queue } from 'bullmq';
import IORedis from 'ioredis';
import { env } from '../config/env';

export const STORYBOARD_QUEUE = 'storyboard';
export interface StoryboardJob { scriptEpisodeId: string; sceneNumber: number }

/** BullMQ needs maxRetriesPerRequest: null on its connection. */
export const redisConnection = () => new IORedis(env.REDIS_URL, { maxRetriesPerRequest: null });

let queue: Queue<StoryboardJob> | null = null;
export function storyboardQueue() {
  queue ??= new Queue<StoryboardJob>(STORYBOARD_QUEUE, { connection: redisConnection() });
  return queue;
}
