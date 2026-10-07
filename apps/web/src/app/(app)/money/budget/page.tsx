'use client';

import { AlertTriangle, Download, Sparkles } from 'lucide-react';
import { label } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Async, Bar, Btn, Glass, H2, PageTitle, Row, Small } from '@/components/ui';
import { useApi } from '@/lib/api';
import { num, pct, pkr } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { PortfolioRow } from '@/lib/types';

interface Budget { totals: { budget: number; approved: number; pending: number; remaining: number; usedPct: number | null }; highBurn: string[]; rows: PortfolioRow[] }
interface Detail { row?: PortfolioRow; categories: { _id: string; approved: number }[]; forecast: { costPerScene: number; scenesLeft: number; costToFinish: number; leftAfterShoot: number } | null }

export default function BudgetPage() {
  const { production } = useApp();
  const { data, error } = useApi<Budget>('/insights/budget');
  const { data: detail } = useApi<Detail>(production ? `/insights/budget/${production._id}` : null);
  const catTotal = detail?.categories.reduce((a, c) => a + c.approved, 0) ?? 0;

  return (
    <>
      <SectionTabs items={TABS.money} />
      <Async data={data} error={error}>
        {({ totals: t, rows, highBurn }) => (
          <>
            <PageTitle title="Budget" sub={t.usedPct === null ? 'No budgets are set yet.' : `${pct(t.usedPct)} of the total budget is used.${highBurn.length ? ` ${highBurn.length} production${highBurn.length === 1 ? ' is' : 's are'} burning fast.` : ''}`}>
              <a href="/api/exports/budget" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.07] px-[18px] text-sm font-medium"><Download size={16} aria-hidden />Export budget and expenses</a>
            </PageTitle>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
              {[['Total budget', pkr(t.budget), `${rows.length} active production${rows.length === 1 ? '' : 's'}`], ['Approved spend', pkr(t.approved), `${pct(t.usedPct)} of total budget`], ['Waiting for approval', pkr(t.pending), 'Submitted, not yet approved'], ['Remaining', pkr(t.remaining), 'After approved spend']].map(([a, b, c]) => (
                <Glass key={a} className="rounded-3xl p-5"><div className="text-sm text-t2">{a}</div><div className="mb-2 mt-1.5 text-3xl font-semibold tracking-[-0.02em]">{b}</div><Small>{c}</Small></Glass>
              ))}
            </div>
            {rows.filter((r) => highBurn.includes(r.id)).map((r) => (
              <div key={r.id} role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-[20px] border border-warn/35 bg-warn/[0.08] px-[18px] py-3.5">
                <div className="flex flex-[1_1_320px] items-start gap-2.5 text-warn"><AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /><div><div className="text-[15px] font-semibold">High burn on {r.title}</div><div className="mt-0.5 text-sm text-t2">{pct(r.budget.usedPct)} of the budget is used and {pkr(r.budget.remaining)} is left.</div></div></div>
                <Btn icon={Sparkles} href={`/dreamer?q=${encodeURIComponent(`Give me a cost analysis for ${r.title}`)}`}>Ask Dreamer for a cost analysis</Btn>
              </div>
            ))}
            <Glass>
              <H2>By production</H2>
              <div className="mt-4 overflow-x-auto">
                <table className="w-full min-w-[860px] border-collapse text-left">
                  <thead><tr className="text-[13px] text-t3">{['Production', 'Budget', 'Approved', 'Waiting', 'Remaining', 'Used', 'Sheets'].map((h, i) => <th key={h} scope="col" className={`pb-2.5 pr-3.5 font-medium ${i > 0 && i !== 5 ? 'text-right' : ''}`}>{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((r) => (
                      <tr key={r.id} className="[&>td]:rule whitespace-nowrap text-[15px] [&>td]:py-3.5 [&>td]:pr-3.5">
                        <td className="font-semibold">{r.title}</td><td className="text-right">{pkr(r.budget.budget)}</td><td className="text-right">{pkr(r.budget.approved)}</td><td className="text-right">{r.budget.pending ? pkr(r.budget.pending) : 'None'}</td><td className="text-right">{pkr(r.budget.remaining)}</td>
                        <td><div className="flex min-w-[150px] items-center gap-2.5"><Bar value={r.budget.usedPct} tone={highBurn.includes(r.id) ? 'warn' : 'violet'} /><span className="w-10 text-right text-sm">{pct(r.budget.usedPct)}</span></div></td><td className="text-right">{r.budget.sheets}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </Glass>
            {production && detail && (
              <div className="flex flex-wrap items-start gap-4">
                <Glass className="min-w-0 flex-[999_1_520px]">
                  <H2>Where the money went</H2><Small>{production.title}, {pkr(catTotal)} approved</Small>
                  {detail.categories.length === 0 && <Small className="mt-4">No approved spend yet.</Small>}
                  <div className="mt-3">{detail.categories.map((c) => (
                    <div key={c._id} className="grid items-center gap-3 py-2 [grid-template-columns:150px_1fr_130px]"><span className="text-sm text-t2">{label(c._id)}</span><Bar value={catTotal ? (c.approved / catTotal) * 100 : 0} className="h-2" /><span className="whitespace-nowrap text-right text-sm">{pkr(c.approved)}, {catTotal ? Math.round((c.approved / catTotal) * 100) : 0}%</span></div>
                  ))}</div>
                </Glass>
                <Glass className="min-w-0 flex-[1_1_340px]">
                  <H2>Shoot cost forecast</H2><Small className="mb-3.5 mt-1">{production.title}. A simple estimate from spend so far.</Small>
                  {!detail.forecast ? <Small>Available once scenes have been recorded and spend approved.</Small> : (
                    <>
                      {[['Approved spend per recorded scene', pkr(detail.forecast.costPerScene)], ['Scenes left to shoot', num(detail.forecast.scenesLeft)], ['Likely cost to finish the shoot', pkr(detail.forecast.costToFinish)], ['Budget remaining', pkr(detail.row?.budget.remaining)]].map(([a, b]) => <Row key={a} className="py-2.5" left={<span className="text-sm text-t2">{a}</span>} right={<span className="text-[15px] font-medium">{b}</span>} />)}
                      <div className={`mt-3.5 rounded-2xl border px-4 py-3.5 text-[15px] leading-normal ${detail.forecast.leftAfterShoot >= 0 ? 'border-ok/35 bg-ok/10' : 'border-red-400/40 bg-red-400/10'}`}>
                        {detail.forecast.leftAfterShoot >= 0 ? `At the current rate the shoot finishes with about ${pkr(detail.forecast.leftAfterShoot)} left.` : `At the current rate the shoot runs about ${pkr(-detail.forecast.leftAfterShoot)} over budget.`}
                      </div>
                    </>
                  )}
                </Glass>
              </div>
            )}
          </>
        )}
      </Async>
    </>
  );
}
