import { mkdir, mkdtemp, rename, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { TEASER_END_CARD_SECONDS, shotTiming } from '@sceneos/shared';
import { env } from './config/env';
import { audioReady, compose, speak } from './lib/elevenlabs';
import { addAudio, blankCard, concat, endCard, normaliseClip, stillClip } from './lib/ffmpeg';
import { generateClip, generateImage, generateImageFrom, keep } from './lib/higgsfield';
import { Character, ScriptEpisode, Story, Teaser } from './models';

/**
 * Written against the two things that make a generated picture look fake: beauty retouching and "cinematic" grading.
 * It asks for an ordinary frame grab from a broadcast drama camera instead.
 */
const LOOK = 'Unretouched frame grab from a Pakistani Urdu television drama serial, shot on location on a Sony FX6 digital cinema camera with a prime lens. Documentary realism. Ordinary real Pakistani people, not models: visible skin pores, uneven skin tone, tired eyes, flyaway hair, no beauty retouching, minimal make-up. Worn, creased everyday Pakistani clothes. A real lived-in Pakistani location with dust, wear and clutter. Available light only, motivated by the hour, natural slightly flat broadcast colour with true skin tones, fine sensor grain. Not an illustration, not a render, not glamorous, not Bollywood, no HDR glow, no teal-and-orange grade, no airbrushed skin, no perfect symmetry. No readable text, captions, logos or watermarks anywhere.';
const MOTION = 'Real-time speed, natural human movement, no slow motion. The face, hair and clothes stay exactly as in the first frame. Steady professional camera on a tripod or slider, no shake, no zoom, no morphing, nothing new enters the frame.';
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

type Person = { name: string; person: string; look: string; refImageUrl?: string };
type Shot = { visual: string; motion: string; cast: string[]; imageUrl?: string; clipUrl?: string };

/**
 * The characters visible in a shot. The planner's list wins, because it picks the right costume
 * when a person changes clothes mid-scene. Otherwise anyone named in the description, in their first costume.
 */
function castOf(shot: Shot, people: Person[]): Person[] {
  const listed = shot.cast.map((n) => n.toLowerCase());
  const exact = people.filter((p) => p.name && listed.includes(p.name.toLowerCase()));
  if (exact.length) return exact;
  const text = `${shot.visual} ${listed.join(' ')}`.toLowerCase();
  const seen = new Set<string>();
  return people.filter((p) => {
    if (!p.person || !text.includes(p.person.toLowerCase()) || seen.has(p.person)) return false;
    seen.add(p.person);
    return true;
  });
}

const setPerson = (id: unknown, i: number, url: string) => Teaser.updateOne({ _id: id }, { $set: { [`characters.${i}.refImageUrl`]: url } });

/**
 * Casting. Each character gets one photograph, and every shot of that person is then drawn from it,
 * which is what keeps the face and the clothes the same from shot to shot.
 * A character who was cast for an earlier video of this story keeps that face.
 */
async function castPeople(teaser: TeaserDoc, people: Person[], bible: string, notes: string[]) {
  const saved = await Character.find({ storyId: teaser.storyId }).lean();
  // One after another: a second costume of the same person is drawn from the first one's face.
  for (const [i, person] of people.entries()) {
    if (person.refImageUrl) continue;
    const known = saved.find((c) => c.name.toLowerCase() === person.person.toLowerCase());
    const face = people.find((p) => p.person === person.person && p.refImageUrl)?.refImageUrl ?? known?.lookImageUrl ?? undefined;
    try {
      const prompt = `${LOOK} Casting reference photograph of one person: ${person.look} Standing, seen from the knees up, facing the camera, shoulders square, neutral relaxed expression, arms by the sides so the whole costume is visible, face evenly and softly lit, sharp focus on the face. 50mm lens at eye level. Plain setting that fits this world: ${bible || 'a quiet Pakistani lane'}. Nobody else in the picture.`;
      // Same person, new scene or new costume: draw the clothes onto the face that already exists.
      const made = face
        ? await generateImageFrom(`${prompt} This is the same person as in the reference photograph: identical face, identical age, identical hair. Only the clothes follow the description.`, [face]).catch((err) => {
          notes.push(`${person.name} was cast without their earlier photo, so the face may differ: ${message(err)}`);
          return generateImage(prompt);
        })
        : await generateImage(prompt);
      person.refImageUrl = (await keep(made, `cast/${teaser._id}-${i}.png`)).url;
      await setPerson(teaser._id, i, person.refImageUrl);
      if (known && !known.lookImageUrl) await Character.updateOne({ _id: known._id }, { $set: { look: person.look, lookImageUrl: person.refImageUrl } });
    } catch (err) {
      notes.push(`${person.name} could not be cast, so their face may change between shots: ${message(err)}`);
    }
  }
}

/**
 * One shot. With reference photographs it is drawn from them (face, clothes and place held fixed);
 * without any, it is drawn from the description alone.
 */
async function drawShot(shot: Shot, people: Person[], bible: string, placeUrl: string | undefined, notes: string[], index: number): Promise<string> {
  const cast = castOf(shot, people);
  const place = bible ? ` The place and light, the same in every shot of this scene: ${bible}` : '';
  const described = cast.length ? ` People in the picture: ${cast.map((c) => `${c.name} is ${c.look}`).join(' ')}` : ' No people other than those described.';
  const plain = `${LOOK}${place} The shot: ${shot.visual}${described}`;
  const withPhoto = cast.filter((c) => c.refImageUrl);
  const refs = [...withPhoto.map((c) => c.refImageUrl as string), ...(placeUrl ? [placeUrl] : [])];
  if (!refs.length) return generateImage(plain);

  const key = [
    ...withPhoto.map((c, i) => `Reference photograph ${i + 1} is ${c.name}. Draw exactly this person: the identical face, age, skin, hair and the identical clothes, colours and props. Do not change or beautify them.`),
    ...(placeUrl ? [`Reference photograph ${refs.length} is the location of this scene. Keep the same street or room, the same walls, colours, weather and light, but photograph it from the new camera position this shot asks for. Do not copy its framing.`] : []),
  ].join(' ');
  try {
    return await generateImageFrom(`${plain} ${key} Make a new photograph for this shot; do not paste or repeat a reference photograph.`, refs);
  } catch (err) {
    notes.push(`Shot ${index + 1} was drawn without its reference photographs, so it may not match the others: ${message(err)}`);
    return generateImage(plain);
  }
}

export async function renderTeaser(teaserId: string) {
  const teaser = await Teaser.findById(teaserId);
  if (!teaser) return;
  const story = await Story.findById(teaser.storyId).lean();
  const id = teaser._id;
  const timing = shotTiming(teaser.durationSeconds, teaser.shots.length);
  const work = await mkdtemp(path.join(os.tmpdir(), 'teaser-'));
  const notes: string[] = [];
  await Teaser.updateOne({ _id: id }, { $set: { status: 'rendering', step: 'Drawing the shots', error: null } });

  try {
    // 1. Cast the characters, then a picture and a motion clip for every shot that does not have one yet.
    const bible = teaser.sceneBible ?? '';
    const people: Person[] = teaser.characters.map((c) => ({ name: c.name ?? '', person: c.person || c.name || '', look: c.look ?? '', refImageUrl: c.refImageUrl ?? undefined }));
    const shots: Shot[] = teaser.shots.map((s) => ({ visual: s.visual ?? '', motion: s.motion ?? '', cast: s.cast ?? [], imageUrl: s.imageUrl ?? undefined, clipUrl: s.clipUrl ?? undefined }));
    if (shots.some((s) => !s.imageUrl)) {
      await setStep(id, 'Casting the characters');
      await castPeople(teaser, people, bible, notes);
      await setStep(id, 'Drawing the shots');
    }

    // The first empty shot of the place is drawn first and becomes the location reference for the rest.
    const anchor = teaser.scriptEpisodeId ? Math.max(0, shots.findIndex((s) => castOf(s, people).length === 0)) : -1;
    const drawOne = async (shot: Shot, i: number, placeUrl?: string) => {
      try {
        if (!shot.imageUrl) {
          await setShot(id, i, { status: 'image', error: null });
          shot.imageUrl = await drawShot(shot, people, bible, placeUrl, notes, i);
          await setShot(id, i, { imageUrl: shot.imageUrl });
        }
        if (!shot.clipUrl) {
          await setShot(id, i, { status: 'clip' });
          shot.clipUrl = await generateClip(`${shot.motion || 'Subtle natural movement, a breath, a blink.'} ${MOTION}`, shot.imageUrl, timing.clipSeconds);
          await setShot(id, i, { clipUrl: shot.clipUrl });
        }
        await setShot(id, i, { status: 'done' });
      } catch (err) {
        await setShot(id, i, { status: 'failed', error: message(err) });
      }
    };
    let placeUrl: string | undefined;
    if (anchor >= 0) {
      // Only the picture is needed before the others can start; its clip is made alongside theirs.
      const first = shots[anchor];
      if (!first.imageUrl) {
        try {
          await setShot(id, anchor, { status: 'image', error: null });
          first.imageUrl = await drawShot(first, people, bible, undefined, notes, anchor);
          await setShot(id, anchor, { imageUrl: first.imageUrl });
        } catch (err) { await setShot(id, anchor, { status: 'failed', error: message(err) }); }
      }
      placeUrl = first.imageUrl;
    }
    await pool(shots, 3, (shot, i) => drawOne(shot, i, i === anchor ? undefined : placeUrl));
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
      const episode = teaser.scriptEpisodeId ? await ScriptEpisode.findById(teaser.scriptEpisodeId).select('number').lean() : null;
      const sceneLine = episode && teaser.sceneNumber ? `Episode ${episode.number}, scene ${teaser.sceneNumber}` : undefined;
      await endCard(card, TEASER_END_CARD_SECONDS, story?.title ?? 'Coming soon', teaser.endLine || sceneLine, work, env.TEASER_FONT);
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
