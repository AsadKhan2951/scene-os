'use client';

import clsx from 'clsx';
import { Check, Circle, Loader2, RotateCcw, Sparkles, X } from 'lucide-react';
import { useState } from 'react';
import { api, errorText, useApi } from '@/lib/api';
import type { AiRun } from '@/lib/types';
import { Btn, Chip, Input, Note, Small } from './ui';

const LIVE = ['queued', 'running'];
const STATUS_WORD: Record<string, string> = { done: 'Done', running: 'Working', waiting: 'Needs you', failed: 'Failed', pending: 'Next' };

/**
 * The live "What Scene AI is building" checklist of a durable run: each step with Done / Working /
 * Next, the question it is waiting on (answered here), and Try again when a step failed.
 */
export function RunChecklist({ runId, onDone }: { runId: string; onDone?: (run: AiRun) => void }) {
  const [finished, setFinished] = useState(false);
  const { data: run, error, mutate } = useApi<AiRun>(`/runs/${runId}`, {
    refreshInterval: (r) => (r && LIVE.includes(r.status) ? 2500 : 0),
    onSuccess: (r) => { if (r.status === 'done' && !finished) { setFinished(true); onDone?.(r); } },
  });
  const [answer, setAnswer] = useState('');
  const [problem, setProblem] = useState('');
  const act = async (fn: () => Promise<unknown>) => { setProblem(''); try { await fn(); await mutate(); } catch (e) { setProblem(errorText(e)); } };

  if (error) return <Note>{error.message}</Note>;
  if (!run) return <Small>Loading…</Small>;
  return (
    <div className="flex flex-col gap-1">
      <ul>
        {run.steps.map((s) => (
          <li key={s.key} className="rule flex items-start gap-3 py-3">
            <span className={clsx('mt-0.5 inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full',
              s.status === 'done' ? 'bg-ok/15 text-ok' : s.status === 'failed' ? 'bg-red-400/15 text-risk' : s.status === 'running' || s.status === 'waiting' ? 'bg-violet/20 text-violet' : 'bg-white/[0.07] text-t3')}>
              {s.status === 'done' ? <Check size={15} aria-hidden /> : s.status === 'failed' ? <X size={15} aria-hidden /> : s.status === 'running' ? <Loader2 size={15} className="animate-spin" aria-hidden /> : s.status === 'waiting' ? <Sparkles size={15} aria-hidden /> : <Circle size={10} aria-hidden />}
            </span>
            <div className="min-w-0 flex-1"><div className="text-[15px] font-medium">{s.label}</div>{(s.note || s.error) && <Small className={s.error ? 'text-risk' : undefined}>{s.error ?? s.note}</Small>}</div>
            <span className="whitespace-nowrap text-[13px] text-t3">{STATUS_WORD[s.status]}</span>
          </li>
        ))}
      </ul>
      {run.status === 'waiting' && run.waiting && (
        <div className="sub mt-2 flex flex-col gap-3 rounded-[18px] p-4">
          <div className="flex items-start gap-2"><Chip tone="ai">Scene AI asks</Chip></div>
          <div className="text-[15px]">{run.waiting.question}</div>
          {run.waiting.options?.length
            ? <div className="flex flex-wrap gap-2">{run.waiting.options.map((o) => <Btn key={o} onClick={() => act(() => api.post(`/runs/${run._id}/answer`, { key: run.waiting!.key, answer: o }))}>{o}</Btn>)}</div>
            : <form onSubmit={(e) => { e.preventDefault(); void act(() => api.post(`/runs/${run._id}/answer`, { key: run.waiting!.key, answer })); }} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-[1_1_240px]"><Input label="Your answer" value={answer} onChange={(e) => setAnswer(e.target.value)} required /></div>
                <Btn variant="primary" type="submit">Answer</Btn>
              </form>}
        </div>
      )}
      {run.status === 'failed' && (
        <div className="mt-2 flex flex-wrap items-center gap-3"><Note>{run.error ?? 'This run stopped.'}</Note><Btn icon={RotateCcw} onClick={() => act(() => api.post(`/runs/${run._id}/retry`))}>Try again</Btn></div>
      )}
      {problem && <Note>{problem}</Note>}
    </div>
  );
}
