import { env } from '../config/env';

/**
 * ElevenLabs: voice-over (text to speech) and background music.
 * Higgsfield's developer API has no voice or music, so the teaser uses a second provider for sound.
 *
 * NOT YET RUN LIVE. The text-to-speech call follows the long-standing public API.
 * The music call (POST /v1/music) and Urdu on the eleven_v3 model should be confirmed
 * with a real key on the first teaser.
 */
const BASE = 'https://api.elevenlabs.io';

export const audioReady = () => Boolean(env.ELEVENLABS_API_KEY);

async function post(pathname: string, body: unknown, timeoutMs: number): Promise<Buffer> {
  if (!env.ELEVENLABS_API_KEY) throw new Error('Sound is not set up. Add ELEVENLABS_API_KEY on the server');
  const res = await fetch(`${BASE}${pathname}`, {
    method: 'POST',
    signal: AbortSignal.timeout(timeoutMs),
    headers: { 'xi-api-key': env.ELEVENLABS_API_KEY, 'Content-Type': 'application/json', Accept: 'audio/mpeg' },
    body: JSON.stringify(body),
  });
  if (res.status === 402) throw new Error('this needs a paid ElevenLabs plan');
  if (res.status === 401) throw new Error('the ElevenLabs key was not accepted');
  if (!res.ok) throw new Error(`ElevenLabs returned ${res.status}: ${(await res.text()).slice(0, 160)}`);
  return Buffer.from(await res.arrayBuffer());
}

export function speak(text: string, voice: 'female' | 'male'): Promise<Buffer> {
  const voiceId = voice === 'male' ? env.ELEVENLABS_VOICE_MALE : env.ELEVENLABS_VOICE_FEMALE;
  return post(`/v1/text-to-speech/${voiceId}?output_format=mp3_44100_128`, { text, model_id: env.ELEVENLABS_TTS_MODEL }, 120_000);
}

export function compose(prompt: string, seconds: number): Promise<Buffer> {
  return post('/v1/music?output_format=mp3_44100_128', { prompt, music_length_ms: Math.round(Math.max(10, seconds) * 1000) }, 300_000);
}
