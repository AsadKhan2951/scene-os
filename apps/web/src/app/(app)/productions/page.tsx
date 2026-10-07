'use client';

import { ArrowRight, Check, Copy, Plus, X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import { PRODUCTION_FORMATS, PRODUCTION_STATUSES, label } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Async, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Pill, Select, Small, Sub } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { pkr, tone } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Production } from '@/lib/types';

export default function ProductionsPage() {
  const router = useRouter();
  const { choose } = useApp();
  const [status, setStatus] = useState('');
  const [format, setFormat] = useState('');
  const [search, setSearch] = useState('');
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  const params = new URLSearchParams();
  if (status) params.set('status', status);
  if (format) params.set('format', format);
  if (search.trim()) params.set('search', search.trim());
  const { data, error: loadError } = useApi<Production[]>(`/productions?${params}`, { keepPreviousData: true });

  const openProduction = (id: string) => { choose(id); router.push('/produce/pipeline'); };
  const duplicate = async (id: string) => { try { await api.post(`/productions/${id}/duplicate`); await refresh('/productions'); } catch (e) { setError(errorText(e)); } };

  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    try {
      const p = await api.post<Production>('/productions', {
        title: f.get('title'), format: f.get('format'), genre: f.get('genre') || undefined, writer: f.get('writer') || undefined,
        director: f.get('director') || undefined, channel: f.get('channel') || undefined,
        totalEpisodes: Number(f.get('totalEpisodes')), totalBudget: Number(f.get('totalBudget') || 0),
      });
      await refresh('/productions');
      setOpen(false);
      choose(p._id);
    } catch (err) { setError(errorText(err)); }
  }

  return (
    <>
      <SectionTabs items={TABS.home} scoped={false} />
      <PageTitle title="Productions" sub={data ? `${data.length} production${data.length === 1 ? '' : 's'} shown.` : undefined}>
        <Btn variant="primary" icon={Plus} onClick={() => setOpen(true)}>New production</Btn>
      </PageTitle>
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[220px] flex-[1_1_240px] sm:max-w-[380px]"><Input label="Search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title, writer or director" /></div>
        <div className="flex flex-wrap gap-1.5">
          <Pill on={!status} onClick={() => setStatus('')}>All</Pill>
          {PRODUCTION_STATUSES.map((s) => <Pill key={s} on={status === s} onClick={() => setStatus(s)}>{label(s)}</Pill>)}
        </div>
        <div className="w-[200px]"><Select label="Format" value={format} onChange={(e) => setFormat(e.target.value)} options={[{ value: '', label: 'All formats' }, ...PRODUCTION_FORMATS.map((f) => ({ value: f, label: label(f) }))]} /></div>
      </div>
      {error && !open && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_640px]">
          <Async data={data} error={loadError}>
            {(rows) => rows.length === 0 ? <Empty title="Nothing here yet">No productions match. Change the filter or start a new production.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] border-collapse text-left">
                  <thead><tr className="text-[13px] text-t3">{['Production', 'Pipeline stage', 'Writer and director', 'Channel', 'Budget', 'Status', ''].map((h) => <th key={h} scope="col" className="pb-3 pr-3.5 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {rows.map((p) => (
                      <tr key={p._id} className="[&>td]:rule [&>td]:py-3.5 [&>td]:pr-3.5">
                        <td><button type="button" onClick={() => openProduction(p._id)} className="text-left text-base font-semibold hover:text-violet">{p.title}</button><Small>{label(p.format)}{p.genre ? `, ${p.genre}` : ''}</Small></td>
                        <td><div className="text-sm">{p.stages.find((s) => s.order === p.currentStage)?.name}</div><Small>Stage {p.currentStage} of 15</Small></td>
                        <td><div className="text-sm">{p.writer || 'No writer yet'}</div><Small>{p.director ? `Directed by ${p.director}` : 'No director yet'}</Small></td>
                        <td className="text-sm">{p.channel || 'Not decided'}</td>
                        <td className="text-sm">{p.totalBudget ? pkr(p.totalBudget) : 'Not set'}</td>
                        <td><Chip tone={tone(p.status)}>{label(p.status)}</Chip></td>
                        <td className="whitespace-nowrap text-right"><IconBtn label={`Duplicate ${p.title}`} icon={Copy} onClick={() => duplicate(p._id)} /><IconBtn label={`Open ${p.title}`} icon={ArrowRight} onClick={() => openProduction(p._id)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Glass>
        {open && (
          <Glass className="min-w-0 flex-[1_1_340px]">
            <div className="mb-3.5 flex items-center justify-between"><H2>New production</H2><IconBtn label="Close form" icon={X} onClick={() => setOpen(false)} /></div>
            <form onSubmit={create} className="flex flex-col gap-3">
              <Input label="Title" name="title" required maxLength={200} />
              <div className="grid grid-cols-2 gap-3">
                <Select label="Format" name="format" options={PRODUCTION_FORMATS} />
                <Input label="Genre" name="genre" />
                <Input label="Writer" name="writer" />
                <Input label="Director" name="director" />
                <Input label="Channel" name="channel" />
                <Input label="Episodes" name="totalEpisodes" type="number" min={1} max={500} required />
              </div>
              <Input label="Total budget, PKR" name="totalBudget" type="number" min={0} />
              <Sub className="text-sm text-t2">Scene OS sets up all 15 pipeline stages for you, from Content / Concept to TX / On-Air.</Sub>
              {error && <Note>{error}</Note>}
              <Btn variant="primary" icon={Check} type="submit" className="w-full">Create production</Btn>
            </form>
          </Glass>
        )}
      </div>
    </>
  );
}
