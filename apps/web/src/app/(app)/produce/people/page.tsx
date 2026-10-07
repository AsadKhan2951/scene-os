'use client';

import { Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { AVAILABILITY, CONTRACT_STATUSES, DEPARTMENTS, label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Area, Async, Btn, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Pill, Select, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { Person, Production } from '@/lib/types';

export default function PeoplePage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <People key={p._id} production={p} />}</WithProduction></>);
}

function People({ production: p }: { production: Production }) {
  const { data, error: loadError, mutate } = useApi<Person[]>(`/people?productionId=${p._id}`);
  const [dept, setDept] = useState('');
  const [search, setSearch] = useState('');
  const [error, setError] = useState('');
  async function run(fn: () => Promise<unknown>) { setError(''); try { await fn(); await mutate(); } catch (e) { setError(errorText(e)); } }
  async function add(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = Object.fromEntries(new FormData(form));
    await run(async () => { await api.post('/people', { ...f, productionId: p._id, phone: f.phone || undefined, notes: f.notes || undefined }); form.reset(); });
  }
  const q = search.trim().toLowerCase();
  const rows = data?.filter((x) => (!dept || x.department === dept) && (!q || x.name.toLowerCase().includes(q) || x.role.toLowerCase().includes(q)));
  const unsigned = data?.filter((x) => x.contractStatus !== 'signed').length ?? 0;

  return (
    <>
      <PageTitle title="Cast and crew" sub={data ? `${data.length} ${data.length === 1 ? 'person' : 'people'} on this production.${unsigned ? ` ${unsigned} contract${unsigned === 1 ? ' is' : 's are'} not signed.` : ''}` : undefined} />
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[220px] flex-[1_1_240px] sm:max-w-[380px]"><Input label="Search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Name or role" /></div>
        <div className="flex flex-wrap gap-1.5"><Pill on={!dept} onClick={() => setDept('')}>All</Pill>{DEPARTMENTS.filter((d) => data?.some((x) => x.department === d)).map((d) => <Pill key={d} on={dept === d} onClick={() => setDept(d)}>{label(d)} {data?.filter((x) => x.department === d).length}</Pill>)}</div>
      </div>
      {error && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_640px]">
          <Async data={rows} error={loadError}>
            {(list) => list.length === 0 ? <Empty title="No one here yet">Add cast and crew with the form on the right.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[820px] border-collapse text-left">
                  <thead><tr className="text-[13px] text-t3">{['Name and role', 'Department', 'Availability', 'Contract', 'Notes', ''].map((h) => <th key={h} scope="col" className="pb-2.5 pr-3.5 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {list.map((x) => (
                      <tr key={x._id} className="[&>td]:rule [&>td]:py-2.5 [&>td]:pr-3.5">
                        <td><div className="text-[15px] font-medium">{x.name}</div><Small>{x.role}{x.phone ? `, ${x.phone}` : ''}</Small></td>
                        <td className="text-sm text-t2">{label(x.department)}</td>
                        <td><InlineSelect name={`Availability for ${x.name}`} value={x.availability} options={AVAILABILITY} onChange={(v) => run(() => api.patch(`/people/${x._id}`, { availability: v }))} /></td>
                        <td><InlineSelect name={`Contract for ${x.name}`} value={x.contractStatus} options={CONTRACT_STATUSES} onChange={(v) => run(() => api.patch(`/people/${x._id}`, { contractStatus: v }))} /></td>
                        <td className="text-sm text-t2">{x.notes}</td>
                        <td className="text-right"><IconBtn label={`Remove ${x.name}`} icon={Trash2} onClick={() => run(() => api.del(`/people/${x._id}`))} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Glass>
        <Glass className="min-w-0 flex-[1_1_320px] p-[22px]">
          <H2>Add a person</H2>
          <form onSubmit={add} className="mt-3.5 flex flex-col gap-3">
            <Input label="Name" name="name" required /><Input label="Role" name="role" required placeholder="For example, focus puller" />
            <Select label="Department" name="department" options={DEPARTMENTS} />
            <div className="grid grid-cols-2 gap-3"><Input label="Phone" name="phone" type="tel" /><Input label="Email" name="email" type="email" /><Select label="Availability" name="availability" options={AVAILABILITY} /><Select label="Contract" name="contractStatus" options={CONTRACT_STATUSES} /></div>
            <Area label="Notes" name="notes" rows={2} placeholder="Dates, rates, anything the coordinator should know" />
            <Btn variant="primary" icon={Plus} type="submit" className="w-full">Add to {p.title}</Btn>
          </form>
        </Glass>
      </div>
    </>
  );
}

function InlineSelect({ name, value, options, onChange }: { name: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  return <select aria-label={name} value={value} onChange={(e) => onChange(e.target.value)} className="field min-h-[44px] w-[150px]">{options.map((o) => <option key={o} value={o}>{label(o)}</option>)}</select>;
}
