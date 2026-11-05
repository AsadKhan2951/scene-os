'use client';

import clsx from 'clsx';
import { Copy, FileText, Printer } from 'lucide-react';
import { useState } from 'react';
import { TRACKING_REPORTS, TRACKING_REPORT_LABELS, type TrackingReport } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Btn, Empty, Glass, H2, Input, Note, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Production, ProjectReport } from '@/lib/types';

export default function ReportsPage() {
  return (<><SectionTabs items={TABS.track} /><WithProduction>{(p) => <Reports key={p._id} production={p} />}</WithProduction></>);
}

const HINT: Record<TrackingReport, string> = {
  daily_production: 'From the shoot plan, takes logged and the day\'s expense sheet. About 15 credits.',
  investor_update: 'Progress, money, risks and next week, written for investors. About 15 credits.',
  cost_summary: 'The cost report in plain words. Free: no AI.',
};

function Reports({ production: p }: { production: Production }) {
  const key = `/tracking/${p._id}/reports`;
  const { data, mutate } = useApi<ProjectReport[]>(key);
  const [date, setDate] = useState(new Date().toISOString().slice(0, 10));
  const [id, setId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const make = async (type: TrackingReport) => {
    setBusy(type); setError('');
    try { const r = await api.post<ProjectReport>(key, { type, ...(type === 'daily_production' ? { date } : {}) }); setId(r._id); await mutate(); await refresh('/credits'); }
    catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  const report = data?.find((r) => r._id === id) ?? data?.[0];

  return (
    <>
      <div className="print:hidden">
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Reports</h1>
        <p className="mt-1.5 text-base text-t2">{p.title}: written from what is logged in Scene OS, never from guesses. Portfolio reports for leadership are in Ask Scene AI.</p>
      </div>
      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(260px,1fr))] print:hidden">
        {TRACKING_REPORTS.map((t) => (
          <Glass key={t}>
            <H2>{TRACKING_REPORT_LABELS[t]}</H2>
            <Small className="mt-1">{HINT[t]}</Small>
            {t === 'daily_production' && <div className="mt-3"><Input label="Shoot day" type="date" value={date} onChange={(e) => setDate(e.target.value)} /></div>}
            <Btn variant="primary" icon={FileText} className="mt-3" disabled={!!busy} onClick={() => void make(t)}>{busy === t ? 'Writing…' : 'Write it'}</Btn>
          </Glass>
        ))}
      </div>
      {error && <Note>{error}</Note>}
      {!data?.length ? <Glass><Empty title="No reports yet">Write one above.</Empty></Glass> : (
        <div className="flex flex-wrap items-start gap-4">
          <Glass className="min-w-0 flex-[1_1_260px] print:hidden">
            <H2>Written</H2>
            <ul className="mt-2">
              {data.map((r) => (
                <li key={r._id}>
                  <button type="button" onClick={() => setId(r._id)} aria-current={report?._id === r._id ? 'true' : undefined} className={clsx('rule flex min-h-[48px] w-full flex-col justify-center px-2 text-left', report?._id === r._id && 'bg-white/[0.06]')}>
                    <span className="text-[14px] font-medium">{TRACKING_REPORT_LABELS[r.type as TrackingReport] ?? r.type}</span>
                    <Small>{day(r.createdAt)}{r.createdBy ? ` · ${r.createdBy}` : ''}</Small>
                  </button>
                </li>
              ))}
            </ul>
          </Glass>
          {report && (
            <Glass className="min-w-0 flex-[3_1_520px]">
              <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
                <H2>{report.title ?? TRACKING_REPORT_LABELS[report.type as TrackingReport]}</H2>
                <div className="flex gap-2">
                  <Btn icon={Copy} onClick={() => { void navigator.clipboard?.writeText(report.content).then(() => { setCopied(true); setTimeout(() => setCopied(false), 1500); }); }}>{copied ? 'Copied' : 'Copy'}</Btn>
                  <Btn icon={Printer} onClick={() => window.print()}>Print or PDF</Btn>
                </div>
              </div>
              <pre className="mt-4 whitespace-pre-wrap font-sans text-[15px] leading-relaxed text-t2 print:text-black">{report.content}</pre>
            </Glass>
          )}
        </div>
      )}
    </>
  );
}
