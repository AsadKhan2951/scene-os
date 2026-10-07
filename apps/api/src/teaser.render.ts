import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TEASER_END_CARD_SECONDS, teaserTiming } from '@sceneos/shared';
import { env } from './config/env';
import { audioReady, compose, speak } from './lib/elevenlabs';
import { addAudio, blankCard, concat, endCard, normaliseClip, stillClip } from './lib/ffmpeg';
import { generateClip, generateImage } from './lib/higgsfield';
import { Story, Teaser } from './models';

const LOOK = 'Photorealistic cinematic still from a Pakistani Urdu television drama serial. Real-looking Pakistani people with natural skin texture and minimal make-up, everyday Pakistani clothing, an authentic lived-in Pakistani location, soft natural light, shallow depth of field, 35mm lens, restrained and realistic. Not Bollywood, not glamorous, no heavy jewellery. No text, captions, logos or watermarks.';
const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong').slice(0, 300);

type TeaserDoc = InstanceType<typeof Teaser>;

async function download(url: string, file: string) {
  const res = await fetch(url, { signal: AbortSignal.timeout(180_000) });
  if (!res.ok) throw new Error(`Download failed with ${res.status}`);
  await writeFile(file, Buffer.from(await res.arrayBuffer()));
}

/** Runs tasks a few at a time, in order. */
async function pool<T>(items: T[], size: number, task: (item: T, index: number) => Promise<void>) {
  let next = 0;
  await Promise.all(Array.from({ length: Math.min(size, items.length) }, async () => {
    while (next < items.length) { const i = next++; await task(items[i], i); }
  }));
}

/** Saves one field path at a time so parallel shots never overwrite each other. */
const setShot = (id: unknown, i: number, fields: Record<string, unknown>) =>
  Teaser.updateOne({ _id: id }, { $set: Object.fromEntries(Object.entries(fields).map(([k, v]) => [`shots.${i}.${k}`, v])) });
const setStep = (id: unknown, step: string) => Teaser.updateOne({ _id: id }, { $set: { step } });

function picturePrompt(teaser: TeaserDoc, visual: string): string {
  // Only the people named in this shot are described, word for word the same each time.
  const cast = teaser.characters.filter((c) => c.name && visual.toLowerCase().includes(c.name.toLowerCase()));
  const people = cast.length ? ` People in the picture: ${cast.map((c) => `${c.name} is ${c.look}`).join(' ')}` : '';
  return `${LOOK} ${visual}${people}`;
}

export async function renderTeaser(teaserId: string) {
  const teaser = await Teaser.findById(teaserId);
  if (!teaser) return;
  const story = await Story.findById(teaser.storyId).lean();
  const id = teaser._id;
  const timing = teaserTiming(teaser.durationSeconds);
  const work = await mkdtemp(path.join(os.tmpdir(), 'teaser-'));
  const notes: string[] = [];
  await Teaser.updateOne({ _id: id }, { $set: { status: 'rendering', step: 'Drawing the shots', error: null } });

  try {
    // 1. A picture, then a motion clip, for every shot that does not have one yet.
    const shots = teaser.shots.map((s) => ({ visual: s.visual ?? '', motion: s.motion ?? '', imageUrl: s.imageUrl ?? undefined, clipUrl: s.clipUrl ?? undefined }));
    await pool(shots, 3, async (shot, i) => {
      try {
        if (!shot.imageUrl) {
          await setShot(id, i, { status: 'image', error: null });
          shot.imageUrl = await generateImage(picturePrompt(teaser, shot.visual));
          await setShot(id, i, { imageUrl: shot.imageUrl });
        }
        if (!shot.clipUrl) {
          await setShot(id, i, { status: 'clip' });
          shot.clipUrl = await generateClip(`${shot.motion || 'Subtle natural movement.'} Slow, steady, cinematic camera. Realistic, restrained, natural motion.`, shot.imageUrl, timing.clipSeconds);
          await setShot(id, i, { clipUrl: shot.clipUrl });
        }
        await setShot(id, i, { status: 'done' });
      } catch (err) {
        await setShot(id, i, { status: 'failed', error: message(err) });
      }
    });
    if (!shots.some((s) => s.imageUrl)) throw new Error('No shot could be drawn. Check the Higgsfield key and credits, then try again');

    // 2. Bring every shot to the same size and length. A shot with a picture but no clip becomes a slow push-in.
    await setStep(id, 'Cutting the shots together');
    const clips: string[] = [];
    for (const [i, shot] of shots.entries()) {
      const out = path.join(work, `shot-${i}.mp4`);
      try {
        if (shot.clipUrl) {
          const raw = path.join(work, `raw-${i}.mp4`);
          await download(shot.clipUrl, raw);
          await normaliseClip(raw, out, timing.shotSeconds);
        } else if (shot.imageUrl) {
          const img = path.join(work, `img-${i}.png`);
          await download(shot.imageUrl, img);
          await stillClip(img, out, timing.shotSeconds);
          notes.push(`Shot ${i + 1} is a still picture because its motion clip failed.`);
        } else {
          notes.push(`Shot ${i + 1} is missing because it could not be drawn.`);
          continue;
        }
        clips.push(out);
      } catch (err) {
        notes.push(`Shot ${i + 1} was left out: ${message(err)}`);
      }
    }
    if (!clips.length) throw new Error('None of the shots could be cut together');

    const card = path.join(work, 'card.mp4');
    try {
      await endCard(card, TEASER_END_CARD_SECONDS, story?.title ?? 'Coming soon', teaser.endLine ?? undefined, work, env.TEASER_FONT);
    } catch (err) {
      console.error('Title card could not be drawn, using a blank card:', message(err));
      await blankCard(card, TEASER_END_CARD_SECONDS);
      notes.push('The closing title could not be drawn.');
    }
    const picture = path.join(work, 'picture.mp4');
    await concat([...clips, card], picture, work);
    const seconds = Math.round((clips.length * timing.shotSeconds + TEASER_END_CARD_SECONDS) * 100) / 100;

    // 3. Sound. Each part is optional: a failure is noted and the teaser is still delivered.
    await setStep(id, 'Adding voice-over and music');
    const audio: { voiceOver?: string; music?: string } = {};
    const wantsVoice = teaser.voiceOver && teaser.voiceOverScript.trim();
    const wantsMusic = teaser.music !== 'no_music' && teaser.musicPrompt.trim();
    if ((wantsVoice || wantsMusic) && !audioReady()) {
      notes.push('No sound was added because the sound service is not set up on the server.');
    } else {
      if (wantsVoice) {
        try {
          audio.voiceOver = path.join(work, 'vo.mp3');
          await writeFile(audio.voiceOver, await speak(teaser.voiceOverScript, teaser.voice === 'male' ? 'male' : 'female'));
        } catch (err) { audio.voiceOver = undefined; notes.push(`The voice-over could not be made: ${message(err)}`); }
      }
      if (wantsMusic) {
        try {
          audio.music = path.join(work, 'music.mp3');
          await writeFile(audio.music, await compose(`${teaser.musicPrompt} Instrumental only, no vocals with words. For a Pakistani Urdu drama serial teaser; not Bollywood.`, seconds));
        } catch (err) { audio.music = undefined; notes.push(`The music could not be made: ${message(err)}`); }
      }
    }

    // 4. Final file, written next to its destination and then moved so a half-written file is never served.
    await setStep(id, 'Finishing the video');
    const dir = path.join(env.MEDIA_DIR, 'teasers');
    await mkdir(dir, { recursive: true });
    const temp = path.join(dir, `${id}.tmp.mp4`);
    await addAudio(picture, temp, seconds, audio);
    await rename(temp, path.join(dir, `${id}.mp4`));

    await Teaser.updateOne({ _id: id }, { $set: { status: 'ready', step: null, result: { hasVoiceOver: Boolean(audio.voiceOver), hasMusic: Boolean(audio.music), notes, renderedAt: new Date() } } });
  } catch (err) {
    console.error(`Teaser ${teaserId} failed:`, err);
    await Teaser.updateOne({ _id: id }, { $set: { status: 'failed', step: null, error: message(err) } });
  } finally {
    await rm(work, { recursive: true, force: true });
  }
}
