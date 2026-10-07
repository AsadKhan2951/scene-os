'use client';

import clsx from 'clsx';
import { ArrowRight, Check, Lock } from 'lucide-react';
import { useState } from 'react';
import { PHASES, PHASE_LABELS, PRODUCTION_STATUSES, label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Bar, Btn, Chip, Empty, Glass, H2, Input, Note, Select, Small, Sub } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day, num, pkr, tone } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Episode, Me, Production } from '@/lib/types';

export default function PipelinePage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p, me) => <Pipeline key={p._id} production={p} me={me} />}</WithProduction></>);
}

function Pipeline({ production: p, me }: { production: Production; me: Me | undefined }) {
  const { data: episodes, mutate } = useApi<Episode[]>(`/productions/${p._id}/episodes`);
  const [note, setNote] = useState('');
  const [error, setError] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [all, setAll] = useState(false);
  const admin = me?.role === 'admin';
  const done = p.stages.filter((s) => s.status === 'completed').length;
  const current = p.stages.find((s) => s.order === p.currentStage);
  const next = p.stages.find((s) => s.order === p.currentStage + 1);
  const total = episodes?.reduce((s, e) => s + e.totalScenes, 0) ?? 0;
  const recorded = episodes?.reduce((s, e) => s + e.recordedScenes, 0) ?? 0;

  async function run(fn: () => Promise<unknown>) { setError(''); try { await fn(); await Promise.all([refresh('/productions'), refresh('/insights'), mutate()]); } catch (e) { setError(errorText(e)); } }
  const advance = () => run(async () => { await api.post(`/productions/${p._id}/stages/advance`, { note: note.trim() || undefined }); setNote(''); setConfirming(false); });
  const record = (e: Episode, patch: Partial<Episode>) => run(() => api.patch(`/productions/${p._id}/episodes/${e.number}`, patch));
  const shown = all ? episodes : episodes?.filter((e) => e.recordedScenes < e.totalScenes || e.totalScenes === 0).slice(0, 6);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-5">
        <div>
          <div className="flex flex-wrap items-center gap-3"><h1 className="text-4xl font-semibold tracking-[-0.03em]">{p.title}</h1><Chip tone={tone(p.status)}>{label(p.status)}</Chip></div>
          <p className="mt-2 text-base text-t2">Stage {p.currentStage} of 15, {current?.name}.{total ? ` ${num(total - recorded)} scenes left to shoot.` : ''}</p>
        </div>
        <div className="flex flex-wrap items-end gap-x-8 gap-y-3.5">
          {[['Format', label(p.format)], ['Channel', p.channel || 'Not decided'], ['Writer', p.writer || 'Not set'], ['Director', p.director || 'Not set'], ['Episodes', String(p.totalEpisodes)], ['Budget', p.totalBudget ? pkr(p.totalBudget) : 'Not set']].map(([a, b]) => <div key={a}><Small>{a}</Small><div className="mt-0.5 text-[15px] font-medium">{b}</div></div>)}
          <div className="w-[170px]"><Select label="Status" value={p.status} options={PRODUCTION_STATUSES} onChange={(e) => run(() => api.post(`/productions/${p._id}/status`, { status: e.target.value }))} /></div>
        </div>
      </div>

      <Glass>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><H2>Pipeline</H2><div className="flex max-w-[420px] flex-[1_1_240px] items-center gap-3"><Bar value={(done / 15) * 100} className="h-2" /><span className="whitespace-nowrap text-sm text-t2">{done} of 15 complete</span></div></div>
        <div className="flex flex-wrap items-stretch gap-3">
          {PHASES.map((phase) => {
            const stages = p.stages.filter((s) => s.phase === phase);
            return (
              <Sub key={phase} className={clsx('min-w-0 rounded-[20px] p-2.5', phase === 'pre_production' ? 'flex-[2_1_520px]' : 'flex-[1_1_270px]')}>
                <div className="mx-2.5 mb-2.5 mt-0.5 flex items-baseline justify-between gap-2.5"><h3 className="text-[15px] font-semibold">{PHASE_LABELS[phase]}</h3><Small>{stages.filter((s) => s.status === 'completed').length} of {stages.length} complete</Small></div>
                <ol className={clsx('grid gap-x-2 gap-y-0.5', phase === 'pre_production' && 'sm:grid-cols-2')}>
                  {stages.map((s) => {
                    const now = s.status === 'in_progress';
                    return (
                      <li key={s.order} className={clsx('flex items-center justify-between gap-2.5 rounded-[14px] border px-2.5 py-2', now ? 'border-violet/55 bg-violet/20' : 'border-transparent')} title={s.note}>
                        <span className={clsx('flex items-center gap-2.5 text-sm font-medium', now ? 'text-white' : s.status === 'completed' ? 'text-t2' : 'text-t3')}>
                          <span className={clsx('inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px]', s.status === 'completed' ? 'bg-ok/15 text-ok' : now ? 'bg-white font-semibold text-[#1B1340]' : 'bg-white/[0.07]')}>{s.status === 'completed' ? <Check size={14} aria-label="Completed" /> : s.order}</span>
                          {s.name}
                        </span>
                        {now ? <Chip tone="ai">Now</Chip> : s.completedAt ? <span className="whitespace-nowrap text-[13px] text-t3">{day(s.completedAt)}</span> : null}
                      </li>
                    );
                  })}
                </ol>
              </Sub>
            );
          })}
        </div>
        {current?.status !== 'completed' && (
          <div className="mt-[18px] flex flex-wrap items-end gap-4 border-t border-white/10 pt-[18px]">
            <div className="min-w-0 flex-[999_1_380px]"><Input label={`Completion note for stage ${p.currentStage}`} value={note} onChange={(e) => setNote(e.target.value)} placeholder="What was finished, and anything the next team should know" disabled={!admin} /></div>
            <div className="flex flex-[1_1_280px] flex-col gap-1.5">
              {confirming
                ? <div className="flex gap-2"><Btn variant="primary" icon={Check} onClick={advance}>Yes, complete stage {p.currentStage}</Btn><Btn onClick={() => setConfirming(false)}>Cancel</Btn></div>
                : <Btn variant="primary" icon={ArrowRight} disabled={!admin} onClick={() => setConfirming(true)}>{next ? `Complete stage and move to ${next.name}` : 'Complete the final stage'}</Btn>}
              <span className="inline-flex items-center gap-1.5 text-[13px] text-t3"><Lock size={13} aria-hidden />Admins only. This is recorded and cannot be undone here.</span>
            </div>
          </div>
        )}
        {error && <div className="mt-4"><Note>{error}</Note></div>}
      </Glass>

      <Glass>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div><H2>Scenes shot</H2><Small>{total ? `${num(recorded)} of ${num(total)} recorded, ${num(total - recorded)} remaining` : 'No scene counts yet'}</Small></div>
          <div className="flex gap-2.5">
            {episodes && episodes.length > 6 && <Btn onClick={() => setAll(!all)}>{all ? 'Show open episodes' : `Show all ${episodes.length}`}</Btn>}
            {episodes && episodes.length < p.totalEpisodes && <Btn variant="primary" onClick={() => run(() => api.post(`/productions/${p._id}/episodes/init`, {}))}>Set up all {p.totalEpisodes} episodes</Btn>}
          </div>
        </div>
        {episodes?.length === 0 ? <Empty title="No episodes set up">Set up the episode rows to start tracking scenes.</Empty> : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] border-collapse text-left">
              <thead><tr className="text-[13px] text-t3">{['Episode', 'Total scenes', 'Recorded', 'Remaining', 'Progress'].map((h) => <th key={h} scope="col" className="pb-2.5 pr-3.5 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {shown?.map((e) => (
                  <tr key={e._id} className="[&>td]:rule [&>td]:py-2.5 [&>td]:pr-3.5">
                    <td className="text-[15px] font-medium">Episode {e.number}</td>
                    <td><NumberCell label={`Total scenes, episode ${e.number}`} value={e.totalScenes} onSave={(v) => record(e, { totalScenes: v })} /></td>
                    <td><NumberCell label={`Recorded scenes, episode ${e.number}`} value={e.recordedScenes} max={e.totalScenes} onSave={(v) => record(e, { recordedScenes: v })} /></td>
                    <td className="text-[15px]">{e.totalScenes - e.recordedScenes}</td>
                    <td><div className="flex min-w-[140px] items-center gap-2.5"><Bar value={e.totalScenes ? (e.recordedScenes / e.totalScenes) * 100 : 0} tone={e.totalScenes > 0 && e.recordedScenes === e.totalScenes ? 'ok' : 'violet'} /><span className="w-10 text-[13px] text-t2">{e.totalScenes ? Math.round((e.recordedScenes / e.totalScenes) * 100) : 0}%</span></div></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Glass>
    </>
  );
}

/** A number that saves when the field loses focus. */
function NumberCell({ label: name, value, max, onSave }: { label: string; value: number; max?: number; onSave: (v: number) => void }) {
  const [v, setV] = useState(String(value));
  return <input aria-label={name} type="number" min={0} max={max} value={v} onChange={(e) => setV(e.target.value)} onBlur={() => { const n = Number(v); if (Number.isInteger(n) && n >= 0 && n !== value) onSave(n); else setV(String(value)); }} className="field min-h-[44px] w-24 text-right" />;
}
