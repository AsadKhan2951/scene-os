import { Character } from '../models';
import { artDirectorFor } from './artDirector';
import { generateImage, generateImageFrom, keep, trainCharacter } from './higgsfield';
import { styleForStory } from './style';

type CharacterDoc = NonNullable<Awaited<ReturnType<typeof Character.findById>>>;

/** What the person looks like, from the characterisation and their first costume look. */
export function describeFace(c: Pick<CharacterDoc, 'name' | 'ageRange' | 'physical' | 'description' | 'looks' | 'look'>): string {
  const first = c.looks?.[0];
  const clothes = first?.items?.length ? ` Wearing ${first.items.map((i) => [i.color, i.name].filter(Boolean).join(' ')).join(', ')}.` : '';
  return [c.look, c.physical, !c.physical && c.ageRange ? `Age ${c.ageRange}.` : '', !c.physical && !c.look ? c.description : ''].filter(Boolean).join(' ').slice(0, 900) + clothes;
}

/**
 * Casts one character as a fixed face: a casting photo, the same face from two more angles, and a
 * Higgsfield Soul ID trained on those photos. Every later picture of the person (storyboard, AI
 * Director render, scene video) is drawn with that Soul ID, which is what keeps the face the same.
 */
export async function castFace(characterId: string, note?: (text: string) => Promise<void>): Promise<{ soulId: string; lookImageUrl: string }> {
  const c = await Character.findById(characterId);
  if (!c) throw new Error('Character not found');
  const { look } = artDirectorFor(await styleForStory(c.storyId));
  const who = describeFace(c);
  const subject = `one person, ${c.name}: ${who} Plain setting that fits this world. Nobody else in the picture. Face evenly and softly lit, sharp focus on the face.`;

  // A casting photo already chosen is kept, so the person does not change on a second try.
  let front = c.lookImageUrl ?? undefined;
  if (!front) {
    await note?.('Drawing the casting photo');
    const made = await generateImage(`${look} Casting reference photograph of ${subject} Standing, seen from the waist up, facing the camera, shoulders square, neutral relaxed expression. 50mm lens at eye level.`);
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
  await Character.updateOne({ _id: c._id }, { $set: { soulId, lookImageUrl: front, look: c.look || who } });
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
