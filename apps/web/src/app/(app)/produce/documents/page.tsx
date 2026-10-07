'use client';

import { Download, Plus, Trash2 } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { DOCUMENT_TYPES, label } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Async, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Pill, Select, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day, fileSize } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Doc, Production } from '@/lib/types';

export default function DocumentsPage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <Documents key={p._id} production={p} />}</WithProduction></>);
}

function Documents({ production: p }: { production: Production }) {
  const { data, error: loadError, mutate } = useApi<Doc[]>(`/documents?productionId=${p._id}`);
  const [type, setType] = useState('');
  const [search, setSearch] = useState('');
  const [deleting, setDeleting] = useState<Doc | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);
  async function run(fn: () => Promise<unknown>, ok?: string) { setMsg(null); setBusy(true); try { await fn(); await mutate(); if (ok) setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } finally { setBusy(false); } }

  /** The file goes straight to storage with a signed link; only its details are saved here. */
  async function upload(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    const file = f.get('file') as File;
    if (!file?.size) return;
    await run(async () => {
      const mimeType = file.type || 'application/octet-stream';
      const { key, uploadUrl } = await api.post<{ key: string; uploadUrl: string }>('/documents/presign', { productionId: p._id, fileName: file.name, mimeType });
      const put = await fetch(uploadUrl, { method: 'PUT', body: file, headers: { 'content-type': mimeType } });
      if (!put.ok) throw new Error('The file could not be uploaded. Try again');
      await api.post('/documents', { productionId: p._id, title: String(f.get('title') || file.name), type: f.get('type'), fileName: file.name, fileSize: file.size, mimeType, storageKey: key });
      form.reset();
    }, 'Document uploaded.');
  }
  const download = (d: Doc) => run(async () => { const { url } = await api.get<{ url: string }>(`/documents/${d._id}/download`); window.location.href = url; });
  const q = search.trim().toLowerCase();
  const rows = data?.filter((d) => (!type || d.type === type) && (!q || d.title.toLowerCase().includes(q) || d.fileName.toLowerCase().includes(q)));

  return (
    <>
      <PageTitle title="Documents" sub={data ? `${data.length} file${data.length === 1 ? '' : 's'} for this production, newest first.` : undefined} />
      <div className="flex flex-wrap items-end gap-2.5">
        <div className="min-w-[220px] flex-[1_1_240px] sm:max-w-[380px]"><Input label="Search" type="search" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Title or file name" /></div>
        <div className="flex flex-wrap gap-1.5"><Pill on={!type} onClick={() => setType('')}>All</Pill>{DOCUMENT_TYPES.map((t) => <Pill key={t} on={type === t} onClick={() => setType(t)}>{label(t)} {data?.filter((d) => d.type === t).length ?? 0}</Pill>)}</div>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_640px]">
          {deleting && (
            <div role="alertdialog" aria-label="Confirm delete" className="mb-3.5 flex flex-wrap items-center justify-between gap-3 rounded-[18px] border border-red-400/40 bg-red-400/10 px-4 py-3.5">
              <div className="flex-[1_1_300px]"><div className="text-[15px] font-semibold">Delete “{deleting.title}”?</div><div className="mt-0.5 text-sm text-t2">It is removed for everyone on {p.title} and cannot be restored.</div></div>
              <div className="flex gap-2"><Btn onClick={() => setDeleting(null)}>Keep document</Btn><Btn variant="danger" icon={Trash2} disabled={busy} onClick={() => run(async () => { await api.del(`/documents/${deleting._id}`); setDeleting(null); }, 'Document deleted.')}>Delete document</Btn></div>
            </div>
          )}
          {msg && <div className="mb-3.5"><Note tone={msg.tone}>{msg.text}</Note></div>}
          <Async data={rows} error={loadError}>
            {(list) => list.length === 0 ? <Empty title="No documents here">Upload scripts, contracts, briefs and schedules with the form on the right.</Empty> : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[720px] border-collapse text-left">
                  <thead><tr className="text-[13px] text-t3">{['Document', 'Type', 'Size', 'Uploaded', ''].map((h) => <th key={h} scope="col" className="pb-2.5 pr-3.5 font-medium">{h}</th>)}</tr></thead>
                  <tbody>
                    {list.map((d) => (
                      <tr key={d._id} className="[&>td]:rule [&>td]:py-2.5 [&>td]:pr-3.5">
                        <td><div className="text-[15px] font-medium">{d.title}</div><Small>{d.fileName}</Small></td>
                        <td><Chip tone={['script', 'storyboard'].includes(d.type) ? 'info' : 'idle'}>{label(d.type)}</Chip></td>
                        <td className="text-sm text-t2">{fileSize(d.fileSize)}</td><td className="text-sm text-t2">{day(d.createdAt)}</td>
                        <td className="whitespace-nowrap text-right"><IconBtn label={`Download ${d.title}`} icon={Download} onClick={() => download(d)} /><IconBtn label={`Delete ${d.title}`} icon={Trash2} onClick={() => setDeleting(d)} /></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Async>
        </Glass>
        <Glass className="min-w-0 flex-[1_1_320px] p-[22px]">
          <H2>Upload a document</H2>
          <form onSubmit={upload} className="mt-3.5 flex flex-col gap-3">
            <label className="flex flex-col gap-1.5"><span className="text-[13px] text-t2">File</span><input name="file" type="file" required className="field py-2.5 file:mr-3 file:rounded-full file:border-0 file:bg-white/10 file:px-3 file:py-1.5 file:text-sm file:text-t1" /></label>
            <Input label="Title" name="title" placeholder="What the team should call it" /><Select label="Type" name="type" options={DOCUMENT_TYPES} />
            <Btn variant="primary" icon={Plus} type="submit" disabled={busy} className="w-full">{busy ? 'Working…' : `Upload to ${p.title}`}</Btn>
          </form>
        </Glass>
      </div>
    </>
  );
}
