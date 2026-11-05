/**
 * The durable step runner. A long AI pipeline (script intake, whole-film storyboard, a promo)
 * is a run made of named steps. Each finished step's output is saved, so when a run is retried
 * or resumed, finished steps are skipped and never paid for twice. A step can stop the run to
 * ask a person something ("Can the souk and the café be one street?"); the run waits, and goes
 * on from that point when the answer comes.
 *
 * This file holds the logic with no database, so it can be tested on its own; runs.ts stores it.
 */

export type StepStatus = 'pending' | 'running' | 'done' | 'failed' | 'waiting';
export interface StepState { key: string; label: string; status: StepStatus; output?: unknown; note?: string; error?: string; startedAt?: Date; endedAt?: Date }
export interface Question { key: string; question: string; options?: string[] }
export interface RunState {
  steps: StepState[];
  answers: Record<string, unknown>;
  waiting?: Question | null;
}

/** Thrown by ask() to stop a run until a person answers. Not an error. */
export class WaitForAnswer extends Error {
  constructor(public q: Question) { super(`Waiting for an answer to "${q.question}"`); }
}

export interface RunApi<I> {
  input: I;
  /** Runs fn once: on a retry or resume a finished step returns its saved output. */
  step<T>(key: string, fn: () => Promise<T>): Promise<T>;
  /** Returns the person's answer, or stops the run until they give one. */
  ask<T = string>(key: string, question: string, options?: string[]): Promise<T>;
  /** Progress note on a step, shown in the live checklist ("3 of 5 drawn"). */
  note(key: string, text: string): Promise<void>;
}

/** Called after every change so the state is saved before work goes on. */
export type Persist = (state: RunState) => Promise<void>;

const msg = (err: unknown) => (err instanceof Error ? err.message : String(err)).slice(0, 500);

export function createRunApi<I>(input: I, state: RunState, persist: Persist): RunApi<I> {
  const stepOf = (key: string) => {
    let s = state.steps.find((x) => x.key === key);
    if (!s) { s = { key, label: key, status: 'pending' }; state.steps.push(s); }
    return s;
  };
  return {
    input,
    async step<T>(key: string, fn: () => Promise<T>): Promise<T> {
      const s = stepOf(key);
      if (s.status === 'done') return s.output as T;
      s.status = 'running'; s.error = undefined; s.startedAt = new Date();
      await persist(state);
      try {
        const out = await fn();
        s.status = 'done'; s.output = out; s.endedAt = new Date();
        await persist(state);
        return out;
      } catch (err) {
        if (err instanceof WaitForAnswer) throw err;
        s.status = 'failed'; s.error = msg(err); s.endedAt = new Date();
        await persist(state);
        throw err;
      }
    },
    async ask<T = string>(key: string, question: string, options?: string[]): Promise<T> {
      if (key in state.answers) {
        const s = state.steps.find((x) => x.key === key);
        if (s && s.status !== 'done') { s.status = 'done'; s.output = state.answers[key]; s.endedAt = new Date(); await persist(state); }
        return state.answers[key] as T;
      }
      const s = stepOf(key);
      s.status = 'waiting';
      state.waiting = { key, question, options };
      await persist(state);
      throw new WaitForAnswer(state.waiting);
    },
    async note(key: string, text: string) {
      stepOf(key).note = text;
      await persist(state);
    },
  };
}

export type RunOutcome = { status: 'done' } | { status: 'waiting'; question: Question } | { status: 'failed'; error: string };

/** Runs a workflow body against a state and says how it ended. */
export async function execute<I>(input: I, state: RunState, persist: Persist, body: (r: RunApi<I>) => Promise<void>): Promise<RunOutcome> {
  state.waiting = null;
  try {
    await body(createRunApi(input, state, persist));
    return { status: 'done' };
  } catch (err) {
    if (err instanceof WaitForAnswer) return { status: 'waiting', question: err.q };
    return { status: 'failed', error: msg(err) };
  }
}
