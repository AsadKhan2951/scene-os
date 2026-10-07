'use client';

import clsx from 'clsx';
import { Plus, Send, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';
import { EXPENSE_CATEGORIES, label } from '@sceneos/shared';
import { SectionTabs, WithProduction, useApp } from '@/components/shell';
import { Area, Btn, Chip, Glass, H2, IconBtn, Input, Note, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day, isoDay, num, pkr, tone } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { ExpenseSheet, Production } from '@/lib/types';

interface Line { category: string; note: string; requested: string }
const blank = (): Line => ({ category: EXPENSE_CATEGORIES[0], note: '', requested: '' });
const STATUS_LABEL: Record<string, string> = { draft: 'Draft', submitted: 'Submitted', approved: 'Approved', rejected: 'Rejected' };

export default function DailyPage() {
  return (<><SectionTabs items={TABS.money} /><WithProduction>{(p) => <Daily key={p._id} production={p} />}</WithProduction></>);
}

function Daily({ production: p }: { production: Production }) {
  const { me } = useApp();
  const { data: sheets, mutate } = useApi<ExpenseSheet[]>(`/expenses?productionId=${p._id}`);
  const [id, setId] = useState<string | 'new'>('new');
  const sheet = id === 'new' ? undefined : sheets?.find((s) => s._id === id);
  const [head, setHead] = useState({ shootDate: isoDay(new Date()), shootDay: '', lineProducer: '', notes: '' });
  const [lines, setLines] = useState<Line[]>([blank()]);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (sheet) {
      setHead({ shootDate: isoDay(sheet.shootDate), shootDay: String(sheet.shootDay ?? ''), lineProducer: sheet.lineProducer ?? '', notes: sheet.notes ?? '' });
      setLines(sheet.items.map((i) => ({ category: i.category, note: i.note ?? '', requested: String(i.requested) })));
    } else { setHead({ shootDate: isoDay(new Date()), shootDay: '', lineProducer: me?.name ?? '', notes: '' }); setLines([blank()]); }
  }, [sheet?._id, id]); // eslint-disable-line react-hooks/exhaustive-deps

  const editable = !sheet || sheet.status === 'draft';
  const total = lines.reduce((a, l) => a + (Number(l.requested) || 0), 0);
  const sentBack = sheet?.status === 'draft' ? [...sheet.comments].reverse().find((c) => c.action === 'sent back') : undefined;
  const setLine = (i: number, patch: Partial<Line>) => setLines(lines.map((l, j) => (j === i ? { ...l, ...patch } : l)));

  async function save(submit: boolean) {
    setBusy(true); setMsg(null);
    try {
      const body = { shootDate: head.shootDate, shootDay: Number(head.shootDay) || undefined, lineProducer: head.lineProducer || undefined, notes: head.notes || undefined,
        items: lines.filter((l) => l.requested !== '').map((l) => ({ category: l.category, note: l.note || undefined, requested: Number(l.requested) })) };
      const saved = sheet ? await api.put<ExpenseSheet>(`/expenses/${sheet._id}`, body) : await api.post<ExpenseSheet>('/expenses', { ...body, productionId: p._id });
      if (submit) await api.post(`/expenses/${saved._id}/submit`);
      setId(saved._id);
      setMsg({ tone: 'ok', text: submit ? 'Submitted for approval. The sheet is locked while it is reviewed.' : 'Draft saved.' });
      await Promise.all([mutate(), refresh('/insights')]);
    } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } finally { setBusy(false); }
  }

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[1_1_280px] p-5">
        <Btn variant="primary" icon={Plus} className="w-full" onClick={() => { setId('new'); setMsg(null); }}>New expense sheet</Btn>
        <Small className="mb-2 ml-1 mt-[18px]">Sheets for {p.title}</Small>
        {sheets?.length === 0 && <Small className="ml-1">No sheets yet.</Small>}
        <div className="flex flex-col gap-2">
          {sheets?.map((s) => (
            <button key={s._id} type="button" aria-pressed={id === s._id} onClick={() => { setId(s._id); setMsg(null); }} className={clsx('min-h-[44px] w-full rounded-2xl border px-3.5 py-3 text-left', id === s._id ? 'border-violet/55 bg-violet/20' : 'sub')}>
              <span className="flex justify-between gap-2 text-[15px] font-medium"><span>{s.shootDay ? `Day ${s.shootDay}` : day(s.shootDate)}</span><span>{num(s.items.reduce((a, i) => a + i.requested, 0))}</span></span>
              <span className="mt-1.5 flex items-center justify-between gap-2"><Small>{day(s.shootDate)}</Small><Chip tone={tone(s.status)}>{STATUS_LABEL[s.status]}</Chip></span>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="min-w-0 flex-[999_1_560px]">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><h1 className="text-[26px] font-semibold tracking-[-0.02em]">{sheet ? `${sheet.shootDay ? `Day ${sheet.shootDay}` : day(sheet.shootDate)} expenses` : 'New expense sheet'}</h1>{sheet && <Chip tone={tone(sheet.status)}>{sentBack ? 'Sent back for revision' : STATUS_LABEL[sheet.status]}</Chip>}</div>
        {sentBack && <div className="mb-[18px] rounded-[18px] border border-red-400/35 bg-red-400/[0.08] px-4 py-3.5"><div className="text-sm font-semibold">{sentBack.by} sent this back on {day(sentBack.at)}</div><div className="mt-1 text-[15px] text-t2">{sentBack.text}</div></div>}
        <fieldset disabled={!editable} className="min-w-0">
          <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(180px,1fr))]">
            <Input label="Shoot date" type="date" required value={head.shootDate} onChange={(e) => setHead({ ...head, shootDate: e.target.value })} />
            <Input label="Shoot day number" type="number" min={1} value={head.shootDay} onChange={(e) => setHead({ ...head, shootDay: e.target.value })} />
            <Input label="Line producer" value={head.lineProducer} onChange={(e) => setHead({ ...head, lineProducer: e.target.value })} />
          </div>
          <div className="mb-2 mt-6 flex items-center justify-between"><H2>Line items</H2>{editable && <Btn icon={Plus} onClick={() => setLines([...lines, blank()])}>Add a line</Btn>}</div>
          <div className="overflow-x-auto">
            <div className="min-w-[620px]">
              {lines.map((l, i) => (
                <div key={i} className="grid items-center gap-2.5 py-1.5 [grid-template-columns:1.3fr_2fr_150px_44px]">
                  <select aria-label={`Category, line ${i + 1}`} value={l.category} onChange={(e) => setLine(i, { category: e.target.value })} className="field">{EXPENSE_CATEGORIES.map((c) => <option key={c} value={c}>{label(c)}</option>)}</select>
                  <input aria-label={`Note, line ${i + 1}`} value={l.note} onChange={(e) => setLine(i, { note: e.target.value })} placeholder="Note" className="field" />
                  <input aria-label={`Requested amount in PKR, line ${i + 1}`} type="number" min={0} value={l.requested} onChange={(e) => setLine(i, { requested: e.target.value })} placeholder="0" className="field text-right" />
                  {editable && lines.length > 1 ? <IconBtn label={`Remove line ${i + 1}`} icon={Trash2} onClick={() => setLines(lines.filter((_, j) => j !== i))} /> : <span />}
                </div>
              ))}
              <div className="mt-2 flex items-center justify-between border-t border-white/10 pt-3.5"><span className="text-base font-semibold">Total requested</span><span className="pr-14 text-lg font-semibold">{pkr(total)}</span></div>
            </div>
          </div>
          <div className="mt-[18px]"><Area label="Notes for the approver" rows={2} value={head.notes} onChange={(e) => setHead({ ...head, notes: e.target.value })} placeholder="Anything unusual about the day" /></div>
        </fieldset>
        {msg && <div className="mt-4"><Note tone={msg.tone}>{msg.text}</Note></div>}
        {editable
          ? <div className="mt-[18px] flex flex-wrap justify-end gap-2.5"><Btn disabled={busy || total === 0} onClick={() => save(false)}>Save draft</Btn><Btn variant="primary" icon={Send} disabled={busy || total === 0} onClick={() => save(true)}>Submit for approval</Btn></div>
          : <Small className="mt-4">This sheet is {STATUS_LABEL[sheet!.status].toLowerCase()} and can no longer be edited.</Small>}
      </Glass>

      <Glass className="min-w-0 flex-[1_1_280px] p-[22px]">
        <H2>What happens next</H2>
        <ol className="mt-2">
          {[['You submit', 'The sheet locks while it is reviewed.'], ['An approver reviews each line', 'They can change the approved amount per line.'], ['Approved, rejected or sent back', 'A sheet that is sent back returns here as a draft with the comment.']].map(([a, b], i) => (
            <li key={a} className="flex gap-3 py-2.5"><span className="inline-flex h-[26px] w-[26px] shrink-0 items-center justify-center rounded-full bg-white/[0.08] text-[13px]">{i + 1}</span><div><div className="text-[15px] font-medium">{a}</div><Small>{b}</Small></div></li>
          ))}
        </ol>
      </Glass>
    </div>
  );
}
