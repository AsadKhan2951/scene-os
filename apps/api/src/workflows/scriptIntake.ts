import { z } from 'zod';
import { CHARACTER_ROLES, STYLE_PRESET_LABELS } from '@sceneos/shared';
import { Character, Scene, ScriptEpisode, ScriptFile, Story } from '../models';
import { defineWorkflow } from '../lib/runs';
import { askAboutScript, transcribePdf } from '../lib/scripts/ai';
import { countCharacters, parseFile, parseFountain, scriptStats, toPlainText, withLengths, type CharacterCount, type ParsedScript, type ScriptFormat } from '../lib/scripts/parse';
import { styleForStory } from '../lib/style';

/**
 * Script intake: the "What Scene AI is building" checklist on the Intake screen.
 * Reads the script, then finds and characterises the cast, draws up costume looks and writes
 * coverage. Each step is saved, so a retry only redoes what failed. Locked characters are
 * never rewritten. Breakdown, locations and the scene plan follow in their own runs.
 */
export interface IntakeInput { storyId: string; fileId: string; format: ScriptFormat; episodeNumber: number }

const SYSTEM = 'You are a senior script editor and casting director working inside Scene OS, a film and television production system. You read the whole screenplay carefully and answer only from what it contains. Never invent plot. Write in clear, plain English; keep character names exactly as the script writes them.';
const MAIN_LIMIT = 6;

const nul = <T extends z.ZodTypeAny>(t: T) => t.nullish().transform((v) => v ?? undefined);

/** Saves the parsed script as the episode's text and its scenes; returns the counts. */
async function saveScript(input: IntakeInput, script: ParsedScript) {
  const story = await Story.findById(input.storyId);
  if (!story) throw new Error('Story not found');
  const content = toPlainText(script);
  let episode = await ScriptEpisode.findOne({ storyId: input.storyId, number: input.episodeNumber });
  if (!episode) episode = new ScriptEpisode({ storyId: input.storyId, number: input.episodeNumber });
  if (episode.content && episode.content !== content) episode.revisions.push({ label: `Before import ${new Date().toISOString().slice(0, 10)}`, content: episode.content, by: 'Script import', at: new Date() });
  episode.set({ content, status: 'written' });
  await episode.save();

  await Scene.deleteMany({ storyId: input.storyId, scriptEpisodeId: episode._id });
  await Scene.insertMany(script.scenes.map((s) => ({
    storyId: input.storyId, scriptEpisodeId: episode!._id, number: s.number, heading: s.heading, intExt: s.intExt,
    location: s.location, time: s.time, eighths: s.eighths,
    characters: [...new Set(s.elements.filter((e) => e.type === 'character').map((e) => e.text.replace(/\(.*?\)/g, '').trim().toUpperCase()))],
  })));

  const characters = countCharacters(script);
  const stats = scriptStats(script, characters);
  story.set({ stats, ...(script.title && !story.title ? { title: script.title } : {}) });
  await story.save();
  return { stats, characters: characters.slice(0, 60) };
}

const scriptText = async (input: IntakeInput) => (await ScriptEpisode.findOne({ storyId: input.storyId, number: input.episodeNumber }).lean())?.content ?? '';
const titleCase = (s: string) => s.toLowerCase().replace(/(^|[\s'-])(\p{L})/gu, (_, a: string, b: string) => a + b.toUpperCase());

export const scriptIntake = defineWorkflow<IntakeInput>({
  type: 'script.intake',
  title: 'Reading the script',
  feature: 'writers',
  quote: 'writers.intake',
  steps: [
    { key: 'read', label: 'Read the script' },
    { key: 'overview', label: 'Logline and genre' },
    { key: 'characters', label: 'Characters found' },
    { key: 'characterisation', label: 'Characterisation' },
    { key: 'looks', label: 'Costume boards' },
    { key: 'coverage', label: 'Script coverage' },
  ],
  async run(r) {
    const input = r.input;

    const read = await r.step('read', async () => {
      const file = await ScriptFile.findById(input.fileId).select('+data');
      if (!file) throw new Error('The uploaded file is gone. Upload it again');
      let script = parseFile(input.format, file.data);
      if (!script) script = withLengths(parseFountain(await transcribePdf(file.data)));
      if (!script.scenes.length) throw new Error('No scenes were found. Scene headings must start with INT. or EXT.');
      const saved = await saveScript(input, script);
      await ScriptFile.deleteOne({ _id: file._id });
      return saved;
    });
    await r.note('read', `${read.stats.scenes} scenes, ${read.stats.characters} characters, about ${read.stats.pages} pages`);

    const text = await scriptText(input);
    const style = await styleForStory(input.storyId);
    const world = `The project's style is "${STYLE_PRESET_LABELS[style.preset]}", set in ${style.country ?? 'the country of the script'}, dialogue in ${style.language ?? 'the script\'s language'}.`;

    await r.step('overview', async () => {
      const o = await askAboutScript({
        system: SYSTEM, script: text, shape: 'object', tier: 'standard', maxTokens: 6000,
        schema: z.object({ logline: z.string(), genre: z.string() }),
        task: 'Give a one-sentence logline (the protagonist, what they want, what stands in the way, the stakes) and the genre in two or three words. Reply with { "logline": "...", "genre": "..." }.',
      });
      await Story.updateOne({ _id: input.storyId }, { $set: { logline: o.logline, genre: o.genre } });
      return o;
    });

    const cast = await r.step('characters', async () => {
      const counts: CharacterCount[] = read.characters;
      const found = await askAboutScript({
        system: SYSTEM, script: text, shape: 'array', tier: 'standard', maxTokens: 12000,
        schema: z.array(z.object({ cue: z.string(), name: z.string(), role: z.enum(CHARACTER_ROLES).catch('minor'), description: nul(z.string()), ageRange: nul(z.string()) })),
        task: `These character cues were counted in the script (cue, scenes, lines):
${counts.map((c) => `${c.name} | ${c.scenes} | ${c.lines}`).join('\n')}

For each cue that is a real character (skip cues like "ALL", "VOICE", "CROWD"), reply with { "cue": the cue exactly as listed, "name": the character's name as it should be shown (normal capitalisation, the script's own script), "role": "lead" | "supporting" | "antagonist" | "minor", "description": one sentence on who they are, "ageRange": e.g. "40s" }. Reply with a JSON array.`,
      });
      const existing = await Character.find({ storyId: input.storyId });
      const kept: string[] = [];
      for (const f of found) {
        const count = counts.find((c) => c.name === f.cue.toUpperCase());
        if (!count) continue;
        const match = existing.find((c) => c.name.toUpperCase() === f.cue.toUpperCase() || c.name.toUpperCase() === f.name.toUpperCase());
        const numbers = { sceneCount: count.scenes, lineCount: count.lines, firstScene: count.firstScene };
        if (match) {
          match.set(match.locked ? numbers : { ...numbers, role: f.role, ...(match.description ? {} : { description: f.description }), ...(match.ageRange ? {} : { ageRange: f.ageRange }) });
          await match.save();
          kept.push(String(match._id));
        } else {
          const doc = await Character.create({ storyId: input.storyId, name: f.name || titleCase(f.cue), role: f.role, description: f.description, ageRange: f.ageRange, source: 'script', ...numbers });
          kept.push(String(doc._id));
        }
      }
      return kept;
    });
    await r.note('characters', `${cast.length} characters`);

    const mains = async () => (await Character.find({ _id: { $in: cast }, locked: { $ne: true } }).sort({ lineCount: -1 }).limit(MAIN_LIMIT).lean())
      .filter((c) => c.role !== 'minor' || (c.lineCount ?? 0) >= 5);

    await r.step('characterisation', async () => {
      const list = await mains();
      if (!list.length) return 0;
      const rows = await askAboutScript({
        system: SYSTEM, script: text, shape: 'array', tier: 'deep', maxTokens: 20000,
        schema: z.array(z.object({ name: z.string(), backstory: z.string(), want: z.string(), need: z.string(), arc: z.string(), voice: z.string(), relationships: z.string(), physical: z.string() })),
        task: `Write the characterisation of these characters, from what the script shows: ${list.map((c) => c.name).join(', ')}.
For each reply with { "name": as listed, "backstory": 2 sentences, "want": what they consciously chase, "need": what they actually need, "arc": who they are at the start and at the end, "voice": how they speak (rhythm, words, languages, what they never say), "relationships": their tie to each other main character in short phrases, "physical": age, build, face, hair, distinguishing marks, how they carry themselves }. ${world} Reply with a JSON array.`,
      });
      for (const row of rows) {
        const c = list.find((x) => x.name.toUpperCase() === row.name.toUpperCase());
        if (c) await Character.updateOne({ _id: c._id, locked: { $ne: true } }, { $set: { backstory: row.backstory, want: row.want, need: row.need, arc: row.arc, voice: row.voice, relationships: row.relationships, physical: row.physical } });
      }
      return rows.length;
    });

    await r.step('looks', async () => {
      const list = await mains();
      if (!list.length) return 0;
      const rows = await askAboutScript({
        system: `${SYSTEM} You are also the costume designer.`, script: text, shape: 'array', tier: 'standard', maxTokens: 16000,
        schema: z.array(z.object({ name: z.string(), looks: z.array(z.object({ name: z.string(), sceneFrom: nul(z.number().int()), sceneTo: nul(z.number().int()), note: nul(z.string()), items: z.array(z.object({ name: z.string(), color: nul(z.string()) })) })) })),
        task: `Plan the costume looks for ${list.map((c) => c.name).join(', ')}. A new look starts only where the script changes the time, the occasion or what happens to their clothes (rain, a fight, a wedding). ${world} Dress them as real people of that world dress, for their age, class and job.
For each character reply with { "name": as listed, "looks": [{ "name": short name such as "Ferry, night", "sceneFrom": first scene number, "sceneTo": last scene number, "note": one line on why, "items": 2 to 5 garments or props, each { "name": garment with fabric, "color": a hex colour like "#3b2f2a" } }] }. Reply with a JSON array.`,
      });
      for (const row of rows) {
        const c = list.find((x) => x.name.toUpperCase() === row.name.toUpperCase());
        if (c) await Character.updateOne({ _id: c._id, locked: { $ne: true } }, { $set: { looks: row.looks } });
      }
      return rows.reduce((n, x) => n + x.looks.length, 0);
    });

    await r.step('coverage', async () => {
      const cov = await askAboutScript({
        system: 'You are a senior development executive writing script coverage for producers. Be honest and specific; praise only what earns it. Every note points to scene numbers.',
        script: text, shape: 'object', tier: 'deep', maxTokens: 12000,
        schema: z.object({
          structure: z.number().min(1).max(10), characters: z.number().min(1).max(10), pacing: z.number().min(1).max(10), dialogue: z.number().min(1).max(10),
          verdict: z.enum(['pass', 'consider', 'recommend']).catch('consider'), summary: z.string(),
          notes: z.array(z.object({ text: z.string(), scenes: z.array(z.number().int()).catch([]) })).max(12),
        }),
        task: 'Write coverage. Reply with { "structure": 1-10, "characters": 1-10, "pacing": 1-10, "dialogue": 1-10, "verdict": "pass" | "consider" | "recommend", "summary": three sentences, "notes": up to 8 specific notes, each { "text": the problem or strength and a fix, "scenes": [scene numbers] } }.',
      });
      await Story.updateOne({ _id: input.storyId }, { $set: { coverage: { ...cov, at: new Date() } } });
      return { verdict: cov.verdict };
    });
  },
});
