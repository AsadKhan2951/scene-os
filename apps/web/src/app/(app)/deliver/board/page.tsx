'use client';

import { Download } from 'lucide-react';
import { useState } from 'react';
import { BOARD_STEPS, BOARD_STEP_LABELS, STEP_STATUSES, label, type BoardStep } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Async, Btn, Empty, Glass, H2, Note, PageTitle, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day, isoDay } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Episode, Production } from '@/lib/types';

export default function BoardPage() {
  return (<><SectionTabs items={TABS.deliver} /><WithProduction>{(p) => <Board key={p._id} production={p} />}</WithProduction></>);
}
const STEP_CLASS: Record<string, string> = { done: 'text-ok', in_progress: 'text-warn', pending: 'text-t3' };

function Board({ production: p }: { production: Production }) {
  const { data, error: loadError, mutate } = useApi<Episode[]>(`/productions/${p._id}/episodes`);
  const [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>) { setError(''); try { await fn(); await mutate(); } catch (e) { setError(errorText(e)); } }
  const patch = (e: Episode, body: Record<string, unknown>) => run(() => api.patch(`/productions/${p._id}/episodes/${e.number}`, body));
  const next = data?.filter((e) => e.airDate && e.board.delivery !== 'done' && isoDay(e.airDate) >= isoDay(new Date())).sort((a, b) => a.airDate!.localeCompare(b.airDate!))[0];
  const stuck = next && BOARD_STEPS.find((s) => next.board[s] !== 'done');

  return (
    <>
      <PageTitle title={next ? `Episode ${next.number} airs ${day(next.airDate)}.` : 'Episode status board'} sub={next && stuck ? `It is still at ${BOARD_STEP_LABELS[stuck].toLowerCase()}.` : `${p.title}, script to delivery.`}>
        {data && data.length < p.totalEpisodes && <Btn variant="primary" onClick={() => run(() => api.post(`/productions/${p._id}/episodes/init`, {}))}>Set up all {p.totalEpisodes} episodes</Btn>}
        <a href="/api/exports/episodes" className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.07] px-[18px] text-sm font-medium"><Download size={16} aria-hidden />Export episode tracker</a>
      </PageTitle>
      {error && <Note>{error}</Note>}
      <Glass>
        <H2>Episode board</H2><Small className="mb-4">Change any step and it saves straight away.</Small>
        <Async data={data} error={loadError}>
          {(rows) => rows.length === 0 ? <Empty title="No episodes set up">Set up the episode rows to start tracking post-production.</Empty> : (
            <div className="overflow-x-auto">
              <table className="w-full min-w-[1120px] border-collapse text-left">
                <thead><tr className="text-[13px] text-t3"><th scope="col" className="pb-2.5 pr-2.5 font-medium">Episode</th>{BOARD_STEPS.map((s) => <th key={s} scope="col" className="pb-2.5 pr-2.5 font-medium">{BOARD_STEP_LABELS[s]}</th>)}<th scope="col" className="pb-2.5 font-medium">Air date</th></tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e._id} className={`[&>td]:rule [&>td]:py-2 [&>td]:pr-2.5 ${next?._id === e._id ? 'bg-violet/10' : ''}`}>
                      <td className="whitespace-nowrap pl-2 text-[15px] font-semibold">Episode {e.number}</td>
                      {BOARD_STEPS.map((s: BoardStep) => (
                        <td key={s}><select aria-label={`${BOARD_STEP_LABELS[s]}, episode ${e.number}`} value={e.board[s]} onChange={(ev) => patch(e, { board: { [s]: ev.target.value } })} className={`field min-h-[44px] w-[124px] px-2.5 text-[13px] font-medium ${STEP_CLASS[e.board[s]]}`}>{STEP_STATUSES.map((st) => <option key={st} value={st}>{label(st)}</option>)}</select></td>
                      ))}
                      <td><input aria-label={`Air date, episode ${e.number}`} type="date" value={e.airDate ? isoDay(e.airDate) : ''} onChange={(ev) => patch(e, { airDate: ev.target.value || null })} className="field min-h-[44px] w-[150px] px-2.5 text-[13px]" /></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Glass>
    </>
  );
}
