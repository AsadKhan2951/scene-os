'use client';

import clsx from 'clsx';
import { ArrowRight, Check, Clock, FileText, Mic, Plus, Sparkles, AlertTriangle, Upload } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { label } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Async, Bar, Btn, Chip, Empty, Glass, H2, Pill, Row, Small, Two } from '@/components/ui';
import { useApi } from '@/lib/api';
import { HEALTH, day, pct } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { CallSheet, CreditSummary, Episode, ExpenseSheet, PortfolioRow } from '@/lib/types';

interface CommandCentre {
  portfolio: PortfolioRow[]; pendingSheets: ExpenseSheet[]; shootsToday: CallSheet[]; draftCallSheets: CallSheet[];
  airingThisWeek: (Episode & { productionId: { title: string } })[];
}
const MAKING = ['Feature film', 'Series', 'Micro drama', 'Short film', 'Documentary', 'Commercial'] as const;
const READS = ['.docx', '.pdf', 'Final Draft .fdx', '.fountain', 'Celtx', 'InPage', '.txt'];
const titleOf = (p: { title: string } | string) => (typeof p === 'string' ? '' : p.title);
/** A stable colour per project for its cover until it has a look-book image. */
const COVERS = ['from-violet/40 to-pink/20', 'from-info/35 to-violet/15', 'from-warn/35 to-risk/15', 'from-ok/35 to-info/15', 'from-pink/35 to-warn/15', 'from-info/30 to-ok/15'];

export default function MyStudioPage() {
  const router = useRouter();
  const { choose } = useApp();
  const [idea, setIdea] = useState('');
  const [making, setMaking] = useState<string>('Series');
  const { data, error } = useApi<CommandCentre>('/insights/command-centre');
  const { data: credits } = useApi<CreditSummary>('/credits');

  const start = (e: FormEvent) => {
    e.preventDefault();
    const text = idea.trim() ? `${making}: ${idea.trim()}` : '';
    router.push(`/write/new${text ? `?idea=${encodeURIComponent(text)}` : ''}`);
  };
  const open = (id: string, href: string) => { choose(id); router.push(href); };

  return (
    <>
      <SectionTabs items={TABS.home} scoped={false} />
      <Async data={data} error={error} what="Loading your studio">
        {(d) => {
          const count = (s: string) => d.portfolio.filter((p) => p.health.status === s).length;
          const atRisk = count('at_risk');
          const pendingTotal = d.pendingSheets.reduce((s, x) => s + x.items.reduce((a, i) => a + i.requested, 0), 0);
          return (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap gap-2">
                  <Chip tone="risk">{atRisk} of {d.portfolio.length} projects at risk</Chip>
                  <Chip tone="warn">{count('needs_attention')} need attention</Chip>
                  <Chip tone="ok">{count('on_track')} on track</Chip>
                </div>
                <Small>{day(new Date())}{credits ? ` · ${Math.max(0, Math.floor(credits.available)).toLocaleString('en-US')} of ${credits.monthlyCredits.toLocaleString('en-US')} AI credits left` : ''}</Small>
              </div>

              <Glass className="flex flex-col items-center gap-5 px-5 py-10 text-center sm:px-10">
                <Chip tone="ai">Scene AI reads, plans and pictures your story</Chip>
                <h1 className="text-[40px] font-semibold leading-[1.05] tracking-[-0.03em] sm:text-[56px]">Let&apos;s get cracking.</h1>
                <p className="max-w-[620px] text-[17px] text-t2">Drop in a script, a concept or a one-liner, or just tell the story out loud. Scene OS builds the characters, costumes, locations, storyboard, schedule and budget from it.</p>
                <form onSubmit={start} className="sub flex w-full max-w-[860px] flex-wrap items-center gap-3 rounded-[28px] py-2.5 pl-5 pr-2.5">
                  <textarea value={idea} onChange={(e) => setIdea(e.target.value)} rows={2} aria-label="Your story in a few lines" dir="auto"
                    placeholder="A ferry captain on the Arabian Sea has one night to get a stranger across the border…"
                    className="min-h-[52px] min-w-0 flex-[1_1_300px] resize-none bg-transparent py-2 text-[17px] outline-none placeholder:text-t3" />
                  <Btn variant="primary" icon={Sparkles} type="submit">Start building</Btn>
                </form>
                <div className="flex flex-wrap justify-center gap-2">
                  <Btn icon={Upload} href="/write/new">Upload script or concept</Btn>
                  <Btn icon={Mic} href="/write/new">Dictate the synopsis</Btn>
                  <Btn icon={FileText} href="/write/one-liner">Paste a one-liner</Btn>
                </div>
                <div className="flex flex-col items-center gap-2">
                  <Small>What are you making?</Small>
                  <div className="flex flex-wrap justify-center gap-2">{MAKING.map((m) => <Pill key={m} on={making === m} onClick={() => setMaking(m)}>{m}</Pill>)}</div>
                  <Small className="mt-1">Reads {READS.join(' · ')}</Small>
                </div>
              </Glass>

              <div className="flex flex-wrap items-center justify-between gap-3"><H2>Your projects</H2><Btn icon={Plus} href="/productions">New project</Btn></div>
              {d.portfolio.length === 0 ? <Glass><Empty title="No active projects">Start one above, or create it from Projects.</Empty></Glass> : (
                <div className="grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                  {d.portfolio.map((p, i) => {
                    const progress = p.stageCount ? (p.currentStage / p.stageCount) * 100 : 0;
                    const note = p.health.reasons[0] ?? (p.scenes.total ? `${p.scenes.recorded} of ${p.scenes.total} scenes shot` : 'Nothing waiting');
                    return (
                      <button key={p.id} type="button" onClick={() => open(p.id, '/produce/pipeline')} className="glass flex flex-col gap-3 rounded-[24px] p-3.5 text-left transition hover:brightness-110">
                        <div className={clsx('flex h-28 items-end rounded-[16px] bg-gradient-to-br p-2.5', COVERS[i % COVERS.length])}><span className="rounded-full bg-ink/60 px-2.5 py-1 text-[12px] text-t1">Look book cover</span></div>
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0"><div className="truncate text-[17px] font-semibold">{p.title}</div><Small>{label(p.format)} · {p.totalEpisodes} episode{p.totalEpisodes === 1 ? '' : 's'}</Small></div>
                          <Chip tone={HEALTH[p.health.status].tone}>{HEALTH[p.health.status].label}</Chip>
                        </div>
                        <div>
                          <div className="flex justify-between text-[13px]"><span>{p.stageName}</span><span className="text-t2">{pct(progress)}</span></div>
                          <Bar value={progress} className="mt-1.5" />
                        </div>
                        <div className="flex justify-between gap-2 text-[13px] text-t2"><span className="truncate">{note}</span><span className="whitespace-nowrap">Budget {pct(p.budget.usedPct)}</span></div>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="flex flex-wrap items-start gap-4">
                <Glass className="min-w-0 flex-[999_1_560px]">
                  <H2>Needs you today</H2>
                  {d.pendingSheets.length === 0 && atRisk === 0 && d.draftCallSheets.length === 0 ? <Small className="mt-2">Nothing is waiting on you.</Small> : (
                    <div className="mt-1">
                      {d.pendingSheets.length > 0 && (
                        <Row left={<Two a={`${d.pendingSheets.length} expense sheet${d.pendingSheets.length === 1 ? '' : 's'} waiting for approval`} b={`PKR ${Math.round(pendingTotal).toLocaleString('en-PK')}; the oldest was sent ${day(d.pendingSheets[0].submittedAt)}`} />} right={<Btn icon={Clock} href="/money/approvals">Review</Btn>} />
                      )}
                      {d.portfolio.filter((p) => p.health.status === 'at_risk').map((p) => (
                        <Row key={p.id} left={<Two a={`${p.title} is at risk`} b={`${p.health.reasons.join('. ')}.`} />} right={<Btn icon={AlertTriangle} onClick={() => open(p.id, '/health')}>Open</Btn>} />
                      ))}
                      {d.draftCallSheets.map((c) => (
                        <Row key={c._id} left={<Two a={`Call sheet for ${day(c.shootDate)} is not published`} b={`${titleOf(c.productionId)}${c.location ? `, ${c.location}` : ''}`} />} right={<Btn icon={Check} href="/produce/schedule">Finish</Btn>} />
                      ))}
                    </div>
                  )}
                </Glass>
                <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
                  <Glass>
                    <H2>On floor today</H2>
                    {d.shootsToday.length === 0 ? <Small className="mt-2">No call sheet for today.</Small> : d.shootsToday.map((c) => (
                      <Row key={c._id} left={<Two a={c.location ?? 'Location not set'} b={`${titleOf(c.productionId)}, call ${c.generalCall ?? 'not set'}`} />} right={<Chip tone={c.status === 'published' ? 'ok' : 'info'}>{label(c.status)}</Chip>} />
                    ))}
                  </Glass>
                  <Glass>
                    <H2>Going to channel this week</H2>
                    {d.airingThisWeek.length === 0 ? <Small className="mt-2">Nothing has an air date in the next 7 days.</Small> : d.airingThisWeek.map((e) => (
                      <Row key={e._id} left={<Two a={`${e.productionId.title}, episode ${e.number}`} b={`Airs ${day(e.airDate)}`} />} right={<Chip tone={e.board.delivery === 'done' ? 'ok' : 'warn'}>{e.board.delivery === 'done' ? 'Delivered' : 'Not delivered'}</Chip>} />
                    ))}
                    <div className="mt-3"><Btn href="/dreamer" icon={ArrowRight}>Ask Scene AI</Btn></div>
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
