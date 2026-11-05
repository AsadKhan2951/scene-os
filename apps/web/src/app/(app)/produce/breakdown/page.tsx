'use client';

import { ArrowRight, Download, MapPin, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { BREAKDOWN_CATEGORIES, BREAKDOWN_COLORS, BREAKDOWN_LABELS, type BreakdownCategory } from '@sceneos/shared';
import { RunChecklist } from '@/components/run';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Btn, Empty, Glass, H2, Note, Pill, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { Production, ProductionOverview } from '@/lib/types';

/** "1 4/8" style page lengths. */
const pages = (eighths: number) => `${Math.floor(eighths / 8) || ''}${eighths % 8 ? ` ${eighths % 8}/8` : ''}`.trim() || '0';

export default function BreakdownPage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <Breakdown key={p._id} production={p} />}</WithProduction></>);
}

function Breakdown({ production: p }: { production: Production }) {
  const { data, mutate } = useApi<ProductionOverview>(`/production/${p._id}/overview`);
  const [runId, setRunId] = useState<string | null>(null);
  const [only, setOnly] = useState<BreakdownCategory | ''>('');
  const [all, setAll] = useState(false);
  const [error, setError] = useState('');
  const run = async (fn: () => Promise<{ _id: string }>) => { setError(''); try { setRunId((await fn())._id); await refresh('/credits'); } catch (e) { setError(errorText(e)); } };

  if (!data) return null;
  if (!data.story) return <Glass><Empty title="No script linked to this project">Import the script in Script Director and link the story to this project.<div className="mt-4"><Btn variant="primary" icon={ArrowRight} href="/write/intake">Go to Intake</Btn></div></Empty></Glass>;
  const scenes = data.scenes;
  const done = scenes.filter((s) => s.brokenDownAt).length;
  const totalEighths = scenes.reduce((n, s) => n + s.eighths, 0);
  const shown = (all ? scenes : scenes.slice(0, 40)).filter((s) => !only || s.elements.some((e) => e.category === only));
  const activeRun = runId ?? (data.breakdownRun && ['queued', 'running', 'failed'].includes(data.breakdownRun.status) ? data.breakdownRun._id : null);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{scenes.length} scenes, {data.locations.length} shoot locations, {pages(totalEighths)} pages.</h1>
          <p className="mt-1.5 text-base text-t2">{data.story.title} · scene by scene breakdown · industry colour codes</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Btn icon={Download} onClick={() => { window.location.href = `/api/production/${p._id}/breakdown.xlsx`; }}>Export breakdown sheets</Btn>
          <Btn variant="primary" icon={Sparkles} onClick={() => run(() => api.post(`/production/${p._id}/breakdown`, { redo: done === scenes.length }))}>{done === 0 ? 'Break down all scenes' : done < scenes.length ? `Break down ${scenes.length - done} more` : 'Break down again'}</Btn>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        <Pill on={!only} onClick={() => setOnly('')}>All</Pill>
        {BREAKDOWN_CATEGORIES.map((c) => <Pill key={c} on={only === c} onClick={() => setOnly(c)}><span aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full" style={{ background: BREAKDOWN_COLORS[c] }} />{BREAKDOWN_LABELS[c]}</Pill>)}
      </div>
      {error && <Note>{error}</Note>}
      {activeRun && <Glass><H2>Working on it</H2><RunChecklist runId={activeRun} onDone={() => void mutate()} /></Glass>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_640px]">
          {scenes.length === 0 ? <Empty title="No scenes yet">Import the script first.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[720px] border-collapse text-left">
                <thead><tr className="text-[13px] text-t3">{['Sc', 'Scene and location', 'Pages', 'Elements'].map((h) => <th key={h} scope="col" className="pb-3 pr-3.5 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {shown.map((s) => (
                    <tr key={s._id} className="align-top [&>td]:rule [&>td]:py-3 [&>td]:pr-3.5">
                      <td className="text-[15px] font-medium">{s.number}</td>
                      <td><div className="text-[14px] font-medium">{s.heading}</div><Small>{s.synopsis ?? data.locations.find((l) => l._id === s.locationId)?.name ?? ''}</Small></td>
                      <td className="whitespace-nowrap text-sm">{pages(s.eighths)}</td>
                      <td>
                        {s.elements.length === 0 ? <Small>{s.brokenDownAt ? 'Nothing listed' : 'Not broken down yet'}</Small> : (
                          <div className="flex flex-wrap gap-1.5">
                            {s.elements.filter((e) => !only || e.category === only).map((e, i) => (
                              <span key={i} className="inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[13px]" style={{ borderColor: `${BREAKDOWN_COLORS[e.category as BreakdownCategory] ?? '#888'}66`, background: `${BREAKDOWN_COLORS[e.category as BreakdownCategory] ?? '#888'}1f` }}>
                                <span aria-hidden className="h-1.5 w-1.5 rounded-full" style={{ background: BREAKDOWN_COLORS[e.category as BreakdownCategory] ?? '#888' }} />
                                {e.name}{e.qty ? ` ×${e.qty}` : ''}<span className="sr-only"> ({BREAKDOWN_LABELS[e.category as BreakdownCategory] ?? e.category})</span>
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
              {scenes.length > 40 && <div className="mt-3 flex items-center justify-between"><Small>Showing {shown.length} of {scenes.length} scenes</Small><Btn onClick={() => setAll(!all)}>{all ? 'Show fewer' : 'Show all scenes'}</Btn></div>}
            </div>
          )}
        </Glass>
        <Glass className="min-w-0 flex-[1_1_320px]">
          <H2>Locations needed</H2>
          <Small className="mt-1">{new Set(scenes.map((s) => s.location)).size} script locations{data.locations.length ? ` grouped into ${data.locations.length} real places` : ''}.</Small>
          <ul className="mt-2">
            {data.locations.slice(0, 8).map((l) => <li key={l._id} className="rule flex items-center justify-between gap-3 py-2.5"><div className="min-w-0"><div className="truncate text-[15px] font-medium">{l.name}</div><Small>{l.sceneNumbers.length ? `Sc ${l.sceneNumbers.slice(0, 6).join(', ')}${l.sceneNumbers.length > 6 ? ` +${l.sceneNumbers.length - 6}` : ''}` : l.address}</Small></div><span className="text-[13px] text-t3">{l.sceneNumbers.length} sc</span></li>)}
          </ul>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn icon={Sparkles} onClick={() => run(() => api.post(`/production/${p._id}/locations/group`))}>{data.locations.length ? 'Group again' : 'Group into real places'}</Btn>
            <Btn icon={MapPin} href="/produce/locations">Open location boards</Btn>
          </div>
          {data.locationsRun && ['queued', 'running', 'waiting'].includes(data.locationsRun.status) && !runId && <div className="mt-3"><RunChecklist runId={data.locationsRun._id} onDone={() => void mutate()} /></div>}
          <div className="mt-4"><Btn variant="primary" icon={ArrowRight} href="/produce/plan">Build the shoot plan</Btn></div>
        </Glass>
      </div>
    </>
  );
}
