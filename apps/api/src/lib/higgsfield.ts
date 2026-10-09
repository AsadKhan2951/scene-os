import { randomUUID } from 'node:crypto';
import { env } from '../config/env';
import { putObject } from './spaces';

/**
 * Higgsfield API client (https://docs.higgsfield.ai).
 * Every generation is asynchronous: submit, then poll the returned status_url
 * until it reaches a terminal status.
 */

const TERMINAL = ['completed', 'failed', 'nsfw', 'canceled'];

interface StatusBody {
  status: string;
  status_url?: string;
  images?: { url?: string }[];
  video?: { url?: string };
  error?: unknown;
  detail?: unknown;
}

export const higgsfieldReady = () => Boolean(env.HIGGSFIELD_API_KEY);

/** The output file URL from a completed status response, image or video. */
export function outputUrl(body: StatusBody): string | undefined {
  return body.video?.url ?? body.images?.[0]?.url;
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function call(url: string, init: RequestInit = {}): Promise<StatusBody> {
  const res = await fetch(url, {
    ...init,
    signal: AbortSignal.timeout(30_000),
    headers: { Authorization: `Key ${env.HIGGSFIELD_API_KEY}`, 'Content-Type': 'application/json', ...init.headers },
  });
  const text = await res.text();
  if (!res.ok) {
    const error = new Error(`Higgsfield returned ${res.status}: ${text.slice(0, 200)}`);
    (error as Error & { status?: number }).status = res.status;
    throw error;
  }
  return JSON.parse(text) as StatusBody;
}

async function run(model: string, body: Record<string, unknown>, timeoutMs: number): Promise<string> {
  if (!env.HIGGSFIELD_API_KEY) throw new Error('Higgsfield is not set up. Add HIGGSFIELD_API_KEY on the server');
  const base = env.HIGGSFIELD_API_URL.replace(/\/$/, '');
  let state = await call(`${base}/${model.replace(/^\//, '')}`, { method: 'POST', headers: { 'Idempotency-Key': randomUUID() }, body: JSON.stringify(body) });
  const statusUrl = state.status_url;
  const deadline = Date.now() + timeoutMs;
  let delay = 2000;
  let networkFailures = 0;

  while (!TERMINAL.includes(state.status)) {
    if (!statusUrl) throw new Error('Higgsfield gave no status link');
    if (Date.now() > deadline) throw new Error('Higgsfield took too long. Try again');
    await sleep(delay + Math.random() * 500);
    delay = Math.min(delay * 1.5, 10_000);
    try {
      state = await call(statusUrl);
      networkFailures = 0;
    } catch (err) {
      // 4xx means the request itself is wrong; anything else is retried a few times.
      const status = (err as { status?: number }).status;
      if ((status && status < 500) || ++networkFailures > 5) throw err;
    }
  }

  if (state.status === 'nsfw') throw new Error('Higgsfield blocked this as unsafe content. Change the description and try again');
  if (state.status !== 'completed') throw new Error(`Higgsfield ${state.status}${state.error ? `: ${JSON.stringify(state.error).slice(0, 200)}` : ''}`);
  const url = outputUrl(state);
  if (!url) throw new Error('Higgsfield finished but returned no file');
  return url;
}

function extraParams(raw: string | undefined): Record<string, unknown> {
  if (!raw) return {};
  try { return JSON.parse(raw) as Record<string, unknown>; } catch { return {}; }
}

/**
 * One image from a text description, in 16:9. Pass a trained character to draw that exact person.
 * If the model rejects the aspect_ratio setting, the request is sent again without it rather than failing.
 */
export async function generateImage(prompt: string, characterId?: string, strength = 1): Promise<string> {
  const extra = { ...extraParams(env.HIGGSFIELD_IMAGE_PARAMS), ...(characterId ? { custom_reference_id: characterId, custom_reference_strength: strength } : {}) };
  try {
    return await run(env.HIGGSFIELD_IMAGE_MODEL, { prompt, aspect_ratio: '16:9', ...extra }, 4 * 60_000);
  } catch (err) {
    const status = (err as { status?: number }).status;
    if (status !== 400 && status !== 422) throw err;
    return run(env.HIGGSFIELD_IMAGE_MODEL, { prompt, ...extra }, 4 * 60_000);
  }
}

/** A new picture drawn from one to three reference photos (https://docs.higgsfield.ai/docs/models/qwen-image-3/edit). */
export function generateImageFrom(prompt: string, imageUrls: string[]): Promise<string> {
  return run(env.HIGGSFIELD_EDIT_MODEL, { prompt, image_urls: imageUrls.slice(0, 3), aspect_ratio: '16:9', prompt_extend: false, enable_thinking: false }, 5 * 60_000);
}

/**
 * Trains a Soul ID character from photos of one person (https://docs.higgsfield.ai/docs/models/soul-id/create-character).
 * The returned id makes the image model draw that same face every time. Training takes a few minutes.
 */
export async function trainCharacter(name: string, imageUrls: string[]): Promise<string> {
  if (!env.HIGGSFIELD_API_KEY) throw new Error('Higgsfield is not set up. Add HIGGSFIELD_API_KEY on the server');
  const base = `${env.HIGGSFIELD_API_URL.replace(/\/$/, '')}/v1/custom-references`;
  const created = await call(base, { method: 'POST', body: JSON.stringify({ name: name.slice(0, 100), model_version: 'v2', input_images: imageUrls.map((image_url) => ({ type: 'image_url', image_url })) }) }) as StatusBody & { id?: string; fail_reason?: string };
  if (!created.id) throw new Error('Higgsfield did not return a character id');
  const deadline = Date.now() + 25 * 60_000;
  let state = created;
  let failures = 0;
  while (state.status !== 'completed') {
    if (state.status === 'failed') throw new Error(`Character training failed${state.fail_reason ? `: ${String(state.fail_reason).slice(0, 150)}` : ''}`);
    if (Date.now() > deadline) throw new Error('Character training took too long');
    await sleep(10_000);
    try { state = await call(`${base}/${created.id}`) as typeof created; failures = 0; } catch (err) {
      const status = (err as { status?: number }).status;
      if ((status && status < 500) || ++failures > 5) throw err;
    }
  }
  return created.id;
}

/** A short motion clip that starts from a frame image. */
export function generateClip(prompt: string, imageUrl: string, seconds: number = env.HIGGSFIELD_VIDEO_SECONDS): Promise<string> {
  return run(env.HIGGSFIELD_VIDEO_MODEL, { prompt, image_url: imageUrl, duration: seconds, resolution: '720p', ...extraParams(env.HIGGSFIELD_VIDEO_PARAMS) }, 12 * 60_000);
}

/**
 * Higgsfield only keeps output files for a limited time, so copy the file into
 * DigitalOcean Spaces when Spaces is configured. Falls back to the Higgsfield link.
 */
export async function keep(url: string, key: string): Promise<{ url: string; permanent: boolean }> {
  if (!env.SPACES_BUCKET || !env.SPACES_KEY || !env.SPACES_SECRET) return { url, permanent: false };
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(120_000) });
    if (!res.ok) throw new Error(`download failed with ${res.status}`);
    const stored = await putObject(key, Buffer.from(await res.arrayBuffer()), res.headers.get('content-type') ?? 'application/octet-stream');
    return { url: stored, permanent: true };
  } catch (err) {
    console.error('Could not copy the file to Spaces, keeping the Higgsfield link:', err);
    return { url, permanent: false };
  }
}
