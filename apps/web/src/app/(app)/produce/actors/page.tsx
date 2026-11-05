'use client';

import { Plus, Sparkles, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Async, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Select, Small, type Tone } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Actor, Production } from '@/lib/types';

const ROLE_TYPES = ['lead', 'supporting', 'antagonist', 'minor', 'extra'] as const;
const KIND_TONE: Record<string, Tone> = { booked: 'risk', hold: 'warn', unavailable: 'idle' };

export default function ActorsPage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <Actors key={p._id} production={p} />}</WithProduction></>);
}

function Actors({ production: p }: { production: Production }) {
  const { data, error: loadError, mutate } = useApi<Actor[]>(`/actors?productionId=${p._id}`);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  async function run(fn: () => Promise<unknown>) {
    setError(''); setBusy(true);
    try { await fn(); await mutate(); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    await run(async () => {
      await api.post('/actors', { productionId: p._id, name: f.name, character: f.character || undefined, roleType: f.roleType, agent: f.agent || undefined, phone: f.phone || undefined });
      form.reset();
    });
  }
  const samples = data?.filter((a) => a.source === 'ai_sample').length ?? 0;

  return (
    <>
      <PageTitle title="Actor database" sub="Who can play which part, and when they are booked or on hold. The shoot plan checks these dates.">
        <Btn variant="primary" icon={Sparkles} disabled={busy} onClick={() => run(() => api.post('/actors/generate', { productionId: p._id, count: 8 }))}>{busy ? 'Working…' : 'Fill with AI sample actors'}</Btn>
        {samples > 0 && <Btn icon={Trash2} disabled={busy} onClick={() => run(() => api.del(`/actors/samples?productionId=${p._id}`))}>Remove {samples} sample{samples === 1 ? '' : 's'}</Btn>}
      </PageTitle>
      {samples > 0 && <Note tone="warn">{samples} actor{samples === 1 ? ' is a' : 's are'} AI-made sample data for testing. They are not real people; replace them with your real cast.</Note>}
      {error && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_640px]">
          <H2>Actors</H2>
          <Async data={data} error={loadError} what="Loading actors">
            {(list) => list.length === 0 ? <Empty title="No actors yet">Add your cast with the form, or fill the list with AI sample actors to test scheduling.</Empty> : (
              <div className="mt-3 overflow-x-auto">
                <table className="w-full min-w-[680px] border-collapse text-left">
                  <thead><tr className="text-[13px] text-t3">{['Actor', 'Part', 'Day rate', 'Dates', ''].map((h) => <th key={h} scope="col" className="pb-2.5 pr-3.5 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {list.map((a) => (
                      <tr key={a._id} className="align-top [&>td]:rule [&>td]:py-3 [&>td]:pr-3.5">
                        <td>
                          <div className="flex flex-wrap items-center gap-2"><span className="text-[15px] font-medium">{a.name}</span>{a.source === 'ai_sample' && <Chip tone="ai">Sample</Chip>}</div>
                          <Small>{[a.agent, a.phone].filter(Boolean).join(' · ') || 'No contact yet'}</Small>
                        </td>
                        <td><div className="text-sm">{a.character ?? '—'}</div><Small>{label(a.roleType)}</Small></td>
                        <td className="whitespace-nowrap text-sm">{a.dayRate ? `${a.currency ?? ''} ${a.dayRate.toLocaleString('en-US')}`.trim() : '—'}</td>
                        <td>
                          {a.availability.length === 0 ? <Small>Free</Small> : (
                            <ul className="flex flex-col gap-1.5">
                              {a.availability.map((b, i) => (
                                <li key={i} className="flex flex-wrap items-center gap-2 text-sm"><Chip tone={KIND_TONE[b.kind]}>{label(b.kind)}</Chip><span>{day(b.start)} to {day(b.end)}</span>{b.note && <Small>{b.note}</Small>}</li>
                              ))}
                            </ul>
                          )}
                        </td>
                        <td><IconBtn label={`Delete ${a.name}`} icon={Trash2} disabled={busy} onClick={() => run(() => api.del(`/actors/${a._id}`))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Glass>
        <Glass className="min-w-0 flex-[1_1_320px] p-[22px]">
          <H2>Add an actor</H2>
          <form onSubmit={add} className="mt-3.5 flex flex-col gap-3">
            <Input label="Name" name="name" required />
            <Input label="Part they play" name="character" />
            <Select label="Role" name="roleType" options={ROLE_TYPES} defaultValue="supporting" />
            <div className="grid grid-cols-2 gap-3"><Input label="Agent" name="agent" /><Input label="Phone" name="phone" /></div>
            <Btn variant="primary" icon={Plus} type="submit" disabled={busy} className="w-full">Add actor</Btn>
          </form>
        </Glass>
      </div>
    </>
  );
}
