'use client';

import { Download, Lock, Sparkles } from 'lucide-react';
import type { HealthThresholds } from '@sceneos/shared';
import { SectionTabs } from '@/components/shell';
import { Async, Bar, Btn, Chip, Empty, Glass, H2, PageTitle, Small, Sub, type Tone } from '@/components/ui';
import { useApi } from '@/lib/api';
import { HEALTH, pct } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { PortfolioRow } from '@/lib/types';

export default function HealthPage() {
  const { data, error } = useApi<{ thresholds: HealthThresholds; rows: PortfolioRow[] }>('/insights/health');
  return (
    <>
      <SectionTabs items={TABS.home} scoped={false} />
      <Async data={data} error={error}>
        {({ rows, thresholds: t }) => {
          const count = (s: string) => rows.filter((r) => r.health.status === s).length;
          const risk = count('at_risk');
          return (
            <>
              <PageTitle title="Production health" sub={risk ? `${risk} production${risk === 1 ? ' is' : 's are'} at risk. Start there.` : 'No production is at risk.'}>
                <a href="/api/exports/full" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.07] px-[18px] text-sm font-medium"><Download size={16} aria-hidden />Export full report</a>
              </PageTitle>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(240px,1fr))]">
                {(['on_track', 'needs_attention', 'at_risk'] as const).map((s) => (
                  <Glass key={s} className="rounded-3xl p-5"><div className="flex items-center justify-between"><Chip tone={HEALTH[s].tone}>{HEALTH[s].label}</Chip><span className="text-[34px] font-semibold tracking-[-0.02em]">{count(s)}</span></div></Glass>
                ))}
              </div>
              <div className="flex flex-wrap items-start gap-4">
                <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3.5">
                  {rows.length === 0 && <Glass><Empty title="No active productions" /></Glass>}
                  {rows.map((r) => (
                    <Glass key={r.id}>
                      <div className="flex flex-wrap items-center gap-3"><h2 className="text-[22px] font-semibold tracking-[-0.01em]">{r.title}</h2><Chip tone={HEALTH[r.health.status].tone}>{HEALTH[r.health.status].label}</Chip><span className="text-sm text-t3">Stage {r.currentStage} of 15</span></div>
                      <p className="mb-4 mt-2 text-[15px] text-t2">{r.health.reasons.length ? `Why: ${r.health.reasons.join('. ')}.` : 'No risk signal.'}</p>
                      <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
                        <Signal name="Scenes shot" value={r.signals.scenePct === null ? 'Not on floor' : pct(r.signals.scenePct)} bar={r.signals.scenePct} tone="idle" word={r.signals.scenePct === null ? 'Not started' : 'Tracked'} />
                        <Signal name="Budget used" value={r.signals.budgetPct === null ? 'No budget' : pct(r.signals.budgetPct)} bar={r.signals.budgetPct}
                          {...level(r.signals.budgetPct ?? 0, t.budgetAmberPct, t.budgetRedPct)} />
                        <Signal name="Delayed milestones" value={String(r.signals.delayedMilestones)} tone={r.signals.delayedMilestones ? 'risk' : 'ok'} word={r.signals.delayedMilestones ? 'Delayed' : 'Fine'} />
                        <Signal name="Expense sheets waiting" value={String(r.signals.pendingSheets)} {...level(r.signals.pendingSheets, t.pendingAmberCount, t.pendingRedCount)} />
                      </div>
                    </Glass>
                  ))}
                </div>
                <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
                  <Glass>
                    <H2>How health is worked out</H2>
                    <Small className="mb-2 mt-1.5 text-t2">Checked live on every active or on-hold production.</Small>
                    <Rule tone="ok" name="On track">No risk signal in budget use, milestones or approvals.</Rule>
                    <Rule tone="warn" name="Needs attention">Budget use at {t.budgetAmberPct}% or more, or {t.pendingAmberCount} or more expense sheets waiting.</Rule>
                    <Rule tone="risk" name="At risk">A milestone is delayed, {t.pendingRedCount} or more sheets are waiting, or budget use is at {t.budgetRedPct}% or more.</Rule>
                    <div className="mt-3 flex items-center gap-1.5 text-[13px] text-t3"><Lock size={13} aria-hidden />Levels are set on the server by an admin.</div>
                  </Glass>
                  <Glass><H2>Ask Dreamer</H2><Small className="mb-3.5 mt-1.5 text-t2">Get a written explanation and next steps for any production.</Small><Btn href="/dreamer?q=Which%20productions%20are%20at%20risk%20and%20why%3F" icon={Sparkles} className="w-full">Which productions are at risk and why?</Btn></Glass>
                </div>
              </div>
            </>
          );
        }}
      </Async>
    </>
  );
}

const level = (v: number, amber: number, red: number): { tone: Tone; word: string } => (v >= red ? { tone: 'risk', word: 'High' } : v >= amber ? { tone: 'warn', word: 'Elevated' } : { tone: 'ok', word: 'Fine' });

function Signal({ name, value, tone, word, bar }: { name: string; value: string; tone: Tone; word: string; bar?: number | null }) {
  return (
    <Sub className="p-3.5">
      <Small>{name}</Small>
      <div className="mt-1 flex items-center justify-between gap-2"><span className="text-xl font-semibold">{value}</span><Chip tone={tone}>{word}</Chip></div>
      {bar !== undefined && bar !== null && <Bar value={bar} className="mt-2" tone={tone === 'warn' || tone === 'risk' ? 'warn' : 'violet'} />}
    </Sub>
  );
}
const Rule = ({ tone, name, children }: { tone: Tone; name: string; children: React.ReactNode }) => <div className="rule py-3"><Chip tone={tone}>{name}</Chip><div className="mt-2 text-sm leading-normal text-t2">{children}</div></div>;
