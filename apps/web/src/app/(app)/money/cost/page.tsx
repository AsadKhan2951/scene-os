'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { BUDGET_DEPARTMENT_LABELS, convert, type BudgetDepartment } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Bar, Btn, Empty, Glass, H2, Pill, Small } from '@/components/ui';
import { useApi } from '@/lib/api';
import { money, moneyShort } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { CostReportView, Production } from '@/lib/types';

export default function CostReportPage() {
  return (<><SectionTabs items={TABS.money} /><WithProduction>{(p) => <Cost key={p._id} production={p} />}</WithProduction></>);
}

function Cost({ production: p }: { production: Production }) {
  const { data } = useApi<CostReportView>(`/money/${p._id}/cost-report`);
  const [view, setView] = useState('');
  if (!data) return null;
  const currency = data.production.currency ?? 'PKR';
  const fx = data.budget?.fxRates.find((r) => r.code === view);
  const cur = fx ? view : currency;
  const m = (n: number) => money(convert(n, fx?.rate), cur);
  const s = (n: number | null) => (n === null ? 'n/a' : moneyShort(convert(n, fx?.rate), cur));
  const t = data.totals;
  const withContingency = t.budget + (data.budget?.contingency ?? 0);
  const over = t.estimateAtCompletion > withContingency;

  const tiles = [
    { label: 'Budget', value: s(withContingency), note: data.budget ? `${data.budget.kind === 'own' ? 'Your budget' : 'Estimate, middle'}, with ${data.budget.contingencyPct}% contingency` : 'No budget yet' },
    { label: 'Spent to date', value: s(t.actual), note: `${t.pending ? `${s(t.pending)} waiting for approval` : 'Approved expenses'}` },
    { label: 'Estimate to complete', value: s(t.estimateToComplete), note: 'At the pace of the days shot so far' },
    { label: 'Estimate at completion', value: s(t.estimateAtCompletion), note: over ? `${s(t.estimateAtCompletion - withContingency)} over budget` : `${s(withContingency - t.estimateAtCompletion)} left after contingency`, risk: over },
    { label: 'Burn per shoot day', value: s(data.burnPerShootDay), note: `${data.progress.daysShot} of ${data.progress.shootDays || '?'} shoot days done` },
  ];

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Cost report</h1>
          <p className="mt-1.5 text-base text-t2">{p.title}: approved daily expenses against the {data.budget?.adoptedAt ? 'working' : 'latest'} budget, by department.</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          {!!data.budget?.fxRates.length && <div className="flex gap-1.5"><Pill on={!view} onClick={() => setView('')}>{currency}</Pill>{data.budget.fxRates.map((r) => <Pill key={r.code} on={view === r.code} onClick={() => setView(r.code)}>{r.code}</Pill>)}</div>}
          <Btn icon={Download} onClick={() => { window.location.href = `/api/money/${p._id}/top-sheet.xlsx`; }}>Export top sheet</Btn>
        </div>
      </div>

      <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
        {tiles.map((x) => (
          <Glass key={x.label}>
            <Small>{x.label}</Small>
            <div className={`mt-1 text-[26px] font-semibold tabular-nums ${x.risk ? 'text-risk' : ''}`}>{x.value}</div>
            <Small className="mt-1">{x.note}</Small>
          </Glass>
        ))}
      </div>

      {data.rows.length === 0 ? <Glass><Empty title="Nothing to report yet">Make or enter a budget in Estimate; approved daily expenses then show here by department.<div className="mt-4"><Btn variant="primary" href="/money/estimate">Open Estimate</Btn></div></Empty></Glass> : (
        <Glass>
          <H2>By department</H2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
              <thead><tr className="text-[13px] text-t3">{['Department', 'Budget', 'Actual', 'Used', 'Pending', 'To complete', 'At completion', 'Variance'].map((h) => <th key={h} scope="col" className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              {[true, false].map((above) => (
                <tbody key={String(above)}>
                  <tr><th colSpan={8} scope="colgroup" className="pb-1 pt-3 text-left text-[12px] font-semibold uppercase tracking-wide text-t3">{above ? 'Above the line' : 'Below the line'}</th></tr>
                  {data.rows.filter((r) => r.aboveLine === above).map((r) => (
                    <tr key={r.department} className="[&>td]:rule [&>td]:py-2.5 [&>td]:pr-3">
                      <td className="font-medium">{BUDGET_DEPARTMENT_LABELS[r.department as BudgetDepartment] ?? r.department}</td>
                      <td className="tabular-nums">{m(r.budget)}</td>
                      <td className="tabular-nums">{m(r.actual)}</td>
                      <td className="w-36">{r.usedPct === null ? <Small>no budget</Small> : <><Bar value={Math.min(100, r.usedPct)} tone={r.usedPct > 100 ? 'warn' : r.usedPct > 80 ? 'warn' : 'ok'} /><Small>{r.usedPct}%</Small></>}</td>
                      <td className="tabular-nums">{r.pending ? m(r.pending) : '—'}</td>
                      <td className="tabular-nums">{m(r.estimateToComplete)}</td>
                      <td className="tabular-nums">{m(r.estimateAtCompletion)}</td>
                      <td className={`tabular-nums ${r.variance < 0 ? 'text-risk' : ''}`}>{m(r.variance)}</td>
                    </tr>
                  ))}
                </tbody>
              ))}
              <tfoot>
                {data.budget && <tr className="[&>td]:pt-3 [&>td]:pr-3"><td>Contingency {data.budget.contingencyPct}%</td><td className="tabular-nums">{m(data.budget.contingency)}</td><td colSpan={6} /></tr>}
                <tr className="font-semibold [&>td]:pt-2 [&>td]:pr-3"><td>Total</td><td className="tabular-nums">{m(withContingency)}</td><td className="tabular-nums">{m(t.actual)}</td><td /><td className="tabular-nums">{m(t.pending)}</td><td className="tabular-nums">{m(t.estimateToComplete)}</td><td className="tabular-nums">{m(t.estimateAtCompletion)}</td><td className={`tabular-nums ${over ? 'text-risk' : ''}`}>{m(withContingency - t.estimateAtCompletion)}</td></tr>
              </tfoot>
            </table>
          </div>
          <Small className="mt-3">Daily expense categories are placed on the top sheet: crew wages under Production crew, props and art direction under Art and props, and so on. Departments that spend late (post, music, VFX) keep their full budget as the estimate to complete.</Small>
        </Glass>
      )}
    </>
  );
}
