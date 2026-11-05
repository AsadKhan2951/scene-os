/**
 * AI quality checks. Run with `pnpm --filter @sceneos/api eval`.
 *
 * Without ANTHROPIC_API_KEY it grades the saved examples only (to prove the graders work).
 * With a key it calls the real prompts on fixed cases and grades the answers: Pakistani world
 * with no Indian markers, Urdu with no Hindi, breakdowns that only list what the scene shows,
 * and a rate card the estimate can use. A live run costs a few cents.
 * Exit code is 1 when any live check fails, so it can gate a release.
 */
import { writeFileSync } from 'node:fs';
import { env } from '../config/env';
import { artDirectorFor, DEFAULT_STYLE } from '../lib/artDirector';
import { generateText } from '../lib/anthropic';
import { DEFAULT_ORG, withAiContext } from '../lib/ai/context';
import { breakDown } from '../workflows/production';
import { draftRateCard } from '../workflows/money';
import { GOLDEN, LOOK_PROMPTS, RATE_CARD_PROJECT, SCENES } from './cases';
import { breakdownProblems, hindiInUrdu, indianMarkers, rateCardProblems, type Problems } from './graders';

interface Result { check: string; case: string; problems: Problems; ms: number }
const results: Result[] = [];

async function check(name: string, label: string, fn: () => Promise<Problems>) {
  const started = Date.now();
  let problems: Problems;
  try { problems = await fn(); } catch (err) { problems = [`Error: ${err instanceof Error ? err.message : String(err)}`.slice(0, 300)]; }
  results.push({ check: name, case: label, problems, ms: Date.now() - started });
  console.log(`${problems.length ? 'FAIL' : 'pass'}  ${name.padEnd(14)} ${label.slice(0, 60)}${problems.length ? `\n      ${problems.join('\n      ')}` : ''}`);
}

async function offline() {
  // The graders must catch the bad examples and pass the good ones.
  await check('grader', 'good Urdu passes', async () => hindiInUrdu(GOLDEN.goodUrdu));
  await check('grader', 'bad Urdu is caught', async () => (hindiInUrdu(GOLDEN.badUrdu).length ? [] : ['Hindi words were not caught']));
  await check('grader', 'Pakistani look passes', async () => indianMarkers(GOLDEN.goodLook));
  await check('grader', 'Indian look is caught', async () => (indianMarkers(GOLDEN.badLook).length >= 3 ? [] : ['Indian markers were not caught']));
}

async function live() {
  const brief = artDirectorFor(DEFAULT_STYLE);
  await check('breakdown', `${SCENES.length} scenes`, async () => {
    const rows = await breakDown(SCENES.map((s) => ({ number: s.number, text: s.text })), 'The story is set in Pakistan (Pakistani serial).');
    const problems: Problems = [];
    for (const s of SCENES) {
      const row = rows.find((r) => r.scene === s.number);
      if (!row) { problems.push(`Scene ${s.number} missing`); continue; }
      problems.push(...breakdownProblems(s.text, row).map((p) => `Sc ${s.number}: ${p}`), ...indianMarkers(row.synopsis));
      if (s.number === 2 && !row.elements.some((e) => e.category === 'extras')) problems.push('Sc 2: the dock hands were not listed as extras');
    }
    return problems;
  });
  for (const prompt of LOOK_PROMPTS) {
    await check('art_direction', prompt, async () => {
      const text = await generateText(brief.full, `Write one image prompt (one paragraph, English) for this moment of the serial: ${prompt}`, 1500, 'fast');
      return [...indianMarkers(text), ...hindiInUrdu(text)];
    });
  }
  await check('urdu_dialogue', 'mother and late son', async () => {
    const text = await generateText(brief.full, 'Write four lines of dialogue in Roman Urdu: a mother in Rawalpindi scolds her grown son for coming home late. Only the lines, each starting with the speaker name.', 1500, 'fast');
    return hindiInUrdu(text);
  });
  await check('rate_card', `${RATE_CARD_PROJECT.country}, ${RATE_CARD_PROJECT.currency}`, async () => rateCardProblems(await draftRateCard(RATE_CARD_PROJECT)));
}

async function main() {
  await offline();
  if (!env.ANTHROPIC_API_KEY) {
    console.log('\nNo ANTHROPIC_API_KEY: only the graders were checked. Add the key to run the live evals.');
  } else {
    await withAiContext({ orgId: DEFAULT_ORG, feature: 'other', action: 'eval', userName: 'eval' }, live);
  }
  const failed = results.filter((r) => r.problems.length);
  console.log(`\n${results.length - failed.length} of ${results.length} checks passed.`);
  if (process.env.EVAL_OUT) writeFileSync(process.env.EVAL_OUT, JSON.stringify({ at: new Date().toISOString(), model: env.ANTHROPIC_MODEL, results }, null, 2));
  process.exit(failed.length ? 1 : 0);
}

void main();
