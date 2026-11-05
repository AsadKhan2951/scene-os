import type { AiFeature, QuotedAction } from '@sceneos/shared';
import { AiRun } from '../../models';
import { HttpError, notFound } from '../http';
import { aiContext, jobContext, withAiContext, type AiJobContext } from '../ai/context';
import { holdCredits, releaseHold } from '../ai/credits';
import { JOB_OPTIONS, storyboardQueue } from '../queue';
import { execute, type RunApi, type RunState } from './engine';

export type { RunApi } from './engine';

/** A workflow: its steps in order (for the checklist before they start) and its body. */
export interface Workflow<I> {
  type: string;
  title: string;
  feature: AiFeature;
  steps: { key: string; label: string }[];
  /** Credits reserved for each attempt. */
  quote?: QuotedAction;
  run: (r: RunApi<I>) => Promise<void>;
}

const registry = new Map<string, Workflow<never>>();
export function defineWorkflow<I>(wf: Workflow<I>) {
  registry.set(wf.type, wf as unknown as Workflow<never>);
  return wf;
}

async function enqueue(runId: string, holdAction?: string, multiplier = 1, ctx: AiJobContext = jobContext()) {
  const holdId = holdAction ? await holdCredits(holdAction as QuotedAction, multiplier) : undefined;
  try {
    await storyboardQueue().add('run', { kind: 'run', runId, ctx: { ...ctx, runId: holdId } }, { ...JOB_OPTIONS, attempts: 1 });
  } catch (err) {
    if (holdId) await releaseHold(holdId);
    throw err;
  }
}

/** Starts a run for the signed-in person. Returns it at once; the worker does the work. */
export async function startRun<I extends object>(type: string, input: I, opts: { productionId?: string; storyId?: string; title?: string; multiplier?: number } = {}) {
  const wf = registry.get(type);
  if (!wf) throw new HttpError(400, `Unknown workflow ${type}`);
  const ctx = aiContext();
  const run = await AiRun.create({
    orgId: ctx.orgId, type, title: opts.title ?? wf.title, input,
    productionId: opts.productionId, storyId: opts.storyId,
    steps: wf.steps.map((s) => ({ ...s, status: 'pending' })),
    holdAction: wf.quote, holdMultiplier: opts.multiplier ?? 1,
    createdBy: ctx.userId, createdByName: ctx.userName,
  });
  try {
    await enqueue(String(run._id), wf.quote, opts.multiplier ?? 1, jobContext({ feature: wf.feature, action: type, productionId: opts.productionId, storyId: opts.storyId }));
  } catch (err) {
    // Not enough credits or no queue: the run never starts, so it must not sit in the list as "queued".
    await AiRun.updateOne({ _id: run._id }, { $set: { status: 'failed', error: err instanceof Error ? err.message : 'Could not start' } });
    throw err;
  }
  return run;
}

/** Gives the answer a waiting run asked for, and queues it to go on. */
export async function answerRun(runId: string, key: string, answer: unknown) {
  const run = await AiRun.findById(runId);
  if (!run) throw notFound('Run');
  if (run.status !== 'waiting' || (run.waiting as { key?: string } | null)?.key !== key) throw new HttpError(409, 'This run is not waiting for that answer');
  run.set({ [`answers.${key}`]: answer, waiting: null, status: 'queued' });
  run.markModified('answers');
  await run.save();
  await enqueue(runId, run.holdAction ?? undefined, run.holdMultiplier ?? 1, jobContext({ action: run.type, productionId: run.productionId ?? undefined, storyId: run.storyId ?? undefined }))
    // The answer is kept; the run shows as failed so "Try again" carries on from it.
    .catch(async (err) => { await AiRun.updateOne({ _id: runId }, { $set: { status: 'failed', error: err instanceof Error ? err.message : 'Could not start' } }); throw err; });
  return run;
}

/** Tries a failed run again. Finished steps are reused. */
export async function retryRun(runId: string) {
  const run = await AiRun.findById(runId);
  if (!run) throw notFound('Run');
  if (run.status !== 'failed') throw new HttpError(409, 'Only a failed run can be tried again');
  run.set({ status: 'queued', error: null });
  await run.save();
  await enqueue(runId, run.holdAction ?? undefined, run.holdMultiplier ?? 1, jobContext({ action: run.type, productionId: run.productionId ?? undefined, storyId: run.storyId ?? undefined }))
    // The answer is kept; the run shows as failed so "Try again" carries on from it.
    .catch(async (err) => { await AiRun.updateOne({ _id: runId }, { $set: { status: 'failed', error: err instanceof Error ? err.message : 'Could not start' } }); throw err; });
  return run;
}

/** Worker side: runs (or resumes) one run, saving after every step. */
export async function executeRun(runId: string, ctx: AiJobContext) {
  const run = await AiRun.findById(runId);
  if (!run) return;
  const wf = registry.get(run.type);
  if (!wf) { await AiRun.updateOne({ _id: runId }, { status: 'failed', error: `Unknown workflow ${run.type}` }); return; }
  const state: RunState = { steps: run.steps.map((s) => ({ ...s.toObject() })), answers: { ...(run.answers ?? {}) }, waiting: null };
  const persist = async (s: RunState) => { await AiRun.updateOne({ _id: runId }, { $set: { steps: s.steps, waiting: s.waiting ?? null } }); };
  await AiRun.updateOne({ _id: runId }, { $set: { status: 'running', error: null } });
  const outcome = await withAiContext({ ...ctx, feature: wf.feature, action: run.type, productionId: run.productionId ?? ctx.productionId, storyId: run.storyId ?? ctx.storyId },
    () => execute(run.input as never, state, persist, wf.run));
  if (outcome.status === 'done') await AiRun.updateOne({ _id: runId }, { $set: { status: 'done', finishedAt: new Date(), waiting: null } });
  else if (outcome.status === 'waiting') await AiRun.updateOne({ _id: runId }, { $set: { status: 'waiting', waiting: outcome.question } });
  else await AiRun.updateOne({ _id: runId }, { $set: { status: 'failed', error: outcome.error } });
}

/** A worker restart leaves runs that were mid-step: mark them failed so they can be retried. */
export async function failInterruptedRuns() {
  await AiRun.updateMany({ status: 'running' }, { $set: { status: 'failed', error: 'The server restarted during this run. Try again; finished steps are reused.' } });
}
