'use client';

import { ArrowRight, Check, Lock, Send } from 'lucide-react';
import { useEffect, useState } from 'react';
import { STEP_STATUSES, label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Area, Bar, Btn, Chip, Empty, Glass, H2, Note, PageTitle, Row, Select, Small, Two } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day, tone } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Episode, Me, Production } from '@/lib/types';

export default function ChannelPage() {
  return (<><SectionTabs items={TABS.deliver} /><WithProduction>{(p, me) => <Channel key={p._id} production={p} me={me} />}</WithProduction></>);
}

function Channel({ production: p, me }: { production: Production; me: Me | undefined }) {
  const { data: episodes, mutate } = useApi<Episode[]>(`/productions/${p._id}/episodes`);
  const [number, setNumber] = useState<number | null>(null);
  const [reqs, setReqs] = useState(p.deliveryRequirements.join('\n'));
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);
  const open = episodes?.filter((e) => e.board.delivery !== 'done') ?? [];
  const delivered = episodes?.filter((e) => e.board.delivery === 'done').reverse() ?? [];
  const episode = episodes?.find((e) => e.number === number) ?? open[0];
  useEffect(() => setNote(episode?.deliveryNote ?? ''), [episode?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<unknown>, ok?: string) { setMsg(null); try { await fn(); await Promise.all([mutate(), refresh('/productions')]); if (ok) setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } }
  const patch = (body: Record<string, unknown>) => episode && run(() => api.patch(`/productions/${p._id}/episodes/${episode.number}`, body));
  const items = episode?.deliveryItems ?? [];
  const ready = items.filter((i) => i.status === 'done').length;
  const admin = me?.role === 'admin';

  return (
    <>
      <PageTitle title={`Delivery to ${p.channel || 'channel'}`} sub={`${delivered.length} episode${delivered.length === 1 ? '' : 's'} delivered, ${open.length} to go.`} />
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_520px]">
          {!episode ? <Empty title={episodes?.length ? 'Every episode is delivered' : 'No episodes set up'}>{episodes?.length ? 'Nothing is waiting to go to the channel.' : 'Set up episodes on the episode board first.'}</Empty> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div><h2 className="text-[22px] font-semibold tracking-[-0.01em]">Episode {episode.number} package</h2><Small>{episode.airDate ? `Airs ${day(episode.airDate)}` : 'No air date set'}</Small></div>
                {episode.board.delivery === 'done' ? <Chip tone="ok">Delivered {day(episode.deliveredAt)}</Chip> : <Chip tone={ready === items.length && items.length ? 'ok' : 'warn'}>{ready} of {items.length} ready</Chip>}
              </div>
              <Bar value={items.length ? (ready / items.length) * 100 : 0} tone={ready === items.length ? 'ok' : 'warn'} className="mb-1.5 mt-3.5 h-2" />
              {items.length === 0 && <Small className="mt-3">This episode has no checklist. Add the channel’s requirements on the right, then use “Apply to open episodes”.</Small>}
              {items.map((item, i) => (
                <Row key={item.label} left={<span className="text-[15px] font-medium">{item.label}</span>} right={
                  <select aria-label={`Status of ${item.label}`} value={item.status} disabled={episode.board.delivery === 'done'} onChange={(e) => patch({ deliveryItems: items.map((x, j) => (j === i ? { ...x, status: e.target.value } : x)) })} className="field min-h-[44px] w-[150px]">{STEP_STATUSES.map((s) => <option key={s} value={s}>{label(s)}</option>)}</select>} />
              ))}
              <div className="mt-4"><Area label="Delivery note for the channel" rows={2} value={note} onChange={(e) => setNote(e.target.value)} onBlur={() => note !== (episode.deliveryNote ?? '') && patch({ deliveryNote: note })} /></div>
              {episode.board.delivery !== 'done' && (
                <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
                  <span className="inline-flex items-center gap-2 text-sm text-t2"><Lock size={14} aria-hidden />You can mark it delivered when every item is done.</span>
                  <Btn variant="primary" icon={Send} disabled={!items.length || ready !== items.length} onClick={() => run(() => api.post(`/productions/${p._id}/episodes/${episode.number}/deliver`), `Episode ${episode.number} marked delivered.`)}>Mark episode {episode.number} delivered</Btn>
                </div>
              )}
            </>
          )}
        </Glass>

        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Glass className="p-[22px]">
            <H2>Next to deliver</H2>
            {open.length === 0 && <Small className="mt-2">Nothing open.</Small>}
            <div className="mt-2">{open.slice(0, 5).map((e) => <Row key={e._id} left={<button type="button" className="text-left" onClick={() => setNumber(e.number)}><Two a={`Episode ${e.number}`} b={e.airDate ? `Airs ${day(e.airDate)}` : 'No air date'} /></button>} right={<Chip tone={tone(e.board.qc)}>QC {label(e.board.qc).toLowerCase()}</Chip>} />)}</div>
            <div className="mt-3"><Btn href="/deliver/board" icon={ArrowRight}>Open episode board</Btn></div>
          </Glass>
          <Glass className="p-[22px]">
            <H2>Delivered</H2>
            {delivered.length === 0 && <Small className="mt-2">Nothing delivered yet.</Small>}
            <div className="mt-2">{delivered.slice(0, 6).map((e) => <Row key={e._id} left={<Two a={`Episode ${e.number}`} b={e.deliveredAt ? `Delivered ${day(e.deliveredAt)}` : e.airDate ? `Airs ${day(e.airDate)}` : undefined} />} right={<Chip tone="ok">Done</Chip>} />)}</div>
          </Glass>
        </div>

        <Glass className="min-w-0 flex-[1_1_300px] p-[22px]">
          <H2>What {p.channel || 'the channel'} needs</H2><Small className="mb-3 mt-1">One requirement per line. Used as the checklist for every episode.</Small>
          <Area label="Requirements" rows={8} value={reqs} onChange={(e) => setReqs(e.target.value)} disabled={!admin} />
          <div className="mt-3 flex flex-col gap-2">
            <Btn icon={Check} disabled={!admin} onClick={() => run(() => api.patch(`/productions/${p._id}`, { deliveryRequirements: reqs.split('\n').map((s) => s.trim()).filter(Boolean) }), 'Requirements saved.')}>Save requirements</Btn>
            <Btn disabled={!admin || open.length === 0} onClick={() => run(async () => {
              const labels = reqs.split('\n').map((s) => s.trim()).filter(Boolean);
              for (const e of open) await api.patch(`/productions/${p._id}/episodes/${e.number}`, { deliveryItems: labels.map((l) => e.deliveryItems.find((x) => x.label === l) ?? { label: l, status: 'pending' }) });
            }, 'Checklist applied to open episodes. Progress on matching items was kept.')}>Apply to open episodes</Btn>
          </div>
          <div className="mt-2.5 flex items-center gap-1.5 text-[13px] text-t3"><Lock size={13} aria-hidden />Only admins can change a channel’s requirements.</div>
        </Glass>
      </div>
    </>
  );
}
