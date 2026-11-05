'use client';

import clsx from 'clsx';
import { AlertTriangle, ArrowRight, Check, Clock, FileText, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { TRACKING_REPORTS, TRACKING_REPORT_LABELS } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Btn, Chip, Empty, Glass, H2, Loading, Note, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { FlowRow, FlowView, RiskNoteRow } from '@/lib/types';

const WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
const count = (n: number, word: string) => `${WORDS[n] ?? n} ${word}${n === 1 ? '' : 's'}`;
const HEALTH_CHIP = {
  at_risk: { tone: 'risk' as const, icon: AlertTriangle, label: 'At risk' },
  needs_attention: { tone: 'warn' as const, icon: Clock, label: 'Watch' },
  on_track: { tone: 'ok' as const, icon: Check, label: 'On track' },
};
/** Where a flag sends you to fix it. */
const FIX: Record<string, { href: string; label: string }> = {
  schedule: { href: '/produce/plan', label: 'Open shoot plan' }, cast: { href: '/produce/actors', label: 'Open actors' },
  money: { href: '/money/cost', label: 'Open cost report' }, post: { href: '/deliver/post', label: 'Open post schedule' },
  approvals: { href: '/money/approvals', label: 'Open approvals' }, milestones: { href: '/produce/milestones', label: 'Open milestones' },
  script: { href: '/produce/breakdown', label: 'Open breakdown' }, ai: { href: '/credits', label: 'Open AI credits' },
};

export default function FlowPage() {
  const { data, error, mutate } = useApi<FlowView>('/tracking/flow');
  const [open, setOpen] = useState<string | null>(null);
  if (error) return <><SectionTabs items={TABS.track} scoped={false} /><Note>{error.message}</Note></>;
  if (!data) return <><SectionTabs items={TABS.track} scoped={false} /><Loading what="Checking every project" /></>;
  const risky = data.rows.filter((r) => r.status === 'at_risk');
  const watch = data.rows.filter((r) => r.status === 'needs_attention');
  const selected = data.rows.find((r) => r.id === open) ?? risky[0] ?? watch[0] ?? data.rows[0];
  const headline = risky.length ? `${count(risky.length, 'project')} at risk.` : watch.length ? `Nothing at risk; ${count(watch.length, 'project').toLowerCase()} to watch.` : 'Every project on track.';

  return (
    <>
      <SectionTabs items={TABS.track} scoped={false} />
      <div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{headline}</h1>
        <p className="mt-1.5 text-base text-t2">Every project through the international production stages, with health on schedule, budget, cast, post and approvals.</p>
      </div>

      {data.rows.length === 0 ? <Glass><Empty title="No active projects" /></Glass> : (
        <Glass>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[860px] border-collapse text-left">
              <thead>
                <tr className="text-[13px] text-t3">
                  <th scope="col" className="w-[220px] pb-3 pr-3 font-medium">Project</th>
                  {data.columns.map((c) => <th key={c} scope="col" className="pb-3 pr-2 font-medium">{c}</th>)}
                  <th scope="col" className="pb-3 font-medium">Health</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r) => <FlowLine key={r.id} row={r} columns={data.columns} selected={selected?.id === r.id} onSelect={() => setOpen(r.id)} />)}
              </tbody>
            </table>
          </div>
          <Small className="mt-3">Stages follow the standard film and series flow. Projects on the 15-step Pakistani serial flow are shown by their phase.</Small>
        </Glass>
      )}

      <div className="flex flex-wrap items-start gap-4">
        {selected && <Why key={selected.id} row={selected} onChanged={() => void mutate()} />}
        <Glass className="min-w-0 flex-[1_1_320px]">
          <H2>Reports</H2>
          <ul className="mt-3 flex flex-col gap-2">
            {TRACKING_REPORTS.map((t) => (
              <li key={t}><Btn icon={FileText} href="/track/reports" className="w-full !justify-start">{TRACKING_REPORT_LABELS[t]}</Btn></li>
            ))}
            <li><Btn icon={FileText} href="/dreamer" className="w-full !justify-start">Portfolio report for leadership</Btn></li>
          </ul>
        </Glass>
      </div>
    </>
  );
}

function FlowLine({ row: r, columns, selected, onSelect }: { row: FlowRow; columns: string[]; selected: boolean; onSelect: () => void }) {
  const at = Math.max(0, columns.indexOf(r.column));
  const h = HEALTH_CHIP[r.status];
  const Icon = h.icon;
  return (
    <tr className={clsx('cursor-pointer [&>td]:rule [&>td]:py-3', selected && 'bg-white/[0.04]')} onClick={onSelect}>
      <td className="pr-3">
        <button type="button" onClick={onSelect} aria-pressed={selected} className="text-left">
          <div className="text-[15px] font-semibold">{r.title}</div>
          <Small>{r.flags[0]?.text ?? (r.stage.flow === 'international' ? r.stage.name : `${r.stage.name}, step ${r.stage.order} of ${r.stage.of}`)}</Small>
        </button>
      </td>
      {columns.map((c, i) => (
        <td key={c} className="pr-2 align-top">
          <span aria-hidden className={clsx('mt-1.5 block h-2 rounded-full', i < at ? 'bg-violet/50' : i === at ? 'bg-violet' : 'bg-white/10')} />
          {i === at && <span className="sr-only">Now in {c}</span>}
        </td>
      ))}
      <td className="whitespace-nowrap"><Chip tone={h.tone}><Icon size={12} className="mr-1 inline" aria-hidden />{h.label}</Chip></td>
    </tr>
  );
}

function Why({ row, onChanged }: { row: FlowRow; onChanged: () => void }) {
  const { choose } = useApp();
  const { data, mutate } = useApi<{ note: RiskNoteRow | null }>(`/tracking/${row.id}/risk`);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const explain = async () => {
    setBusy(true); setError('');
    try { await api.post(`/tracking/${row.id}/why`); await mutate(); onChanged(); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const note = data?.note;
  const fix = FIX[row.flags[0]?.area ?? ''] ?? null;
  const title = row.status === 'at_risk' ? `Why ${row.title} is at risk` : row.status === 'needs_attention' ? `What to watch on ${row.title}` : `${row.title} is on track`;
  return (
    <Glass className="min-w-0 flex-[1_1_460px]">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <H2>{title}</H2>
        {note && <Small>Explained {day(note.createdAt)}</Small>}
      </div>
      {row.flags.length === 0 ? <Small className="mt-2">No risk flags from money, the shoot plan, cast, post or approvals.</Small> : (
        <ul className="mt-3 list-disc pl-5 text-[15px] leading-relaxed">
          {row.flags.map((f) => <li key={f.text} className={f.level === 'red' ? 'text-risk' : ''}><span className="text-t1">{f.text}</span></li>)}
        </ul>
      )}
      {note && (
        <div className="mt-3 rounded-2xl bg-white/[0.04] p-3">
          <p className="text-[15px] leading-relaxed text-t2">{note.summary}</p>
          {note.actions.length > 0 && <ol className="mt-2 list-decimal pl-5 text-[14px]">{note.actions.map((a) => <li key={a.action} className="mt-1">{a.action} <span className="text-t3">({a.who})</span></li>)}</ol>}
        </div>
      )}
      {error && <div className="mt-3"><Note>{error}</Note></div>}
      <div className="mt-4 flex flex-wrap gap-2">
        {fix && <Btn icon={ArrowRight} href={fix.href} onClick={() => choose(row.id)}>{fix.label}</Btn>}
        {row.flags.length > 0 && <Btn icon={Sparkles} disabled={busy} onClick={() => void explain()}>{busy ? 'Thinking…' : note ? 'Explain again' : 'Explain and suggest next steps'}</Btn>}
      </div>
      {row.flags.length > 0 && !note && <Small className="mt-2">Scene AI explains the flags in plain words with who does what next (about 4 credits).</Small>}
    </Glass>
  );
}
