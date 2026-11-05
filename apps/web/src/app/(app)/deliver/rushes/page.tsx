'use client';

import clsx from 'clsx';
import { CircleCheck, Download, ExternalLink, MessageSquare, Plus, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { POST_STAGES, POST_STAGE_LABELS, type PostStage } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Area, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, Select, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { EditVersionRow, PostTaskRow, Production, RushRow, RushesView } from '@/lib/types';

export default function RushesPage() {
  return (<><SectionTabs items={TABS.deliver} /><WithProduction>{(p) => <Rushes key={p._id} production={p} />}</WithProduction></>);
}

const tc = (s: number) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
/** "1:23" or "83" to seconds. */
const seconds = (v: string) => { const parts = v.trim().split(':').map(Number); return parts.some(Number.isNaN) ? 0 : parts.reduce((n, x) => n * 60 + x, 0); };

/** Reads a pasted camera report: scene, take, camera, clip, seconds, circled (y/n), notes; a header row is skipped. */
function parseReport(text: string, episode?: number) {
  return text.split(/\r?\n/).map((l) => l.split(/\t|,/).map((c) => c.trim())).filter((c) => c.length >= 4 && /^\d+$/.test(c[0]) && /^\d+$/.test(c[1]))
    .map(([scene, take, camera, clip, dur, circled, ...notes]) => ({
      episodeNumber: episode, sceneNumber: Number(scene), take: Number(take), camera: camera || 'A', clipName: clip,
      durationSeconds: dur ? seconds(dur) || undefined : undefined, circled: /^(y|yes|1|true|circled)$/i.test(circled ?? ''), notes: notes.join(', ') || undefined,
    }));
}

function Rushes({ production: p }: { production: Production }) {
  const key = `/post/${p._id}/rushes`;
  const { data, mutate } = useApi<RushesView>(key);
  const { data: post } = useApi<{ tasks: PostTaskRow[] }>(`/post/${p._id}/post-schedule`);
  const { data: versions } = useApi<EditVersionRow[]>(`/post/${p._id}/versions`);
  const [sel, setSel] = useState<string | null>(null);
  const [error, setError] = useState('');
  const act = async (fn: () => Promise<unknown>) => { setError(''); try { await fn(); await mutate(); } catch (e) { setError(errorText(e)); } };
  if (!data) return null;
  const sceneKey = (s: { episodeNumber?: number | null; sceneNumber: number }) => `${s.episodeNumber ?? ''}:${s.sceneNumber}`;
  const current = data.scenes.find((s) => sceneKey(s) === sel) ?? data.scenes[0];
  const takes = current ? data.rushes.filter((r) => sceneKey(r) === sceneKey(current)) : [];
  const totals = { takes: data.rushes.length, circled: data.rushes.filter((r) => r.circled).length, scenes: data.scenes.length };
  // The headline is the next post deadline ("Director's cut in 9 days"), else the rushes count.
  const next = (post?.tasks ?? []).filter((t) => t.status !== 'done' && t.due).sort((a, b) => a.due!.localeCompare(b.due!))[0];
  const daysTo = next ? Math.ceil((new Date(next.due!).getTime() - Date.now()) / 86_400_000) : null;
  const project = versions?.find((v) => v.projectFile)?.projectFile;
  const circledIn = (s: { episodeNumber?: number | null; sceneNumber: number }) => data.rushes.filter((r) => sceneKey(r) === sceneKey(s) && r.circled).map((r) => r.take);
  const epQuery = current?.episodeNumber ? `?episode=${current.episodeNumber}` : '';

  return (
    <>
      <div>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">
            {next && daysTo !== null ? `${POST_STAGE_LABELS[next.stage as PostStage]}${next.episodeNumber > 1 ? ` (ep ${next.episodeNumber})` : ''} ${daysTo < 0 ? `is ${-daysTo} day${daysTo === -1 ? '' : 's'} late` : daysTo === 0 ? 'is due today' : `in ${daysTo} day${daysTo === 1 ? '' : 's'}`}.` : `${totals.scenes} scenes, ${totals.takes} takes, ${totals.circled} circled.`}
          </h1>
          {project && <Chip tone="ok">Premiere Pro project · {project}</Chip>}
        </div>
        <p className="mt-1.5 text-base text-t2">{p.title} · {totals.takes} takes in {totals.scenes} scenes. Circle the good takes, leave notes at a timecode, then open the scene in Premiere Pro with the notes as markers.</p>
      </div>
      {error && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
          <Glass>
            <H2>Scenes</H2>
            {data.scenes.length === 0 ? <Small className="mt-2">No takes logged yet.</Small> : (
              <ul className="mt-2">
                {data.scenes.map((s) => (
                  <li key={sceneKey(s)}>
                    <button type="button" onClick={() => setSel(sceneKey(s))} aria-current={current && sceneKey(current) === sceneKey(s) ? 'true' : undefined}
                      className={clsx('rule flex min-h-[48px] w-full items-center justify-between gap-3 px-2 text-left', current && sceneKey(current) === sceneKey(s) && 'bg-white/[0.06]')}>
                      <span><span className="text-[15px] font-medium">{s.episodeNumber ? `Ep ${s.episodeNumber} · ` : ''}Sc {s.sceneNumber}</span><Small>{s.takes} takes{circledIn(s).length ? ` · circle ${circledIn(s).join(', ')}` : ''}{s.comments ? ` · ${s.comments} notes` : ''}</Small></span>
                      <Chip tone={s.uploadPct >= 100 ? 'ok' : s.uploadPct > 0 ? 'ai' : 'idle'}>{s.uploadPct >= 100 ? 'Uploaded' : `${s.uploadPct}%`}</Chip>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </Glass>
          <LogTakes productionId={p._id} onSaved={() => void mutate()} />
        </div>

        <Glass className="min-w-0 flex-[999_1_560px]">
          {!current ? <Empty title="No rushes yet">Log takes on the left or paste the camera report.</Empty> : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <H2>{current.episodeNumber ? `Episode ${current.episodeNumber}, ` : ''}scene {current.sceneNumber}</H2>
                <div className="flex flex-wrap gap-2">
                  <Btn icon={Download} onClick={() => { window.location.href = `/api/post/${p._id}/scenes/${current.sceneNumber}/premiere.xml${epQuery}`; }}>Premiere XML</Btn>
                  <Btn icon={Download} onClick={() => { window.location.href = `/api/post/${p._id}/scenes/${current.sceneNumber}/timeline.otio${epQuery}`; }}>OTIO</Btn>
                </div>
              </div>
              <Small className="mt-1">The timeline has the circled takes (all takes if none are circled). In Premiere: File, Import, choose the .xml, then relink to your card files. Notes become clip markers.</Small>
              <ul className="mt-4 flex flex-col gap-3">
                {takes.map((r) => <Take key={r._id} rush={r} onChange={(fn) => act(fn)} />)}
              </ul>
            </>
          )}
        </Glass>
      </div>
      <Versions productionId={p._id} episodes={p.totalEpisodes ?? 1} />
    </>
  );
}

function Take({ rush: r, onChange }: { rush: RushRow; onChange: (fn: () => Promise<unknown>) => void }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState('0:00');
  const [text, setText] = useState('');
  const [link, setLink] = useState(r.url ?? '');
  return (
    <li className="sub rounded-[18px] p-3">
      <div className="flex flex-wrap items-center gap-3">
        <button type="button" aria-pressed={r.circled} aria-label={r.circled ? `Uncircle take ${r.take}` : `Circle take ${r.take}`} onClick={() => onChange(() => api.patch(`/post/rushes/${r._id}`, { circled: !r.circled }))}
          className={clsx('inline-flex h-11 w-11 items-center justify-center rounded-full border', r.circled ? 'border-[#2fbf71] text-[#2fbf71]' : 'border-white/20 text-t3')}>
          <CircleCheck size={20} aria-hidden />
        </button>
        <div className="min-w-0 flex-1">
          <div className="text-[15px] font-semibold">Take {r.take} · cam {r.camera}{r.circled && <span className="ml-2 text-[13px] font-normal text-[#2fbf71]">circled</span>}</div>
          <Small>{r.clipName}{r.durationSeconds ? ` · ${tc(r.durationSeconds)}` : ''}{r.shootDate ? ` · ${day(r.shootDate)}` : ''}{r.notes ? ` · ${r.notes}` : ''}</Small>
        </div>
        {r.url ? <Btn variant="text" icon={ExternalLink} href={r.url}>Open</Btn> : <Chip tone={r.uploadPct > 0 ? 'ai' : 'idle'}>{r.uploadPct > 0 ? `${r.uploadPct}% up` : 'On card'}</Chip>}
        <Btn icon={MessageSquare} onClick={() => setOpen(!open)} aria-expanded={open}>{r.comments.length || ''} Notes</Btn>
        <IconBtn label={`Delete take ${r.take}`} icon={Trash2} onClick={() => onChange(() => api.del(`/post/rushes/${r._id}`))} />
      </div>
      {open && (
        <div className="mt-3 border-t border-white/10 pt-3">
          <ul className="flex flex-col gap-1.5">
            {r.comments.map((c) => (
              <li key={c._id} className="flex items-start gap-2 text-[14px]">
                <span className="rounded bg-white/10 px-1.5 font-mono text-[12px]">{tc(c.seconds)}</span>
                <span className="flex-1"><span className="text-t3">{c.by}: </span>{c.text}</span>
                <IconBtn label="Delete note" icon={Trash2} onClick={() => onChange(() => api.del(`/post/rushes/${r._id}/comments/${c._id}`))} />
              </li>
            ))}
          </ul>
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); if (!text.trim()) return; onChange(async () => { await api.post(`/post/rushes/${r._id}/comments`, { text, seconds: seconds(at) }); setText(''); }); }}>
            <Input label="At" value={at} onChange={(e) => setAt(e.target.value)} className="w-20" />
            <Input label="Note for the editor" value={text} maxLength={1000} onChange={(e) => setText(e.target.value)} className="w-72" />
            <Btn type="submit">Add note</Btn>
          </form>
          <form className="mt-2 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); onChange(() => api.patch(`/post/rushes/${r._id}`, { url: link })); }}>
            <Input label="Media link (Frame.io, Drive or server)" type="url" value={link} onChange={(e) => setLink(e.target.value)} className="w-80" />
            <Btn type="submit" icon={Upload}>Save link</Btn>
          </form>
        </div>
      )}
    </li>
  );
}

function LogTakes({ productionId, onSaved }: { productionId: string; onSaved: () => void }) {
  const [f, setF] = useState({ episode: '', scene: '', take: '1', camera: 'A', clip: '', duration: '', circled: false });
  const [report, setReport] = useState('');
  const [msg, setMsg] = useState('');
  const send = async (rows: object[]) => {
    try { await api.post(`/post/${productionId}/rushes`, { rows }); setMsg(`${rows.length} take${rows.length === 1 ? '' : 's'} logged`); onSaved(); } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <Glass>
      <H2>Log takes</H2>
      <form className="mt-3 grid grid-cols-2 gap-2" onSubmit={(e) => { e.preventDefault(); void send([{ episodeNumber: Number(f.episode) || undefined, sceneNumber: Number(f.scene), take: Number(f.take), camera: f.camera || 'A', clipName: f.clip, durationSeconds: f.duration ? seconds(f.duration) || undefined : undefined, circled: f.circled }]).then(() => setF({ ...f, take: String(Number(f.take) + 1), clip: '' })); }}>
        <Input label="Episode" type="number" min={1} value={f.episode} onChange={(e) => setF({ ...f, episode: e.target.value })} />
        <Input label="Scene" type="number" min={1} required value={f.scene} onChange={(e) => setF({ ...f, scene: e.target.value })} />
        <Input label="Take" type="number" min={1} required value={f.take} onChange={(e) => setF({ ...f, take: e.target.value })} />
        <Input label="Camera" value={f.camera} maxLength={4} onChange={(e) => setF({ ...f, camera: e.target.value })} />
        <div className="col-span-2"><Input label="Clip name on the card" required value={f.clip} placeholder="A001C003" onChange={(e) => setF({ ...f, clip: e.target.value })} /></div>
        <Input label="Length (m:ss)" value={f.duration} placeholder="1:24" onChange={(e) => setF({ ...f, duration: e.target.value })} />
        <label className="flex min-h-[44px] items-center gap-2 self-end text-[14px]"><input type="checkbox" checked={f.circled} onChange={(e) => setF({ ...f, circled: e.target.checked })} />Circled</label>
        <div className="col-span-2"><Btn type="submit" variant="primary" icon={Plus} className="w-full">Log take</Btn></div>
      </form>
      <div className="mt-4">
        <Area label="Or paste the camera report (scene, take, camera, clip, length, circled, notes)" rows={4} value={report} onChange={(e) => setReport(e.target.value)} placeholder={'12,1,A,A001C001,1:10,n\n12,2,A,A001C002,1:05,y,best performance'} />
        <Btn className="mt-2 w-full" onClick={() => { const rows = parseReport(report, Number(f.episode) || undefined); if (!rows.length) { setMsg('No rows found. Use one take per line.'); return; } void send(rows).then(() => setReport('')); }}>Log {parseReport(report).length || ''} takes from the report</Btn>
      </div>
      {msg && <Small className="mt-2">{msg}</Small>}
    </Glass>
  );
}

function Versions({ productionId, episodes }: { productionId: string; episodes: number }) {
  const key = `/post/${productionId}/versions`;
  const { data, mutate } = useApi<EditVersionRow[]>(key);
  const [f, setF] = useState({ episodeNumber: '1', stage: 'assembly', url: '', projectFile: '', notes: '' });
  const [msg, setMsg] = useState('');
  const add = async () => {
    try { await api.post(key, { episodeNumber: Number(f.episodeNumber), stage: f.stage, url: f.url || undefined, projectFile: f.projectFile || undefined, notes: f.notes || undefined }); setF({ ...f, url: '', notes: '' }); setMsg(''); await mutate(); } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <Glass>
      <H2>Edit versions</H2>
      <Small className="mt-1">Each cut with its review link and Premiere project, numbered per episode.</Small>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void add(); }}>
        <Select label="Episode" value={f.episodeNumber} onChange={(e) => setF({ ...f, episodeNumber: e.target.value })} options={Array.from({ length: Math.max(1, episodes) }, (_, i) => ({ value: String(i + 1), label: `Episode ${i + 1}` }))} className="w-36" />
        <Select label="Cut" value={f.stage} onChange={(e) => setF({ ...f, stage: e.target.value })} options={POST_STAGES.map((s) => ({ value: s, label: POST_STAGE_LABELS[s] }))} className="w-40" />
        <Input label="Review link" type="url" value={f.url} onChange={(e) => setF({ ...f, url: e.target.value })} className="w-64" />
        <Input label="Premiere project (.prproj)" value={f.projectFile} onChange={(e) => setF({ ...f, projectFile: e.target.value })} className="w-56" />
        <Input label="Notes" value={f.notes} onChange={(e) => setF({ ...f, notes: e.target.value })} className="w-64" />
        <Btn type="submit" variant="primary" icon={Plus}>Add version</Btn>
      </form>
      {msg && <Small className="mt-2 text-risk">{msg}</Small>}
      {!data?.length ? <Small className="mt-3">No versions yet.</Small> : (
        <ul className="mt-3">
          {data.map((v) => (
            <li key={v._id} className="rule flex flex-wrap items-center justify-between gap-2 py-2.5">
              <div className="min-w-0"><span className="text-[15px] font-medium">Ep {v.episodeNumber} · v{v.version} · {POST_STAGE_LABELS[v.stage as PostStage] ?? v.stage}</span><Small>{[v.projectFile, v.notes, v.createdBy, day(v.createdAt)].filter(Boolean).join(' · ')}</Small></div>
              <div className="flex gap-1">{v.url && <Btn variant="text" icon={ExternalLink} href={v.url}>Review</Btn>}<IconBtn label="Delete version" icon={Trash2} onClick={() => void api.del(`/post/versions/${v._id}`).then(() => mutate())} /></div>
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}
