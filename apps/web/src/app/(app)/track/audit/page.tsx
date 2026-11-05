'use client';

import { useState } from 'react';
import { label } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Btn, Chip, Empty, Glass, Note, Select, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { AuditRow, AuditView } from '@/lib/types';

const when = (d: string) => new Date(d).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
const detailText = (d: unknown) => (d === null || d === undefined ? '' : typeof d === 'string' ? d : JSON.stringify(d).replace(/[{}"]/g, '').replace(/,/g, ', ').replace(/:/g, ': ').slice(0, 200));

export default function AuditPage() {
  const { me, productions } = useApp();
  const [f, setF] = useState({ productionId: '', action: '', by: '' });
  const [older, setOlder] = useState<AuditRow[]>([]);
  const [next, setNext] = useState<string | null | undefined>(undefined);
  const [error, setError] = useState('');
  const qs = new URLSearchParams(Object.entries(f).filter(([, v]) => v)).toString();
  const admin = me?.role === 'admin';
  const { data, error: loadError } = useApi<AuditView>(admin ? `/tracking/audit${qs ? `?${qs}` : ''}` : null);
  const set = (k: keyof typeof f, v: string) => { setF({ ...f, [k]: v }); setOlder([]); setNext(undefined); };
  const more = async () => {
    const before = next === undefined ? data?.next : next;
    if (!before) return;
    try {
      const r = await api.get<AuditView>(`/tracking/audit?${new URLSearchParams({ ...Object.fromEntries(Object.entries(f).filter(([, v]) => v)), before })}`);
      setOlder([...older, ...r.rows]); setNext(r.next);
    } catch (e) { setError(errorText(e)); }
  };

  if (me && !admin) return <><SectionTabs items={TABS.track} scoped={false} /><Note tone="warn">Only admins can see the audit log.</Note></>;
  const rows = [...(data?.rows ?? []), ...older];
  const hasMore = next === undefined ? !!data?.next : !!next;

  return (
    <>
      <SectionTabs items={TABS.track} scoped={false} />
      <div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Audit log</h1>
        <p className="mt-1.5 text-base text-t2">Every approval, stage change, sign-off, budget and shoot plan decision, with who made it and whether it came through Ask Scene AI.</p>
      </div>
      <Glass>
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Project" value={f.productionId} onChange={(e) => set('productionId', e.target.value)} options={[{ value: '', label: 'All projects' }, ...(productions ?? []).map((p) => ({ value: p._id, label: p.title }))]} className="w-56" />
          <Select label="What" value={f.action} onChange={(e) => set('action', e.target.value)} options={[{ value: '', label: 'Everything' }, ...(data?.actions ?? []).map((a) => ({ value: a, label: label(a.replace(/\./g, ' ')) }))]} className="w-56" />
          <Select label="Who" value={f.by} onChange={(e) => set('by', e.target.value)} options={[{ value: '', label: 'Everyone' }, ...(data?.people ?? []).map((p) => ({ value: p, label: p }))]} className="w-48" />
        </div>
      </Glass>
      {(error || loadError) && <Note>{error || loadError?.message}</Note>}
      {data && rows.length === 0 ? <Glass><Empty title="Nothing recorded">No decisions match these filters.</Empty></Glass> : (
        <Glass>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[720px] border-collapse text-left text-[14px]">
              <thead><tr className="text-[13px] text-t3">{['When', 'Who', 'What', 'Project', 'Detail'].map((h) => <th key={h} scope="col" className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {rows.map((r) => (
                  <tr key={r._id} className="align-top [&>td]:rule [&>td]:py-2.5 [&>td]:pr-3">
                    <td className="whitespace-nowrap text-t2">{when(r.createdAt)}</td>
                    <td>{r.by ?? '—'}{r.via === 'dreamer' && <span className="ml-1.5"><Chip tone="ai">via Scene AI</Chip></span>}</td>
                    <td>{label(r.action.replace(/\./g, ' '))}</td>
                    <td>{r.production ?? '—'}</td>
                    <td className="max-w-[360px] text-t2">{detailText(r.detail)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {hasMore && <div className="mt-3"><Btn onClick={() => void more()}>Load older</Btn></div>}
          <Small className="mt-2">Showing {rows.length} entries, newest first.</Small>
        </Glass>
      )}
    </>
  );
}
