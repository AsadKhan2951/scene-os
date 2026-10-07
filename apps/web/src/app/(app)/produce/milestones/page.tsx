'use client';

import clsx from 'clsx';
import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { MILESTONE_CATEGORIES, MILESTONE_STATUSES, label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Area, Async, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Pill, Select, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day, tone } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Milestone, Production } from '@/lib/types';

export default function MilestonesPage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <Milestones key={p._id} production={p} />}</WithProduction></>);
}
const DOT: Record<string, string> = { completed: 'bg-ok', in_progress: 'bg-warn', delayed: 'bg-risk', pending: 'bg-white/35' };

function Milestones({ production: p }: { production: Production }) {
  const { data, error: loadError, mutate } = useApi<Milestone[]>(`/milestones?productionId=${p._id}`);
  const [openOnly, setOpenOnly] = useState(false);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>) { setError(''); try { await fn(); await mutate(); await refresh('/insights'); } catch (e) { setError(errorText(e)); } }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = Object.fromEntries(new FormData(form));
    await run(async () => { await api.post('/milestones', { ...f, productionId: p._id, assignee: f.assignee || undefined, description: f.description || undefined }); form.reset(); });
  }
  const count = (s: string) => data?.filter((m) => m.status === s).length ?? 0;
  const late = count('delayed');

  return (
    <>
      <PageTitle title="Milestones" sub={data ? (late ? `${late} milestone${late === 1 ? ' is' : 's are'} late.` : 'Nothing is late.') : undefined}><Btn icon={Sparkles} href="/dreamer">Ask Dreamer to add one</Btn></PageTitle>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(190px,1fr))]">{MILESTONE_STATUSES.map((s) => <Glass key={s} className="rounded-[22px] p-[18px]"><div className="flex items-center justify-between"><Chip tone={tone(s)}>{label(s)}</Chip><span className="text-3xl font-semibold">{count(s)}</span></div></Glass>)}</div>
      {error && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_640px]">
          <div className="mb-[18px] flex flex-wrap items-center justify-between gap-2.5"><H2>Timeline</H2><div className="flex gap-1.5"><Pill on={!openOnly} onClick={() => setOpenOnly(false)}>All</Pill><Pill on={openOnly} onClick={() => setOpenOnly(true)}>Open only</Pill></div></div>
          <Async data={data} error={loadError}>
            {(all) => {
              const list = all.filter((m) => !openOnly || m.status !== 'completed');
              if (list.length === 0) return <Empty title="No milestones here">Add the first commitment with the form on the right.</Empty>;
              return (
                <div className="flex flex-col gap-5">
                  {MILESTONE_CATEGORIES.filter((c) => list.some((m) => m.category === c)).map((c) => (
                    <div key={c}>
                      <h3 className="mb-1 text-[15px] font-semibold text-violet">{label(c)}</h3>
                      <ul className="border-l border-white/[0.14] pl-[5px]">
                        {list.filter((m) => m.category === c).map((m) => (
                          <li key={m._id} className="-ml-[11px] flex gap-3.5 py-3">
                            <span aria-hidden className={clsx('mt-[5px] h-3 w-3 shrink-0 rounded-full shadow-[0_0_0_4px_rgba(255,255,255,.06)]', DOT[m.status])} />
                            <div className="flex min-w-0 flex-1 flex-wrap items-center justify-between gap-x-4 gap-y-2">
                              <div className="min-w-0 flex-[1_1_260px]"><div className="text-base font-medium">{m.title}</div><Small className="text-t2">{[m.description, m.assignee].filter(Boolean).join('. ')}</Small></div>
                              <div className="flex flex-wrap items-center gap-x-3.5 gap-y-2">
                                <span className="whitespace-nowrap text-sm text-t2">Due {day(m.dueDate)}</span>
                                <select aria-label={`Status of ${m.title}`} value={m.status} onChange={(e) => run(() => api.patch(`/milestones/${m._id}`, { status: e.target.value }))} className="field min-h-[44px] w-[150px]">{MILESTONE_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>
                                <IconBtn label={`Delete ${m.title}`} icon={Trash2} onClick={() => run(() => api.del(`/milestones/${m._id}`))} />
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              );
            }}
          </Async>
        </Glass>
        <Glass className="min-w-0 flex-[1_1_320px] p-[22px]">
          <H2>Add a milestone</H2>
          <form onSubmit={add} className="mt-3.5 flex flex-col gap-3">
            <Input label="Title" name="title" required placeholder="For example, episode 16 script lock" />
            <Select label="Phase" name="category" options={MILESTONE_CATEGORIES} />
            <div className="grid grid-cols-2 gap-3"><Input label="Due date" name="dueDate" type="date" required /><Select label="Status" name="status" options={MILESTONE_STATUSES} /></div>
            <Input label="Assigned to" name="assignee" /><Area label="Description" name="description" rows={2} placeholder="What done looks like" />
            <Btn variant="primary" icon={Plus} type="submit" className="w-full">Add milestone</Btn>
            <Small>A milestone that passes its due date turns to Delayed and marks the production at risk.</Small>
          </form>
        </Glass>
      </div>
    </>
  );
}
