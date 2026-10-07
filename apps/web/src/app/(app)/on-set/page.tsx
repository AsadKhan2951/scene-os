'use client';

import { Check, Clock, Plus } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Bar, Btn, Chip, Empty, Glass, Note, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day, isoDay } from '@/lib/format';
import type { CallSheet, Episode, Production } from '@/lib/types';

/** A phone-sized view for the unit on the floor: today's sheet, quick scene recording, tomorrow's call. */
export default function OnSetPage() {
  return (<><SectionTabs items={[{ label: 'On set', href: '/on-set' }]} /><WithProduction>{(p) => <OnSet key={p._id} production={p} />}</WithProduction></>);
}

function OnSet({ production: p }: { production: Production }) {
  const { data: episodes, mutate } = useApi<Episode[]>(`/productions/${p._id}/episodes`);
  const { data: sheets } = useApi<CallSheet[]>(`/call-sheets?productionId=${p._id}`);
  const [error, setError] = useState('');
  const today = isoDay(new Date());
  const todaySheet = sheets?.find((s) => isoDay(s.shootDate) === today);
  const nextSheet = sheets?.filter((s) => isoDay(s.shootDate) > today).sort((a, b) => a.shootDate.localeCompare(b.shootDate))[0];
  const shooting = episodes?.filter((e) => e.totalScenes > 0 && e.recordedScenes < e.totalScenes).slice(0, 3) ?? [];
  const record = async (e: Episode) => { setError(''); try { await api.patch(`/productions/${p._id}/episodes/${e.number}`, { recordedScenes: e.recordedScenes + 1 }); await mutate(); } catch (err) { setError(errorText(err)); } };

  return (
    <div className="mx-auto flex w-full max-w-[420px] flex-col gap-4">
      <div><h1 className="text-[28px] font-semibold leading-tight tracking-[-0.02em]">{todaySheet ? `${todaySheet.shootDay ? `Day ${todaySheet.shootDay}, ` : ''}${todaySheet.location || 'location not set'}` : 'No shoot today'}</h1><p className="mt-1.5 text-[15px] text-t2">{p.title}{todaySheet?.generalCall ? `. General call ${todaySheet.generalCall}` : ''}</p></div>
      {error && <Note>{error}</Note>}
      {shooting.length === 0 ? <Glass><Empty title="No open episodes">Every episode with scenes is fully recorded, or scene counts are not set.</Empty></Glass> : shooting.map((e) => (
        <Glass key={e._id} className="flex flex-col gap-3 rounded-[22px] p-4">
          <div className="flex items-center justify-between gap-2"><div><div className="text-base font-semibold">Episode {e.number}</div><Small>{e.recordedScenes} of {e.totalScenes} scenes recorded</Small></div><Chip tone="warn">Shooting</Chip></div>
          <Bar value={(e.recordedScenes / e.totalScenes) * 100} tone="ok" className="h-2" />
          <Btn variant="primary" icon={Check} className="min-h-[48px] w-full" onClick={() => record(e)}>Record one more scene</Btn>
        </Glass>
      ))}
      <div className="grid grid-cols-2 gap-2.5">
        <Link href="/money/daily" className="sub flex min-h-[96px] flex-col rounded-[18px] p-3.5"><Plus size={20} className="mb-2 text-violet" aria-hidden /><span className="text-[15px] font-semibold">Log an expense</span><Small>Today’s expense sheet</Small></Link>
        <Link href="/produce/schedule" className="sub flex min-h-[96px] flex-col rounded-[18px] p-3.5"><Clock size={20} className="mb-2 text-violet" aria-hidden /><span className="text-[15px] font-semibold">{nextSheet ? `${day(nextSheet.shootDate)}, ${nextSheet.generalCall || 'call not set'}` : 'No next call sheet'}</span><Small>{nextSheet ? `${nextSheet.location || 'Location not set'}, ${nextSheet.status}` : 'Create one in Schedule'}</Small></Link>
      </div>
      <Btn href="/dreamer" className="w-full">Ask Dreamer about today</Btn>
    </div>
  );
}
