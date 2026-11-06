import { Character, Story } from '../models';
import { generateJson } from './anthropic';
import { artDirectorFor } from './artDirector';
import { extractJsonObject } from '@sceneos/shared';
import { generateImage, generateImageFrom, keep, trainCharacter } from './higgsfield';
import { styleForStory } from './style';

type CharacterDoc = NonNullable<Awaited<ReturnType<typeof Character.findById>>>;

/** What the person wears in their first costume look, without the colour codes. */
const firstLook = (c: Pick<CharacterDoc, 'looks'>) => (c.looks?.[0]?.items ?? []).map((i) => i.name).filter(Boolean).join(', ');

/** What the person looks like, from the characterisation and their first costume look. */
export function describeFace(c: Pick<CharacterDoc, 'name' | 'ageRange' | 'physical' | 'description' | 'looks' | 'look'>): string {
  const clothes = firstLook(c);
  return [c.look || c.physical || c.description, c.ageRange && !c.look ? `Age ${c.ageRange}.` : '', clothes ? `Wearing ${clothes}.` : ''].filter(Boolean).join(' ').slice(0, 1200);
}

type Brief = { appearance: string; props: string };

/**
 * A concrete casting description. Scripts rarely describe a face, and an image model left to guess
 * drifts towards a generic Western model, so a short brief fixes origin, face, hair and build first.
 */
async function castingBrief(c: CharacterDoc, short: string): Promise<Brief> {
  const story = await Story.findById(c.storyId).select('title logline genre').lean();
  const prompt = `Story: ${story?.title ?? ''}. ${story?.logline ?? ''}
Character: ${c.name}${c.role ? ` (${c.role})` : ''}. Age: ${c.ageRange ?? 'not given'}.
About them: ${c.description ?? ''}
Physical notes from the script: ${c.physical ?? 'none'}
First costume: ${firstLook(c) || 'not given'}

Write the casting description a casting director would hand a photographer, so an image model draws the right real person. Fix what the script leaves open, true to where the story is set (region, community, work and class): which people they belong to and their skin tone, face shape, eyes and brows, nose, facial hair or none, hair, build and height, and how their age and work show on them. An ordinary real person, not a model or actor. Then the costume exactly as given, without colour codes. Never add anything the costume and notes do not have (no cameras, no jewellery or accessories unless given).
Reply with JSON only: {"appearance": "one paragraph, 70 to 110 words, starting with age, sex and origin, e.g. 'A 35-year-old Baloch man from the Makran coast...'", "props": "objects they carry, or empty"}`;
  return generateJson(`${short}\nYou are casting this drama.`, prompt, (raw) => {
    const j = extractJsonObject(raw) as Partial<Brief>;
    if (!j.appearance || j.appearance.length < 40) throw new Error('no appearance');
    return { appearance: j.appearance.trim(), props: (j.props ?? '').trim() };
  }, undefined, 4000, 'fast');
}

/**
 * Casts one character as a fixed face: a casting photo, the same face from two more angles, and a
 * Higgsfield Soul ID trained on those photos. Every later picture of the person (storyboard, AI
 * Director render, scene video) is drawn with that Soul ID, which is what keeps the face the same.
 */
export async function castFace(characterId: string, note?: (text: string) => Promise<void>): Promise<{ soulId: string; lookImageUrl: string }> {
  const c = await Character.findById(characterId);
  if (!c) throw new Error('Character not found');
  const { look, short } = artDirectorFor(await styleForStory(c.storyId));

  // A casting photo already chosen is kept, so the person does not change on a second try.
  let front = c.lookImageUrl ?? undefined;
  let who = c.look || describeFace(c);
  if (!front) {
    await note?.('Writing the casting brief');
    const brief = await castingBrief(c, short).catch(() => ({ appearance: describeFace(c), props: '' }));
    who = brief.appearance;
    await note?.('Drawing the casting photo');
    const made = await generateImage(
      `${look} Vertical casting photograph of one person, ${c.name}: ${who}${brief.props ? ` Holding ${brief.props}.` : ''} Seen from the waist up, facing the camera, shoulders square, neutral relaxed expression, soft even daylight on the face, sharp focus on the face, plain wall that fits this world behind. Nobody else in the picture. No camera, lanyard, badge, jewellery or anything not described.`,
      undefined, undefined, '3:4',
    );
    front = (await keep(made, `cast/${c._id}-front.jpg`)).url;
    await Character.updateOne({ _id: c._id }, { $set: { lookImageUrl: front, look: who } });
  }
  await note?.('Photographing the same face from two more angles');
  const angles = await Promise.all([
    'The same person as in the reference photograph, identical face, hair and clothes, now turned to a three-quarter view looking past the camera, seen from the chest up. Same place and light. A new photograph, not a copy.',
    'The same person as in the reference photograph, identical face, hair and clothes, now in a close-up of the face in profile. Same place and light. A new photograph, not a copy.',
  ].map((angle) => generateImageFrom(`${angle} Unretouched documentary photograph, natural skin texture, no beauty retouching.`, [front]).catch(() => undefined)));
  await note?.('Training the face. This takes a few minutes');
  const soulId = await trainCharacter(`${c.name} ${String(c.storyId).slice(-6)}`, [front, ...angles.filter((u): u is string => Boolean(u))]);
  await Character.updateOne({ _id: c._id }, { $set: { soulId, lookImageUrl: front, look: who } });
  return { soulId, lookImageUrl: front };
}

const AWAY = /\b(back|behind|away)\b/i;

/**
 * The trained face to draw a frame with. The model holds one face per picture, so it is the person
 * who faces the camera most; a frame where everyone is seen from behind uses no face on purpose.
 */
export function faceForFrame(cast: { name?: string | null; facing?: string | null }[], characters: { name: string; soulId?: string | null }[]): string | undefined {
  const rank = (facing?: string | null) => (/toward/i.test(facing ?? '') ? 0 : /three-quarter/i.test(facing ?? '') ? 1 : /profile/i.test(facing ?? '') ? 2 : 3);
  const visible = cast.filter((p) => !AWAY.test(p.facing ?? '')).sort((a, b) => rank(a.facing) - rank(b.facing));
  for (const p of visible) {
    const soulId = characters.find((c) => c.name.toUpperCase() === (p.name ?? '').toUpperCase())?.soulId;
    if (soulId) return soulId;
  }
  return undefined;
}
