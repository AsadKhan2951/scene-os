'use client';

import clsx from 'clsx';
import { Sparkles } from 'lucide-react';
import { useState } from 'react';
import { RISK_AREAS } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Btn, Chip, Empty, Glass, H2, Note, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { HEALTH, day } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { FlowRow, FlowView, RiskNoteRow } from '@/lib/types';

export default function FlowPage() {
  const { data, error, mutate } = useApi<FlowView>('/tracking/flow');
  const { choose } = useApp();
  const [open, setOpen] = useState<string | null>(null);
  const [area, setArea] = useState('');
  if (error) return <><SectionTabs items={TABS.track} scoped={false} /><Note>{error.message}</Note></>;
  if (!data) return <SectionTabs items={TABS.track} scoped={false} />;
  const rows = data.rows.filter((r) => !area || r.flags.some((f) => f.area === area));
  const count = (s: string) => data.rows.filter((r) => r.status === s).length;
  const selected = data.rows.find((r) => r.id === open);

  return (
    <>
      <SectionTabs items={TABS.track} scoped={false} />
      <div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{data.rows.length} projects. {count('at_risk') ? `${count('at_risk')} at risk.` : 'None at risk.'}</h1>
        <p className="mt-1.5 text-base text-t2">Every project on its stage flow, with risk flags from money, the shoot plan, cast, post and approvals. {count('needs_attention')} need attention.</p>
      </div>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" aria-pressed={!area} onClick={() => setArea('')} className={clsx('min-h-[40px] rounded-full border px-4 text-sm', !area ? 'border-white/20 bg-white/[0.16]' : 'border-white/10 text-t2')}>All</button>
        {RISK_AREAS.filter((a) => data.rows.some((r) => r.flags.some((f) => f.area === a))).map((a) => (
          <button key={a} type="button" aria-pressed={area === a} onClick={() => setArea(a)} className={clsx('min-h-[40px] rounded-full border px-4 text-sm capitalize', area === a ? 'border-white/20 bg-white/[0.16]' : 'border-white/10 text-t2')}>{a}</button>
        ))}
      </div>

      {data.rows.length === 0 ? <Glass><Empty title="No active projects" /></Glass> : (
        <div className="flex gap-3 overflow-x-auto pb-2">
          {data.columns.map((col) => {
            const inCol = rows.filter((r) => r.column === col);
            return (
              <section key={col} aria-label={col} className="w-64 shrink-0">
                <div className="mb-2 flex items-center justify-between px-1"><h2 className="text-[14px] font-semibold">{col}</h2><span className="text-[13px] text-t3">{inCol.length}</span></div>
                <ul className="flex flex-col gap-2">
                  {inCol.map((r) => (
                    <li key={r.id}>
                      <button type="button" onClick={() => setOpen(open === r.id ? null : r.id)} aria-expanded={open === r.id}
                        className={clsx('sub w-full rounded-[18px] p-3 text-left', open === r.id && 'ring-2 ring-[var(--violet)]')}>
                        <div className="flex items-start justify-between gap-2"><span className="text-[15px] font-semibold leading-tight">{r.title}</span><Chip tone={HEALTH[r.status].tone}>{HEALTH[r.status].label}</Chip></div>
                        <Small className="mt-1">{r.stage.flow === 'international' ? `Stage ${r.stage.order} of ${r.stage.of}` : `${r.stage.name}, step ${r.stage.order} of ${r.stage.of}`}{r.projectStatus === 'on_hold' ? ' · on hold' : ''}</Small>
                        {r.flags.slice(0, 2).map((f) => <div key={f.text} className={clsx('mt-1.5 text-[13px]', f.level === 'red' ? 'text-risk' : 'text-warn')}>{f.text}</div>)}
                        {r.flags.length > 2 && <Small className="mt-1">+{r.flags.length - 2} more</Small>}
                      </button>
                    </li>
                  ))}
                  {inCol.length === 0 && <li className="rounded-[18px] border border-dashed border-white/10 p-3 text-center text-[13px] text-t3">None</li>}
                </ul>
              </section>
            );
          })}
        </div>
      )}
      {selected && <Detail key={selected.id} row={selected} onChoose={() => choose(selected.id)} onChanged={() => void mutate()} />}
    </>
  );
}

function Detail({ row, onChoose, onChanged }: { row: FlowRow; onChoose: () => void; onChanged: () => void }) {
  const { data, mutate } = useApi<{ note: RiskNoteRow | null }>(`/tracking/${row.id}/risk`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const why = async () => {
    setBusy(true); setError('');
    try { await api.post(`/tracking/${row.id}/why`); await mutate(); onChanged(); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const note = data?.note;
  return (
    <Glass>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><H2>{row.title}</H2><Small>{row.stage.name} · {row.format}</Small></div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={onChoose}>Work on this project</Btn>
          <Btn variant="primary" icon={Sparkles} disabled={busy} onClick={() => void why()}>{busy ? 'Thinking…' : row.status === 'on_track' ? 'Explain status' : 'Why at risk?'}</Btn>
        </div>
      </div>
      {error && <div className="mt-3"><Note>{error}</Note></div>}
      <div className="mt-4 flex flex-wrap items-start gap-4">
        <div className="min-w-0 flex-[1_1_280px]">
          <Small className="mb-1 font-semibold uppercase tracking-wide">Flags</Small>
          {row.flags.length === 0 ? <Small>No risk flags.</Small> : (
            <ul className="flex flex-col gap-1.5">
              {row.flags.map((f) => <li key={f.text} className="flex items-start gap-2 text-[14px]"><Chip tone={f.level === 'red' ? 'risk' : 'warn'}>{f.area}</Chip><span>{f.text}</span></li>)}
            </ul>
          )}
        </div>
        <div className="min-w-0 flex-[2_1_380px]">
          <Small className="mb-1 font-semibold uppercase tracking-wide">Why, and what to do{note ? ` · ${day(note.createdAt)}` : ''}</Small>
          {!note ? <Small>Press “{row.status === 'on_track' ? 'Explain status' : 'Why at risk?'}” for a plain explanation and next steps (about 4 credits).</Small> : (
            <>
              <p className="text-[15px] leading-relaxed text-t2">{note.summary}</p>
              {note.actions.length > 0 && <ol className="mt-2 list-decimal pl-5 text-[14px]">{note.actions.map((a) => <li key={a.action} className="mt-1">{a.action} <span className="text-t3">({a.who})</span></li>)}</ol>}
            </>
          )}
        </div>
      </div>
    </Glass>
  );
}
