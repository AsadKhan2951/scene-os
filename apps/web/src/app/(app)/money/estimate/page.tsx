'use client';

import clsx from 'clsx';
import { Check, ChevronDown, Download, PencilLine, RefreshCw, Sparkles, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { ABOVE_THE_LINE, BUDGET_DEPARTMENTS, BUDGET_DEPARTMENT_LABELS, RATE_BASIS_LABELS, convert, type BudgetDepartment, type RateBasis } from '@sceneos/shared';
import { RunChecklist } from '@/components/run';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, Pill, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day, money, moneyShort } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { BudgetDoc, CostReportView, EstimateView, Me, Production } from '@/lib/types';

export default function EstimatePage() {
  return (<><SectionTabs items={TABS.money} /><WithProduction>{(p, me) => <Estimate key={p._id} production={p} me={me} />}</WithProduction></>);
}

const SOURCE: Record<string, string> = { rate_card: 'Rate card', actor: 'Actor rate', location: 'Location fee', own: 'Your figure' };

function Estimate({ production: p, me }: { production: Production; me: Me | undefined }) {
  const key = `/money/${p._id}/estimate`;
  const { data: cost, mutate: mutateCost } = useApi<CostReportView>(`/money/${p._id}/cost-report`);
  const { data, mutate } = useApi<EstimateView>(key, { refreshInterval: (d) => (d?.budgets.some((b) => ['queued', 'running'].includes(b.runStatus ?? '')) ? 4000 : 0) });
  const [budgetId, setBudgetId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [contingency, setContingency] = useState('10');
  const [mode, setMode] = useState<'view' | 'own' | 'rates'>('view');
  const [view, setView] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name); setError('');
    try { await fn(); await Promise.all([mutate(), mutateCost()]); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };

  if (!data) return null;
  const budget = data.budgets.find((b) => b._id === budgetId) ?? data.budgets.find((b) => b.adoptedAt) ?? data.budgets[0];
  const currency = budget?.currency ?? data.production.currency ?? 'PKR';
  const fx = budget?.fxRates.find((r) => r.code === view);
  const shown = fx ? view : currency;
  const m = (n: number) => money(convert(n, fx?.rate), shown);
  const running = budget && ['queued', 'running'].includes(budget.runStatus ?? '');
  const t = budget?.totals;
  const s = (n: number) => moneyShort(convert(n, fx?.rate), shown);
  /** One figure when low and high are the same (your own budget), else the range. */
  const span = (lo: number, hi: number) => (lo === hi ? m(lo) : `${m(lo)} – ${m(hi)}`);
  const spentPct = t && cost && t.total.mid > 0 ? Math.round((cost.totals.actual / t.total.mid) * 100) : null;
  const worst = cost?.rows.filter((r) => r.usedPct !== null).sort((a, b) => (b.usedPct ?? 0) - (a.usedPct ?? 0))[0];
  const overPlan = t && cost ? cost.totals.actual + cost.totals.estimateToComplete - t.total.mid : null;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{t ? `${s(t.total.mid)} estimated${spentPct !== null ? `, ${spentPct}% spent` : ''}.` : 'Budget estimate'}</h1>
          <p className="mt-1.5 text-base text-t2">
            {t ? `${budget!.kind === 'own' ? 'Your own budget' : 'AI estimate from the breakdown, shoot plan, locations and actors'}, ${budget!.contingencyPct}% contingency included. Middle ${m(t.total.mid)}.` : `${p.title}: an estimate from the breakdown, the shoot plan, locations and actor rates, in ${currency}.`}
          </p>
        </div>
        <div className="flex flex-wrap items-end gap-2.5">
          {budget && budget.fxRates.length > 0 && (
            <label className="flex flex-col gap-1.5 text-[13px] text-t3">Currency
              <select className="field !w-auto" value={view} onChange={(e) => setView(e.target.value)}>
                <option value="">{budget.currency}</option>{budget.fxRates.map((r) => <option key={r.code} value={r.code}>{r.code}</option>)}
              </select>
            </label>
          )}
          <Input label="Contingency %" type="number" min={0} max={30} value={contingency} onChange={(e) => setContingency(e.target.value)} className="w-28" />
          <Btn variant="primary" icon={Sparkles} disabled={!!busy || !!running} onClick={() => act('estimate', async () => { const r = await api.post<{ budget: BudgetDoc; run: { _id: string } }>(key, { contingencyPct: Number(contingency) || 10 }); setBudgetId(r.budget._id); setRunId(r.run._id); })}>Make AI estimate</Btn>
          <Btn icon={PencilLine} onClick={() => setMode(mode === 'own' ? 'view' : 'own')}>Enter my own budget</Btn>
        </div>
      </div>
      {t && cost && (
        <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(210px,1fr))]">
          <Glass><Small>Estimate</Small><div className="mt-1 text-[28px] font-semibold tabular-nums">{m(t.total.mid)}</div><Small className="mt-1">{t.total.low === t.total.high ? `${budget!.kind === 'own' ? 'Your figure' : 'One figure'}, ${budget!.contingencyPct}% contingency in` : `Range ${s(t.total.low)} to ${s(t.total.high)}`}</Small></Glass>
          <Glass><Small>Spent to date</Small><div className="mt-1 text-[28px] font-semibold tabular-nums">{m(cost.totals.actual)}</div><Small className="mt-1">{cost.progress.shootDays ? `Day ${cost.progress.daysShot} of ${cost.progress.shootDays}` : 'No shoot days yet'}{cost.totals.pending ? ` · ${s(cost.totals.pending)} waiting` : ''}</Small></Glass>
          <Glass><Small>Estimate to complete</Small><div className="mt-1 text-[28px] font-semibold tabular-nums">{m(cost.totals.estimateToComplete)}</div><Small className={`mt-1 ${overPlan !== null && overPlan > 0 ? 'text-risk' : ''}`}>{overPlan === null ? '' : overPlan > 0 ? `${s(overPlan)} over the plan` : `${s(-overPlan)} under the plan`}</Small></Glass>
          <Glass><Small>Burn per shoot day</Small><div className="mt-1 text-[28px] font-semibold tabular-nums">{cost.burnPerShootDay === null ? '—' : m(cost.burnPerShootDay)}</div>{worst && (worst.usedPct ?? 0) >= 70 ? <div className="mt-1"><Chip tone="warn">{BUDGET_DEPARTMENT_LABELS[worst.department as BudgetDepartment]} {worst.usedPct}% used</Chip></div> : <Small className="mt-1">From approved daily expenses</Small>}</Glass>
        </div>
      )}
      {error && <Note>{error}</Note>}
      {(runId || (running && budget?.runId)) && <Glass><RunChecklist runId={runId ?? budget!.runId!} onDone={() => { setRunId(null); void mutate(); }} /></Glass>}
      {mode === 'own' && <OwnBudget currency={currency} contingency={Number(contingency) || 10} onSaved={(b) => { setBudgetId(b._id); setMode('view'); void mutate(); void mutateCost(); }} productionId={p._id} />}

      {data.budgets.length === 0 ? <Glass><Empty title="No budget yet">Make an AI estimate (about 30 credits for the first rate card; re-pricing is free) or enter your own figures.</Empty></Glass> : (
        <>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap gap-1.5">
              {data.budgets.map((b) => (
                <Pill key={b._id} on={b._id === budget?._id} onClick={() => setBudgetId(b._id)}>
                  {b.kind === 'own' ? 'Own' : 'Estimate'} · {day(b.createdAt)}{b.adoptedAt ? ' · working' : ''}
                </Pill>
              ))}
            </div>
            {budget && (
              <div className="flex flex-wrap gap-2">
                {budget.kind === 'estimate' && <Btn icon={RefreshCw} disabled={!!busy} title="Counts the project again and prices every line from the rate card. Lines you edited by hand are replaced." onClick={() => act('recalc', () => api.post(`/money/budgets/${budget._id}/recalculate`))}>Price again</Btn>}
                {me?.role === 'admin' && !budget.adoptedAt && t && <Btn icon={Check} disabled={!!busy} onClick={() => act('adopt', () => api.post(`/money/budgets/${budget._id}/adopt`))}>Make this the working budget</Btn>}
                {budget.adoptedAt && <Chip tone="ok">Working budget{budget.adoptedBy ? `, set by ${budget.adoptedBy}` : ''}</Chip>}
                <Btn icon={Download} onClick={() => { window.location.href = `/api/money/${p._id}/top-sheet.xlsx`; }}>Export top sheet</Btn>
                {!budget.adoptedAt && <IconBtn label="Delete this budget" icon={Trash2} onClick={() => act('delete', async () => { await api.del(`/money/budgets/${budget._id}`); setBudgetId(null); })} />}
              </div>
            )}
          </div>

          {budget && t && (
            <div className="flex flex-wrap items-start gap-4">
              <TopSheet budget={budget} m={m} onSaved={() => void mutate()} />
              <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
                <Glass>
                  <H2>Totals</H2>
                  <dl className="mt-3 grid grid-cols-[1fr_auto] gap-y-2 text-[15px]">
                    <dt className="text-t2">Above the line</dt><dd className="text-right">{span(t.aboveLine.low, t.aboveLine.high)}</dd>
                    <dt className="text-t2">Below the line</dt><dd className="text-right">{span(t.belowLine.low, t.belowLine.high)}</dd>
                    <dt className="text-t2">Contingency {budget.contingencyPct}%</dt><dd className="text-right">{span(t.contingency.low, t.contingency.high)}</dd>
                    <dt className="font-semibold">Total</dt><dd className="text-right font-semibold">{span(t.total.low, t.total.high)}</dd>
                  </dl>
                </Glass>
                <Currency budget={budget} view={view} setView={setView} onSaved={() => void mutate()} />
                {budget.quantities && (
                  <Glass>
                    <H2>What it counted</H2>
                    <ul className="mt-2 text-[14px] leading-relaxed text-t2">
                      <li>{budget.quantities.shootDays} shoot days, {budget.quantities.prepDays} prep days, {budget.quantities.postWeeks} post weeks</li>
                      <li>{budget.quantities.cast.length} speaking parts, {budget.quantities.cast.reduce((n, c) => n + c.days, 0)} actor days ({budget.quantities.cast.filter((c) => c.dayRate).length} with their own rate)</li>
                      <li>{budget.quantities.extraDays} extra days, {budget.quantities.locations.length} places, {budget.quantities.companyMoves} company moves</li>
                      <li>{budget.quantities.vfxShots} VFX shots, {budget.quantities.stuntScenes} stunt scenes, {budget.quantities.vehicleDays} vehicle days</li>
                    </ul>
                    {budget.quantities.basis.map((b) => <Small key={b} className="mt-1">{b}</Small>)}
                  </Glass>
                )}
              </div>
            </div>
          )}
        </>
      )}

      {data.rateCard && (
        <Glass>
          <button type="button" className="flex w-full items-center justify-between gap-3 text-left" aria-expanded={mode === 'rates'} onClick={() => setMode(mode === 'rates' ? 'view' : 'rates')}>
            <div><H2>Rate card</H2><Small>{data.rateCard.lines.length} rates in {data.rateCard.currency}{data.rateCard.country ? ` for ${data.rateCard.country}` : ''}. {data.rateCard.estimate ? 'AI estimate: check these with your line producer.' : 'Checked and edited.'}</Small></div>
            <ChevronDown size={18} className={clsx('transition', mode === 'rates' && 'rotate-180')} aria-hidden />
          </button>
          {mode === 'rates' && <RateCardEditor productionId={p._id} card={data.rateCard} onSaved={async () => { if (budget?.kind === 'estimate') await api.post(`/money/budgets/${budget._id}/recalculate`); await mutate(); }} />}
        </Glass>
      )}
    </>
  );
}

function TopSheet({ budget, m, onSaved }: { budget: BudgetDoc; m: (n: number) => string; onSaved: () => void }) {
  const [open, setOpen] = useState<string | null>(null);
  const [lines, setLines] = useState(budget.lines);
  const [dirty, setDirty] = useState(false);
  const [msg, setMsg] = useState('');
  useEffect(() => { setLines(budget.lines); setDirty(false); }, [budget._id, budget.lines]);
  const depts = BUDGET_DEPARTMENTS.filter((d) => lines.some((l) => l.department === d));
  const save = async () => {
    try { await api.patch(`/money/budgets/${budget._id}`, { lines }); setDirty(false); setMsg('Saved'); onSaved(); } catch (e) { setMsg(errorText(e)); }
  };
  const edit = (i: number, k: 'low' | 'high', v: number) => { setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v, source: 'own' as const } : l))); setDirty(true); };
  return (
    <Glass className="min-w-0 flex-[999_1_560px]">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2>Top sheet</H2>
        <div className="flex items-center gap-2">{msg && <Small>{msg}</Small>}{dirty && <Btn variant="primary" onClick={() => void save()}>Save changes</Btn>}</div>
      </div>
      {[true, false].map((above) => (
        <div key={String(above)} className="mt-4">
          <Small className="mb-1 font-semibold uppercase tracking-wide">{above ? 'Above the line' : 'Below the line'}</Small>
          <ul>
            {depts.filter((d) => ABOVE_THE_LINE.includes(d) === above).map((d) => {
              const rows = lines.map((l, i) => ({ l, i })).filter(({ l }) => l.department === d);
              const low = rows.reduce((n, r) => n + r.l.low, 0);
              const high = rows.reduce((n, r) => n + r.l.high, 0);
              return (
                <li key={d} className="rule">
                  <button type="button" className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left" aria-expanded={open === d} onClick={() => setOpen(open === d ? null : d)}>
                    <span className="text-[15px] font-medium">{BUDGET_DEPARTMENT_LABELS[d as BudgetDepartment]} <span className="text-t3">· {rows.length}</span></span>
                    <span className="text-[15px] tabular-nums">{low === high ? m(low) : `${m(low)} – ${m(high)}`}</span>
                  </button>
                  {open === d && (
                    <div className="overflow-x-auto pb-3">
                      <table className="w-full min-w-[560px] text-left text-[13px]">
                        <thead><tr className="text-t3">{['Line', 'Qty', 'Low', 'High', 'From'].map((h) => <th key={h} scope="col" className="pb-1 pr-2 font-medium">{h}</th>)}</tr></thead>
                        <tbody>
                          {rows.map(({ l, i }) => (
                            <tr key={i} className="align-top">
                              <td className="py-1 pr-2">{l.item}{l.note && <div className="text-t3">{l.note}</div>}</td>
                              <td className="whitespace-nowrap py-1 pr-2">{l.qty} {l.unit}</td>
                              <td className="py-1 pr-2"><input aria-label={`${l.item} low`} type="number" min={0} className="field !min-h-[34px] w-28 !py-1" value={l.low} onChange={(e) => edit(i, 'low', Number(e.target.value))} /></td>
                              <td className="py-1 pr-2"><input aria-label={`${l.item} high`} type="number" min={0} className="field !min-h-[34px] w-28 !py-1" value={l.high} onChange={(e) => edit(i, 'high', Number(e.target.value))} /></td>
                              <td className="py-1"><Chip tone={l.source === 'own' ? 'info' : l.source === 'rate_card' ? 'ai' : 'ok'}>{SOURCE[l.source]}</Chip></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        </div>
      ))}
    </Glass>
  );
}

/** View the budget in another currency at a rate the producer types in (no live exchange rates are fetched). */
function Currency({ budget, view, setView, onSaved }: { budget: BudgetDoc; view: string; setView: (v: string) => void; onSaved: () => void }) {
  const [code, setCode] = useState('');
  const [rate, setRate] = useState('');
  const [msg, setMsg] = useState('');
  const add = async () => {
    const c = code.trim().toUpperCase();
    if (!/^[A-Z]{3}$/.test(c) || !(Number(rate) > 0)) { setMsg('Enter a 3-letter code and a rate above 0'); return; }
    try { await api.patch(`/money/budgets/${budget._id}`, { fxRates: [...budget.fxRates.filter((r) => r.code !== c), { code: c, rate: Number(rate) }] }); setCode(''); setRate(''); setMsg(''); setView(c); onSaved(); } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <Glass>
      <H2>Currency</H2>
      <div className="mt-2 flex flex-wrap gap-1.5">
        <Pill on={!view} onClick={() => setView('')}>{budget.currency}</Pill>
        {budget.fxRates.map((r) => <Pill key={r.code} on={view === r.code} onClick={() => setView(r.code)}>{r.code}</Pill>)}
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-2">
        <Input label="Code" value={code} maxLength={3} placeholder="USD" onChange={(e) => setCode(e.target.value)} className="w-20" />
        <Input label={`1 ${budget.currency} =`} type="number" step="any" min={0} value={rate} onChange={(e) => setRate(e.target.value)} className="w-32" />
        <Btn onClick={() => void add()}>Add</Btn>
      </div>
      <Small className="mt-2">{msg || 'Use today\'s rate from your bank. Scene OS does not fetch exchange rates.'}</Small>
    </Glass>
  );
}

function OwnBudget({ productionId, currency, contingency, onSaved }: { productionId: string; currency: string; contingency: number; onSaved: (b: BudgetDoc) => void }) {
  const [amounts, setAmounts] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const total = Object.values(amounts).reduce((n, v) => n + (Number(v) || 0), 0);
  const save = async () => {
    try {
      const lines = Object.entries(amounts).filter(([, v]) => Number(v) > 0).map(([department, v]) => ({ department, amount: Number(v) }));
      if (!lines.length) { setMsg('Enter at least one figure'); return; }
      onSaved(await api.post<BudgetDoc>(`/money/${productionId}/own`, { lines, contingencyPct: contingency }));
    } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <Glass>
      <H2>Your own budget</H2>
      <Small className="mt-1">One figure per department in {currency}. Leave blank what you do not budget. {contingency}% contingency is added on top.</Small>
      <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
        {BUDGET_DEPARTMENTS.map((d) => <Input key={d} label={BUDGET_DEPARTMENT_LABELS[d]} type="number" min={0} value={amounts[d] ?? ''} onChange={(e) => setAmounts({ ...amounts, [d]: e.target.value })} />)}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3"><Btn variant="primary" onClick={() => void save()}>Save budget</Btn><Small>Subtotal {money(total, currency)}</Small>{msg && <Small className="text-risk">{msg}</Small>}</div>
    </Glass>
  );
}

function RateCardEditor({ productionId, card, onSaved }: { productionId: string; card: EstimateView['rateCard'] & object; onSaved: () => Promise<void> }) {
  const [lines, setLines] = useState(card.lines);
  const [msg, setMsg] = useState('');
  const set = (i: number, k: 'low' | 'high', v: number) => setLines(lines.map((l, j) => (j === i ? { ...l, [k]: v } : l)));
  const save = async () => {
    try { await api.put(`/money/${productionId}/rate-card`, { lines: lines.map((l) => ({ ...l, high: Math.max(l.low, l.high), note: l.note || undefined })) }); await onSaved(); setMsg('Saved and priced again'); } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <div className="mt-3 overflow-x-auto">
      <table className="w-full min-w-[640px] text-left text-[13px]">
        <thead><tr className="text-t3">{['Department', 'Item', 'Per', 'Low', 'High'].map((h) => <th key={h} scope="col" className="pb-1 pr-2 font-medium">{h}</th>)}</tr></thead>
        <tbody>
          {lines.map((l, i) => (
            <tr key={i} className="align-top">
              <td className="py-1 pr-2">{BUDGET_DEPARTMENT_LABELS[l.department as BudgetDepartment] ?? l.department}</td>
              <td className="py-1 pr-2">{l.item}{l.note && <div className="text-t3">{l.note}</div>}</td>
              <td className="py-1 pr-2 text-t2">{RATE_BASIS_LABELS[l.basis as RateBasis] ?? l.basis}</td>
              <td className="py-1 pr-2"><input aria-label={`${l.item} low rate`} type="number" min={0} className="field !min-h-[34px] w-28 !py-1" value={l.low} onChange={(e) => set(i, 'low', Number(e.target.value))} /></td>
              <td className="py-1"><input aria-label={`${l.item} high rate`} type="number" min={0} className="field !min-h-[34px] w-28 !py-1" value={l.high} onChange={(e) => set(i, 'high', Number(e.target.value))} /></td>
            </tr>
          ))}
        </tbody>
      </table>
      <div className="mt-3 flex items-center gap-3"><Btn variant="primary" onClick={() => void save()}>Save rates and price again</Btn>{msg && <Small>{msg}</Small>}</div>
    </div>
  );
}
