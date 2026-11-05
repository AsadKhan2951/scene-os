import { z } from 'zod';
import { BREAKDOWN_CATEGORIES, STYLE_PRESET_LABELS, extractJsonArray, extractJsonObject, sceneText } from '@sceneos/shared';
import { Location, Scene, ScriptEpisode, Story } from '../models';
import { defineWorkflow } from '../lib/runs';
import { claudeMessage, replyText } from '../lib/ai/gateway';
import { askAboutScript } from '../lib/scripts/ai';
import { styleForStory, briefForStory } from '../lib/style';
import { generateImage, keep } from '../lib/higgsfield';

/**
 * Production runs: the scene-by-scene breakdown, grouping the script's locations into real
 * places (asking a person before merging), and a location's art board.
 */

const nul = <T extends z.ZodTypeAny>(t: T) => t.nullish().transform((v) => v ?? undefined);
const BATCH = 6;

// ---- Breakdown ----
export interface BreakdownInput { storyId: string }

const elementsSchema = z.array(z.object({
  scene: z.number().int(),
  synopsis: z.string(),
  elements: z.array(z.object({ category: z.enum(BREAKDOWN_CATEGORIES).catch('props'), name: z.string(), qty: nul(z.number().int().positive()) })),
}));

/** Breaks a few scenes down in one fast call. */
export async function breakDown(scenes: { number: number; text: string }[], world: string) {
  const res = await claudeMessage({
    max_tokens: 8000,
    system: `You are a first assistant director doing a script breakdown. List only what the scene text shows or clearly needs. ${world} Reply with JSON only, no prose and no code fence.`,
    messages: [{ role: 'user', content: `Break down these scenes. For each reply with { "scene": number, "synopsis": one line, "elements": [{ "category": one of ${BREAKDOWN_CATEGORIES.join(', ')}, "name": short name (cast: the character's name as written; extras: who they are, e.g. "Dock hands"), "qty": number when more than one }] }. Wardrobe only for a costume the scene calls out. Reply with a JSON array.

${scenes.map((s) => `--- Scene ${s.number}\n${s.text.slice(0, 6000)}`).join('\n\n')}` }],
  }, 'fast');
  return elementsSchema.parse(extractJsonArray(replyText(res)));
}

export const breakdownWorkflow = defineWorkflow<BreakdownInput>({
  type: 'script.breakdown',
  title: 'Scene by scene breakdown',
  feature: 'production',
  quote: 'production.breakdown',
  steps: [{ key: 'breakdown', label: 'Scene by scene breakdown' }],
  async run(r) {
    await r.step('breakdown', async () => {
      const episodes = await ScriptEpisode.find({ storyId: r.input.storyId, content: { $ne: '' } }).lean();
      const style = await styleForStory(r.input.storyId);
      const world = `The story is set in ${style.country ?? 'the script\'s country'} (${STYLE_PRESET_LABELS[style.preset]}).`;
      // Scenes already broken down are skipped, so a retry only does what is left.
      const todo = await Scene.find({ storyId: r.input.storyId, brokenDownAt: null }).sort({ number: 1 }).lean();
      let done = 0;
      for (let i = 0; i < todo.length; i += BATCH) {
        const batch = todo.slice(i, i + BATCH).map((s) => {
          const ep = episodes.find((e) => String(e._id) === String(s.scriptEpisodeId)) ?? episodes[0];
          return { id: s._id, number: s.number, text: ep ? sceneText(ep.content, s.number) : s.heading ?? '' };
        });
        const rows = await breakDown(batch, world);
        for (const row of rows) {
          const scene = batch.find((b) => b.number === row.scene);
          if (scene) await Scene.updateOne({ _id: scene.id }, { $set: { synopsis: row.synopsis, elements: row.elements, brokenDownAt: new Date() } });
        }
        done += batch.length;
        await r.note('breakdown', `${done} of ${todo.length} scenes`);
      }
      return done;
    });
  },
});

// ---- Locations: script places grouped into real ones ----
export interface LocationsInput { storyId: string; productionId: string }

export const locationsWorkflow = defineWorkflow<LocationsInput>({
  type: 'script.locations',
  title: 'Locations needed',
  feature: 'locations',
  quote: 'production.locations',
  steps: [
    { key: 'group', label: 'Group script locations into real places' },
    { key: 'confirm', label: 'Your call on merges' },
    { key: 'save', label: 'Locations ready to scout' },
  ],
  async run(r) {
    const { storyId, productionId } = r.input;
    const plan = await r.step('group', async () => {
      const scenes = await Scene.find({ storyId }).sort({ number: 1 }).lean();
      const places = new Map<string, number[]>();
      for (const s of scenes) places.set(s.location ?? 'UNKNOWN', [...(places.get(s.location ?? 'UNKNOWN') ?? []), s.number]);
      const style = await styleForStory(storyId);
      const text = (await ScriptEpisode.find({ storyId }).sort({ number: 1 }).lean()).map((e) => e.content).join('\n\n').slice(0, 300_000);
      return askAboutScript({
        system: `You are a location manager planning where to shoot. The story is set in ${style.country ?? 'the script\'s country'}. Fewer real places means fewer company moves and a cheaper shoot, but never merge places the story needs to look different.`,
        script: text, shape: 'object', tier: 'standard', maxTokens: 12000,
        schema: z.object({
          groups: z.array(z.object({ name: z.string(), description: z.string(), scriptNames: z.array(z.string()) })),
          questions: z.array(z.object({ question: z.string(), groups: z.array(z.string()).min(2) })).max(3).catch([]),
        }),
        task: `These are the script's locations with the scenes they appear in:
${[...places].map(([p, n]) => `${p}: scenes ${n.join(', ')}`).join('\n')}

Group them into real shoot locations: places that can be the same set or the same street. Reply with { "groups": [{ "name": the real place in plain words, "description": what it must look like, "scriptNames": the script locations in it, exactly as listed }], "questions": up to 3 merges you are unsure about, each { "question": a yes/no question for the director such as "Can the souk and the cafe be one street?", "groups": the names of the groups it would merge } }. Every script location must be in exactly one group.`,
      });
    });

    // Ask the director about each uncertain merge; merge the groups on a yes.
    let groups = plan.groups;
    for (const [i, q] of plan.questions.entries()) {
      const answer = await r.ask<string>(`merge-${i}`, q.question, ['Yes', 'No']);
      if (answer !== 'Yes') continue;
      const parts = groups.filter((g) => q.groups.some((n) => n.toUpperCase() === g.name.toUpperCase()));
      if (parts.length < 2) continue;
      const merged = { name: parts[0].name, description: parts.map((p) => p.description).join(' '), scriptNames: parts.flatMap((p) => p.scriptNames) };
      groups = [...groups.filter((g) => !parts.includes(g)), merged];
    }
    await r.step('confirm', async () => groups.length);

    await r.step('save', async () => {
      const scenes = await Scene.find({ storyId }).select('_id number location').lean();
      // Locations already locked keep their place; the rest are replaced by the new grouping.
      await Location.deleteMany({ productionId, storyId, status: 'candidate', placeId: null });
      for (const g of groups) {
        const names = new Set(g.scriptNames.map((n) => n.toUpperCase()));
        // Matched by scene id: in a serial every episode numbers its scenes from 1.
        const here = scenes.filter((s) => names.has((s.location ?? '').toUpperCase()));
        const sceneNumbers = [...new Set<number>(here.map((s) => s.number))].sort((a, b) => a - b);
        const loc = await Location.create({ productionId, storyId, name: g.name, description: g.description, scriptNames: [...names], sceneNumbers, status: 'candidate' });
        await Scene.updateMany({ _id: { $in: here.map((s) => s._id) } }, { $set: { locationId: loc._id } });
      }
      return groups.length;
    });
  },
});

// ---- A location's art board ----
export interface BoardInput { locationId: string }

export const boardWorkflow = defineWorkflow<BoardInput>({
  type: 'location.board',
  title: 'Location art board',
  feature: 'locations',
  quote: 'production.board',
  steps: [{ key: 'plan', label: 'Palette and moments' }, { key: 'draw', label: 'Draw the board' }],
  async run(r) {
    const loc = await Location.findById(r.input.locationId);
    if (!loc) throw new Error('Location not found');
    const brief = loc.storyId ? await briefForStory(loc.storyId) : null;
    const plan = await r.step('plan', async () => {
      const res = await claudeMessage({
        max_tokens: 4000,
        system: 'You are a production designer. Reply with JSON only, no prose and no code fence.',
        messages: [{ role: 'user', content: `Plan an art board for the location "${loc.name}": ${loc.description ?? ''}. Scenes here: ${loc.sceneNumbers.join(', ') || 'unknown'}. Script names: ${loc.scriptNames.join('; ')}.
Reply with { "palette": 4 hex colours, "moments": 4 to 6 items { "label": 2-4 words such as "Lantern at dusk", "prompt": one photograph of this place at that moment: framing, light, textures, no people in focus, no text } }.` }],
      }, 'standard');
      return z.object({ palette: z.array(z.string()).max(6), moments: z.array(z.object({ label: z.string(), prompt: z.string() })).min(1).max(6) }).parse(extractJsonObject(replyText(res)));
    });
    await r.step('draw', async () => {
      const board: { label: string; imageUrl: string }[] = [];
      try {
        for (const [i, m] of plan.moments.entries()) {
          const url = await generateImage(`${brief?.look ?? ''} Location scouting photograph, no people. ${m.prompt}`);
          board.push({ label: m.label, imageUrl: (await keep(url, `locations/${loc._id}/${i}.jpg`)).url });
          await r.note('draw', `${board.length} of ${plan.moments.length} drawn`);
        }
      } catch (err) {
        // Pictures already paid for are kept: a board with some moments beats losing them all.
        if (!board.length) throw err;
        loc.set({ palette: plan.palette, board });
        await loc.save();
        throw new Error(`${board.length} of ${plan.moments.length} pictures were drawn and kept. ${err instanceof Error ? err.message : String(err)}`);
      }
      loc.set({ palette: plan.palette, board });
      await loc.save();
      return board.length;
    });
  },
});

export const storyFor = async (productionId: string) => Story.findOne({ productionId }).sort({ updatedAt: -1 }).lean();
