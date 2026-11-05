import { describe, expect, it } from 'vitest';
import { execute, type RunApi, type RunState } from './engine';

const fresh = (): RunState => ({ steps: [], answers: {} });
const save = async () => {};

describe('durable runs', () => {
  it('runs each step once and reuses finished steps on a retry', async () => {
    const state = fresh();
    let calls = 0;
    let fail = true;
    const body = async (r: RunApi<object>) => {
      await r.step('read', async () => { calls++; return 41; });
      await r.step('build', async () => { if (fail) throw new Error('provider down'); return 'ok'; });
    };
    expect(await execute({}, state, save, body)).toEqual({ status: 'failed', error: 'provider down' });
    expect(state.steps.map((s) => s.status)).toEqual(['done', 'failed']);
    fail = false;
    expect(await execute({}, state, save, body)).toEqual({ status: 'done' });
    expect(calls).toBe(1);
  });

  it('waits for a person and goes on with the answer', async () => {
    const state = fresh();
    const seen: string[] = [];
    const body = async (r: RunApi<object>) => {
      await r.step('group', async () => 'groups');
      seen.push(await r.ask('merge', 'Can the souk and the cafe be one street?'));
    };
    expect((await execute({}, state, save, body)).status).toBe('waiting');
    expect(state.waiting?.key).toBe('merge');
    state.answers.merge = 'yes';
    expect(await execute({}, state, save, body)).toEqual({ status: 'done' });
    expect(seen).toEqual(['yes']);
    expect(state.steps.find((s) => s.key === 'merge')?.status).toBe('done');
  });
});
