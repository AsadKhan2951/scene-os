'use client';

import { ArrowRight, Send, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { label } from '@sceneos/shared';
import { SectionTabs } from '@/components/shell';
import { Async, Bar, Btn, Chip, Empty, Glass, H2, Row, Small, StageStrip, Two } from '@/components/ui';
import { useApi } from '@/lib/api';
import { HEALTH, day, pct, pkr } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { CallSheet, Episode, ExpenseSheet, PortfolioRow } from '@/lib/types';

interface CommandCentre {
  portfolio: PortfolioRow[]; pendingSheets: ExpenseSheet[]; shootsToday: CallSheet[]; draftCallSheets: CallSheet[];
  airingThisWeek: (Episode & { productionId: { title: string } })[];
}
const SUGGESTIONS = ['Which projects are behind schedule?', 'Cost analysis across all productions', 'How many scenes are remaining per project?'];
const titleOf = (p: { title: string } | string) => (typeof p === 'string' ? '' : p.title);

export default function CommandCentrePage() {
  const router = useRouter();
  const [q, setQ] = useState('');
  const { data, error } = useApi<CommandCentre>('/insights/command-centre');
  const ask = (text: string) => router.push(`/dreamer?q=${encodeURIComponent(text)}`);
  const submit = (e: FormEvent) => { e.preventDefault(); if (q.trim()) ask(q.trim()); };

  return (
    <>
      <SectionTabs items={TABS.home} scoped={false} />
      <Async data={data} error={error} what="Loading your productions">
        {(d) => {
          const atRisk = d.portfolio.filter((p) => p.health.status === 'at_risk').length;
          const pendingTotal = d.pendingSheets.reduce((s, x) => s + x.items.reduce((a, i) => a + i.requested, 0), 0);
          const decisions = (d.pendingSheets.length ? 1 : 0) + atRisk + d.draftCallSheets.length;
          return (
            <>
              <section className="flex flex-col gap-5 pt-4">
                <div>
                  <h1 className="max-w-[820px] text-[34px] font-semibold leading-[1.08] tracking-[-0.03em] sm:text-[46px]">
                    {d.portfolio.length} production{d.portfolio.length === 1 ? '' : 's'} running. {atRisk ? `${atRisk} ${atRisk === 1 ? 'is' : 'are'} at risk.` : 'None at risk.'}
                  </h1>
                  <p className="mt-2.5 text-[17px] text-t2">{day(new Date())}. {decisions ? `${decisions} thing${decisions === 1 ? ' needs' : 's need'} your decision.` : 'Nothing is waiting on you.'}</p>
                </div>
                <form onSubmit={submit} className="glass flex max-w-[860px] flex-wrap items-center gap-3 rounded-[28px] py-2.5 pl-5 pr-2.5">
                  <Sparkles size={20} className="text-violet" aria-hidden />
                  <input value={q} onChange={(e) => setQ(e.target.value)} aria-label="Ask Dreamer about your productions" placeholder="Ask Dreamer anything about your productions"
                    className="min-h-[48px] min-w-0 flex-[1_1_260px] bg-transparent text-[17px] outline-none placeholder:text-t3" />
                  <Btn variant="primary" icon={Send} type="submit">Ask</Btn>
                </form>
                <div className="flex flex-wrap gap-2">{SUGGESTIONS.map((s) => <Btn key={s} onClick={() => ask(s)} className="font-normal text-t2">{s}</Btn>)}</div>
              </section>

              <section className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(290px,1fr))]">
                {d.pendingSheets.length > 0 && (
                  <Decision tone="warn" tag="Approval waiting" title={`${d.pendingSheets.length} expense sheet${d.pendingSheets.length === 1 ? '' : 's'}, ${pkr(pendingTotal)}`}
                    body={`The oldest was submitted ${day(d.pendingSheets[0].submittedAt)}.`} cta="Review expenses" href="/money/approvals" />
                )}
                {d.portfolio.filter((p) => p.health.status === 'at_risk').map((p) => (
                  <Decision key={p.id} tone="risk" tag="At risk" title={p.title} body={`${p.health.reasons.join('. ')}.`} cta="Open health" href="/health" />
                ))}
                {d.draftCallSheets.map((c) => (
                  <Decision key={c._id} tone="info" tag="Draft" title={`Call sheet for ${day(c.shootDate)} is not published`} body={`${titleOf(c.productionId)}${c.location ? `, ${c.location}` : ''}.`} cta="Finish call sheet" href="/produce/schedule" />
                ))}
              </section>

              <div className="flex flex-wrap items-start gap-4">
                <Glass className="min-w-0 flex-[999_1_640px]">
                  <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><H2>Productions</H2><Btn href="/productions" icon={ArrowRight}>All productions</Btn></div>
                  {d.portfolio.length === 0 ? <Empty title="No active productions">Create one from the Productions tab.</Empty> : (
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[760px] border-collapse text-left">
                        <thead><tr className="text-[13px] font-medium text-t3">{['Production', 'Pipeline stage', 'Scenes shot', 'Budget', 'Health'].map((h) => <th key={h} scope="col" className="pb-3 pr-4 font-medium">{h}</th>)}</tr></thead>
                        <tbody>
                          {d.portfolio.map((p) => (
                            <tr key={p.id} className="align-top [&>td]:rule [&>td]:py-4 [&>td]:pr-4">
                              <td><div className="text-base font-semibold">{p.title}</div><Small>{label(p.format)}, {p.totalEpisodes} episode{p.totalEpisodes === 1 ? '' : 's'}</Small></td>
                              <td><div className="flex flex-col gap-1.5"><span className="text-sm">{p.stageName}</span><StageStrip current={p.currentStage} /><Small>Stage {p.currentStage} of 15</Small></div></td>
                              <td><div className="flex min-w-[110px] flex-col gap-1.5"><span className="text-sm">{p.scenes.total ? `${p.scenes.recorded} of ${p.scenes.total}` : 'Not started'}</span><Bar value={p.signals.scenePct} /></div></td>
                              <td><div className="flex min-w-[90px] flex-col gap-1.5"><span className="text-sm">{p.budget.usedPct === null ? 'No budget set' : `${pct(p.budget.usedPct)} used`}</span><Bar value={p.budget.usedPct} tone={(p.budget.usedPct ?? 0) >= 75 ? 'warn' : 'violet'} /></div></td>
                              <td><Chip tone={HEALTH[p.health.status].tone}>{HEALTH[p.health.status].label}</Chip></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </Glass>
                <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
                  <Glass>
                    <H2>On floor today</H2>
                    {d.shootsToday.length === 0 ? <Small className="mt-2">No call sheet for today.</Small> : d.shootsToday.map((c) => (
                      <Row key={c._id} left={<Two a={c.location ?? 'Location not set'} b={`${titleOf(c.productionId)}, call ${c.generalCall ?? 'not set'}`} />} right={<Chip tone={c.status === 'published' ? 'ok' : 'info'}>{label(c.status)}</Chip>} />
                    ))}
                    <div className="mt-3"><Btn href="/produce/schedule" icon={ArrowRight}>Open schedule</Btn></div>
                  </Glass>
                  <Glass>
                    <H2>Going to channel this week</H2>
                    {d.airingThisWeek.length === 0 ? <Small className="mt-2">Nothing has an air date in the next 7 days.</Small> : d.airingThisWeek.map((e) => (
                      <Row key={e._id} left={<Two a={`${e.productionId.title}, episode ${e.number}`} b={`Airs ${day(e.airDate)}`} />} right={<Chip tone={e.board.delivery === 'done' ? 'ok' : 'warn'}>{e.board.delivery === 'done' ? 'Delivered' : 'Not delivered'}</Chip>} />
                    ))}
                    <div className="mt-3"><Btn href="/deliver/board" icon={ArrowRight}>Open delivery board</Btn></div>
                  </Glass>
                </div>
              </div>
            </>
          );
        }}
      </Async>
    </>
  );
}

function Decision({ tone, tag, title, body, cta, href }: { tone: 'warn' | 'risk' | 'info'; tag: string; title: string; body: string; cta: string; href: string }) {
  return (
    <Glass className="flex flex-col gap-3 rounded-3xl p-[22px]">
      <div><Chip tone={tone}>{tag}</Chip></div>
      <h3 className="text-lg font-semibold tracking-[-0.01em]">{title}</h3>
      <p className="flex-grow text-sm leading-normal text-t2">{body}</p>
      <div><Btn href={href} icon={ArrowRight}>{cta}</Btn></div>
    </Glass>
  );
}
