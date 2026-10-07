'use client';

import clsx from 'clsx';
import { AlertTriangle, Plus, Send, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { CALL_ENTRY_TYPES, label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Row, Select, Small, Two } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day, isoDay, tone } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { CallSheet, Person, Production } from '@/lib/types';

export default function SchedulePage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <Schedule key={p._id} production={p} />}</WithProduction></>);
}

function Schedule({ production: p }: { production: Production }) {
  const { data: sheets, mutate } = useApi<CallSheet[]>(`/call-sheets?productionId=${p._id}`);
  const { data: people } = useApi<Person[]>(`/people?productionId=${p._id}`);
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const sorted = [...(sheets ?? [])].sort((a, b) => a.shootDate.localeCompare(b.shootDate));
  const today = isoDay(new Date());
  const sheet = sorted.find((s) => s._id === id) ?? sorted.find((s) => isoDay(s.shootDate) >= today) ?? sorted[sorted.length - 1];

  async function run(fn: () => Promise<unknown>) { setError(''); try { await fn(); await mutate(); } catch (e) { setError(errorText(e)); } }
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    await run(async () => {
      const s = await api.post<CallSheet>('/call-sheets', { productionId: p._id, shootDate: f.get('shootDate'), shootDay: Number(f.get('shootDay')) || undefined, location: f.get('location') || undefined, generalCall: f.get('generalCall') || undefined, director: p.director || undefined });
      setId(s._id); form.reset();
    });
  }
  const patch = (body: Partial<CallSheet>) => sheet && run(() => api.patch(`/call-sheets/${sheet._id}`, body));
  function addEntry(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!sheet) return;
    const form = e.currentTarget; const f = new FormData(form);
    patch({ entries: [...sheet.entries, { type: String(f.get('type')), name: String(f.get('name')), role: String(f.get('role') || ''), callTime: String(f.get('callTime') || ''), notes: String(f.get('notes') || ''), order: sheet.entries.length }] });
    form.reset();
  }
  // People on the sheet who are marked unavailable in Cast and crew.
  const clashes = sheet?.entries.filter((en) => people?.some((pp) => pp.name === en.name && pp.availability === 'unavailable')) ?? [];

  return (
    <>
      <PageTitle title="Schedule and call sheets" sub={sorted.length ? `${sorted.length} call sheet${sorted.length === 1 ? '' : 's'} for ${p.title}.` : undefined} />
      {sorted.length > 0 && (
        <div className="grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
          {sorted.slice(-14).map((s) => (
            <button key={s._id} type="button" aria-pressed={sheet?._id === s._id} onClick={() => setId(s._id)} className={clsx('flex min-h-[130px] flex-col items-start rounded-[20px] border p-3.5 text-left', sheet?._id === s._id ? 'border-violet/60 bg-violet/20' : 'sub')}>
              <span className="flex w-full justify-between text-[13px] text-t2"><span>{day(s.shootDate)}{isoDay(s.shootDate) === today ? ', today' : ''}</span><span>{s.shootDay ? `Day ${s.shootDay}` : ''}</span></span>
              <span className="mt-2.5 text-[15px] font-medium">{s.location || 'Location not set'}</span><Small className="mb-2.5">Call {s.generalCall || 'not set'}</Small>
              <span className="mt-auto"><Chip tone={tone(s.status)}>{s.status === 'draft' ? 'Draft call sheet' : 'Published'}</Chip></span>
            </button>
          ))}
        </div>
      )}
      {error && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_620px]">
          {!sheet ? <Empty title="No call sheets yet">Create the first one with the form on the right.</Empty> : (
            <>
              <div className="flex flex-wrap items-center gap-3"><H2 className="text-[22px]">Call sheet, {day(sheet.shootDate)}</H2><Chip tone={tone(sheet.status)}>{label(sheet.status)}</Chip></div>
              <div className="my-[18px] flex flex-wrap gap-x-9 gap-y-3.5">{[['Shoot day', sheet.shootDay ?? 'Not set'], ['Location', sheet.location || 'Not set'], ['General call', sheet.generalCall || 'Not set'], ['Director', sheet.director || 'Not set'], ['Line producer', sheet.lineProducer || 'Not set']].map(([a, b]) => <div key={String(a)}><Small>{a}</Small><div className="mt-0.5 text-[15px] font-medium">{b}</div></div>)}</div>
              {clashes.length > 0 && (
                <div role="alert" className="mb-4 flex items-start gap-2.5 rounded-[18px] border border-warn/35 bg-warn/[0.08] px-4 py-3.5 text-warn"><AlertTriangle size={18} aria-hidden className="mt-0.5 shrink-0" /><div><div className="text-[15px] font-semibold">{clashes.length} availability clash{clashes.length === 1 ? '' : 'es'} to fix before publishing</div><div className="mt-0.5 text-sm text-t2">{clashes.map((c) => c.name).join(', ')} {clashes.length === 1 ? 'is' : 'are'} marked unavailable in Cast and crew.</div></div></div>
              )}
              {sheet.entries.length === 0 ? <Small>No one is on this sheet yet. Add cast, crew and scenes below.</Small> : (
                <div className="overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left">
                    <thead><tr className="text-[13px] text-t3">{['Type', 'Who or what', 'Role', 'Call', 'Notes', ''].map((h) => <th key={h} scope="col" className="pb-2.5 pr-3.5 font-medium">{h}</th>)}</tr></thead>
                    <tbody>
                      {sheet.entries.map((en, i) => (
                        <tr key={i} className="[&>td]:rule [&>td]:py-2 [&>td]:pr-3.5">
                          <td className="text-[13px] text-t3">{label(en.type)}</td><td className="text-[15px] font-medium">{en.name}</td><td className="text-sm text-t2">{en.role}</td><td className="whitespace-nowrap text-[15px]">{en.callTime}</td><td className="text-sm text-t2">{en.notes}</td>
                          <td className="text-right"><IconBtn label={`Remove ${en.name}`} icon={Trash2} onClick={() => patch({ entries: sheet.entries.filter((_, j) => j !== i) })} /></td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
              <form onSubmit={addEntry} className="mt-4 grid items-end gap-2.5 border-t border-white/10 pt-4 [grid-template-columns:repeat(auto-fit,minmax(140px,1fr))]">
                <Select label="Type" name="type" options={CALL_ENTRY_TYPES} /><Input label="Name or scenes" name="name" required list="people" /><Input label="Role" name="role" /><Input label="Call time" name="callTime" placeholder="6:30 am" /><Input label="Notes" name="notes" />
                <Btn icon={Plus} type="submit">Add to sheet</Btn>
                <datalist id="people">{people?.map((pp) => <option key={pp._id} value={pp.name} />)}</datalist>
              </form>
              <div className="mt-[18px] flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-[18px]">
                <Small className="text-t2">{sheet.status === 'published' ? 'This sheet is published.' : 'Publishing marks the sheet final for the unit.'}</Small>
                <div className="flex gap-2.5">
                  <Btn variant="danger" onClick={() => run(async () => { await api.del(`/call-sheets/${sheet._id}`); setId(null); })}>Delete sheet</Btn>
                  {sheet.status === 'draft' && <Btn variant="primary" icon={Send} disabled={clashes.length > 0 || sheet.entries.length === 0} onClick={() => run(() => api.post(`/call-sheets/${sheet._id}/publish`))}>Publish call sheet</Btn>}
                </div>
              </div>
            </>
          )}
        </Glass>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Glass className="p-[22px]">
            <H2>New call sheet</H2>
            <form onSubmit={create} className="mt-3.5 flex flex-col gap-3">
              <div className="grid grid-cols-2 gap-3"><Input label="Shoot date" name="shootDate" type="date" required /><Input label="Shoot day number" name="shootDay" type="number" min={1} /></div>
              <Input label="Location" name="location" /><Input label="General call" name="generalCall" placeholder="6:30 am" />
              <Btn variant="primary" icon={Plus} type="submit" className="w-full">Create draft call sheet</Btn>
            </form>
          </Glass>
          <Glass className="p-[22px]">
            <div className="mb-1.5 flex items-center justify-between"><H2>People</H2><Btn variant="text" href="/produce/people" className="px-2.5">All cast and crew</Btn></div>
            {people?.length === 0 && <Small>No one added yet.</Small>}
            {people?.slice(0, 6).map((pp) => <Row key={pp._id} left={<Two a={pp.name} b={pp.role} />} right={<Chip tone={tone(pp.availability)}>{label(pp.availability)}</Chip>} />)}
          </Glass>
        </div>
      </div>
    </>
  );
}
