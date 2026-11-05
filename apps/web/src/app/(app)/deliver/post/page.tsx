'use client';

import clsx from 'clsx';
import { CalendarRange } from 'lucide-react';
import { useState } from 'react';
import { POST_STAGES, POST_STAGE_LABELS, POST_TASK_STATUSES, label, type PostStage } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Btn, Empty, Glass, H2, Input, Note, Pill, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { isoDay } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { PostTaskRow, Production } from '@/lib/types';

export default function PostSchedulePage() {
  return (<><SectionTabs items={TABS.deliver} /><WithProduction>{(p) => <PostPlan key={p._id} production={p} />}</WithProduction></>);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const short = (d?: string) => (d ? new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' }) : '—');
const STATUS_CLASS: Record<string, string> = { done: 'bg-[#2fbf71]/20 text-[#2fbf71]', in_progress: 'bg-violet/20 text-violet', not_started: 'bg-white/[0.06] text-t2', late: 'bg-red-400/15 text-risk' };

function PostPlan({ production: p }: { production: Production }) {
  const key = `/post/${p._id}/post-schedule`;
  const { data, mutate } = useApi<{ episodes: number; tasks: PostTaskRow[] }>(key);
  const [start, setStart] = useState('');
  const [daysOff, setDaysOff] = useState<number[]>([5]);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); await mutate(); } catch (e) { setError(errorText(e)); } };
  if (!data) return null;
  const episodes = [...new Set(data.tasks.map((t) => t.episodeNumber))].sort((a, b) => a - b);
  const late = data.tasks.filter((t) => t.late);
  const lastDue = data.tasks.reduce<string | undefined>((m, t) => (t.due && (!m || t.due > m) ? t.due : m), undefined);
  const task = data.tasks.find((t) => t._id === open);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Post schedule</h1>
          <p className="mt-1.5 text-base text-t2">{data.tasks.length ? `${episodes.length} episodes, last delivery ${short(lastDue)}.${late.length ? ` ${late.length} tasks are late.` : ''}` : 'Assembly to delivery for every episode, planned from the end of the shoot.'}</p>
        </div>
      </div>
      <Glass>
        <form className="flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); void act(() => api.post(key, { start: start || undefined, daysOff })); }}>
          <Input label="Editing starts (blank: day after the last shoot day)" type="date" value={start} onChange={(e) => setStart(e.target.value)} className="w-72" />
          <fieldset><legend className="mb-1.5 text-[13px] text-t3">Days off</legend><div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((d, i) => <Pill key={d} on={daysOff.includes(i)} onClick={() => setDaysOff(daysOff.includes(i) ? daysOff.filter((x) => x !== i) : [...daysOff, i])}>{d}</Pill>)}</div></fieldset>
          <Btn type="submit" variant="primary" icon={CalendarRange}>{data.tasks.length ? 'Plan again' : 'Plan post'}</Btn>
        </form>
        <Small className="mt-2">Planning again keeps tasks already started or done. Picture lock comes before VFX, grade, mix and subtitles, which run side by side.</Small>
      </Glass>
      {error && <Note>{error}</Note>}

      {!data.tasks.length ? <Glass><Empty title="No post schedule yet">Plan it above; every date can be changed after.</Empty></Glass> : (
        <Glass>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[900px] border-collapse text-left text-[13px]">
              <thead><tr className="text-t3"><th scope="col" className="pb-2 pr-3 font-medium">Episode</th>{POST_STAGES.map((s) => <th key={s} scope="col" className="pb-2 pr-2 font-medium">{POST_STAGE_LABELS[s]}</th>)}</tr></thead>
              <tbody>
                {episodes.map((ep) => (
                  <tr key={ep} className="[&>td]:rule [&>td]:py-2">
                    <th scope="row" className="rule py-2 pr-3 text-left text-[14px] font-semibold">Ep {ep}</th>
                    {POST_STAGES.map((s) => {
                      const t = data.tasks.find((x) => x.episodeNumber === ep && x.stage === s);
                      if (!t) return <td key={s} className="pr-2 text-t3">—</td>;
                      const state = t.late ? 'late' : t.status;
                      return (
                        <td key={s} className="pr-2">
                          <button type="button" onClick={() => setOpen(t._id)} className={clsx('w-full rounded-lg px-2 py-1.5 text-left', STATUS_CLASS[state], open === t._id && 'ring-2 ring-violet')} aria-label={`Episode ${ep} ${POST_STAGE_LABELS[s]}, due ${short(t.due)}, ${label(state)}`}>
                            <div className="font-medium">{short(t.due)}</div><div className="text-[11px] opacity-80">{label(state)}{t.owner ? ` · ${t.owner}` : ''}</div>
                          </button>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {task && <TaskEditor key={task._id} task={task} onSave={(body) => act(() => api.patch(`/post/post-tasks/${task._id}`, body))} onClose={() => setOpen(null)} />}
        </Glass>
      )}
    </>
  );
}

function TaskEditor({ task, onSave, onClose }: { task: PostTaskRow; onSave: (b: object) => void; onClose: () => void }) {
  const [f, setF] = useState({ status: task.status, due: task.due ? isoDay(task.due) : '', owner: task.owner ?? '', notes: task.notes ?? '' });
  return (
    <div className="mt-4 border-t border-white/10 pt-4">
      <H2>Episode {task.episodeNumber}: {POST_STAGE_LABELS[task.stage as PostStage]}</H2>
      <form className="mt-3 flex flex-wrap items-end gap-3" onSubmit={(e) => { e.preventDefault(); onSave({ status: f.status, due: f.due || undefined, owner: f.owner, notes: f.notes }); }}>
        <fieldset><legend className="mb-1.5 text-[13px] text-t3">Status</legend><div className="flex flex-wrap gap-1.5">{POST_TASK_STATUSES.filter((s) => s !== 'late').map((s) => <Pill key={s} on={f.status === s} onClick={() => setF({ ...f, status: s })}>{label(s)}</Pill>)}</div></fieldset>
        <Input label="Due" type="date" value={f.due} onChange={(e) => setF({ ...f, due: e.target.value })} className="w-44" />
        <Input label="Who" value={f.owner} maxLength={120} onChange={(e) => setF({ ...f, owner: e.target.value })} className="w-48" />
        <Input label="Notes" value={f.notes} maxLength={1000} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-72" />
        <Btn type="submit" variant="primary">Save</Btn>
        <Btn onClick={onClose}>Close</Btn>
      </form>
    </div>
  );
}
