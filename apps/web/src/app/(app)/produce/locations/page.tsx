'use client';

import { ExternalLink, Image as ImageIcon, Lock, MapPin, Plus, Search, Sparkles, Trash2, Unlock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RunChecklist } from '@/components/run';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Async, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { GroupedLocation, PlaceResult, Production } from '@/lib/types';

export default function LocationsPage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p) => <Locations key={p._id} production={p} />}</WithProduction></>);
}

/** The first Google photo of a place. The link is fetched through the API so the key stays on the server. */
function Photo({ name, alt }: { name?: string; alt: string }) {
  const { data } = useApi<{ url: string }>(name ? `/locations/photo?name=${encodeURIComponent(name)}&w=640` : null, { revalidateIfStale: false });
  return (
    <div className="aspect-[16/10] w-full overflow-hidden rounded-[16px] bg-white/[0.06]">
      {data?.url
        ? <img src={data.url} alt={alt} className="h-full w-full object-cover" loading="lazy" />
        : <div className="flex h-full items-center justify-center text-t3"><MapPin size={22} aria-hidden /></div>}
    </div>
  );
}

function Locations({ production: p }: { production: Production }) {
  const { data: status } = useApi<{ places: boolean }>('/locations/status');
  const { data: saved, error: loadError, mutate } = useApi<GroupedLocation[]>(`/locations?productionId=${p._id}`);
  const [results, setResults] = useState<PlaceResult[] | null>(null);
  const [scriptName, setScriptName] = useState('');
  const [query, setQuery] = useState('');
  const [boardRun, setBoardRun] = useState<Record<string, string>>({});
  const [open, setOpen] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');

  async function run(key: string, fn: () => Promise<unknown>) {
    setError(''); setBusy(key);
    try { await fn(); await mutate(); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  function search(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run('search', async () => setResults(await api.post<PlaceResult[]>('/locations/search', { productionId: p._id, query, region: String(f.get('region') || '') || undefined })));
  }
  const save = (r: PlaceResult) => run(r.placeId, async () => {
    const { placeId, name, address, lat, lng, mapsUri, photoNames, types, rating } = r;
    await api.post('/locations', { productionId: p._id, scriptName: scriptName || undefined, placeId, name, address, lat, lng, mapsUri, photoNames, types, rating });
  });
  const savedIds = new Set(saved?.map((l) => l.placeId));

  return (
    <>
      <PageTitle title="Locations" sub="Real places from Google for each script location. Lock the one you will shoot at." />
      {status && !status.places && <Note tone="warn">Location search is not set up yet. Add GOOGLE_MAPS_API_KEY (with Places API (New) enabled) to the server&apos;s .env.</Note>}
      {error && <Note>{error}</Note>}

      <Glass>
        <H2>Find real places</H2>
        <form onSubmit={search} className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))] sm:items-end">
          <Input label="What to look for" name="query" value={query} onChange={(e) => setQuery(e.target.value)} required minLength={2} placeholder="For example, old haveli courtyard in Lahore" />
          <Input label="Script location (optional)" name="scriptName" value={scriptName} onChange={(e) => setScriptName(e.target.value)} placeholder="INT. HAVELI COURTYARD - DAY" />
          <Input label="Country code (optional)" name="region" maxLength={2} placeholder="PK" />
          <Btn variant="primary" icon={Search} type="submit" disabled={busy === 'search'}>{busy === 'search' ? 'Searching…' : 'Search Google'}</Btn>
        </form>
        {results && (
          results.length === 0 ? <Small className="mt-4">Nothing found. Try other words or a city name.</Small> : (
            <div className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
              {results.map((r) => (
                <div key={r.placeId} className="sub flex flex-col gap-2.5 rounded-[20px] p-3">
                  <Photo name={r.photoNames[0]} alt={r.name} />
                  <div><div className="text-[15px] font-medium">{r.name}</div><Small>{r.address}</Small></div>
                  <div className="mt-auto flex flex-wrap gap-2">
                    {savedIds.has(r.placeId)
                      ? <Chip tone="ok">Saved</Chip>
                      : <Btn icon={Plus} disabled={busy === r.placeId} onClick={() => save(r)}>Save</Btn>}
                    {r.mapsUri && <Btn variant="text" icon={ExternalLink} href={r.mapsUri}>Map</Btn>}
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </Glass>

      <Glass>
        <H2>Saved locations</H2>
        <Async data={saved} error={loadError} what="Loading locations">
          {(list) => list.length === 0 ? <Empty title="No locations saved">Search above and save the places you want to scout.</Empty> : (
            <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(280px,1fr))]">
              {list.map((l) => (
                <div key={l._id} className="sub flex flex-col gap-2.5 rounded-[20px] p-3">
                  {l.board?.length && !l.photoNames.length ? <img src={l.board[0].imageUrl} alt={`${l.name}: ${l.board[0].label}`} className="aspect-[16/10] w-full rounded-[16px] object-cover" loading="lazy" /> : <Photo name={l.photoNames[0]} alt={l.name} />}
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0"><div className="text-[15px] font-medium">{l.name}</div><Small>{l.scriptName ? `${l.scriptName} · ` : ''}{l.address || l.description}</Small>
                      {!!l.sceneNumbers?.length && <Small className="mt-1">Sc {l.sceneNumbers.join(', ')} · {l.scriptNames.join('; ')}</Small>}</div>
                    {l.status === 'locked' ? <Chip tone="ok">Locked</Chip> : <Chip>Candidate</Chip>}
                  </div>
                  <div className="text-sm">
                    {l.costPerDay !== undefined
                      ? <>{l.currency} {l.costPerDay.toLocaleString('en-US')} a day · permit {l.permitDays ?? '?'} days {l.costIsEstimate && <Chip tone="ai">AI estimate</Chip>}</>
                      : <span className="text-t3">No cost or permit time yet</span>}
                    {l.costIsEstimate && l.estimateNote && <Small className="mt-1">{l.estimateNote}</Small>}
                  </div>
                  {!!l.palette?.length && <div className="flex gap-1.5" aria-label="Palette">{l.palette.map((c) => <span key={c} title={c} className="h-6 flex-1 rounded-md" style={{ background: c }} />)}</div>}
                  {boardRun[l._id] && <RunChecklist runId={boardRun[l._id]} onDone={() => void mutate()} />}
                  {open === l._id && <Board loc={l} onSaved={() => void mutate()} />}
                  <div className="mt-auto flex flex-wrap gap-2">
                    {!l.placeId && <Btn icon={Search} onClick={() => { setQuery(`${l.name}${l.description ? `, ${l.description.split('.')[0]}` : ''}`.slice(0, 120)); setScriptName(l.scriptNames?.[0] ?? l.name); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Find real places</Btn>}
                    <Btn icon={ImageIcon} disabled={!!busy} onClick={() => run(`board-${l._id}`, async () => { const r = await api.post<{ _id: string }>(`/production/locations/${l._id}/board`); setBoardRun({ ...boardRun, [l._id]: r._id }); })}>{l.board?.length ? 'Redraw art board' : 'Make art board'}</Btn>
                    <Btn onClick={() => setOpen(open === l._id ? null : l._id)}>{open === l._id ? 'Close' : 'Board and logistics'}</Btn>
                    <Btn icon={Sparkles} disabled={!!busy} onClick={() => run(`est-${l._id}`, () => api.post(`/locations/${l._id}/estimate`))}>{busy === `est-${l._id}` ? 'Estimating…' : 'Estimate cost'}</Btn>
                    <Btn icon={l.status === 'locked' ? Unlock : Lock} disabled={!!busy} onClick={() => run(`lock-${l._id}`, () => api.post(`/locations/${l._id}/lock`, { locked: l.status !== 'locked' }))}>{l.status === 'locked' ? 'Unlock' : 'Lock location'}</Btn>
                    {l.mapsUri && <Btn variant="text" icon={ExternalLink} href={l.mapsUri}>Map</Btn>}
                    <IconBtn label={`Delete ${l.name}`} icon={Trash2} disabled={!!busy} onClick={() => run(`del-${l._id}`, () => api.del(`/locations/${l._id}`))} />
                  </div>
                </div>
              ))}
            </div>
          )}
        </Async>
      </Glass>
    </>
  );
}

const LOGISTICS = [['contact', 'Owner or contact'], ['power', 'Power'], ['unitBase', 'Unit base and parking'], ['nearestHospital', 'Nearest hospital'], ['shootDays', 'Days we can shoot']] as const;

/** A location's art board images and its logistics notes. */
function Board({ loc, onSaved }: { loc: GroupedLocation; onSaved: () => void }) {
  const [form, setForm] = useState<Record<string, string>>({ ...loc.logistics });
  const [msg, setMsg] = useState('');
  const save = async () => {
    setMsg('');
    try { await api.patch(`/production/locations/${loc._id}/logistics`, form); setMsg('Saved'); onSaved(); } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <div className="flex flex-col gap-3">
      {loc.board?.length ? (
        <div className="grid grid-cols-2 gap-2">
          {loc.board.map((b) => <figure key={b.imageUrl}><img src={b.imageUrl} alt={b.label} className="aspect-video w-full rounded-lg object-cover" loading="lazy" /><figcaption className="mt-1 text-[12px] text-t3">{b.label}</figcaption></figure>)}
        </div>
      ) : <Small>No art board yet.</Small>}
      {LOGISTICS.map(([k, label]) => <Input key={k} label={label} value={form[k] ?? ''} maxLength={300} onChange={(e) => setForm({ ...form, [k]: e.target.value })} />)}
      <div className="flex items-center gap-3"><Btn variant="primary" onClick={() => void save()}>Save logistics</Btn>{msg && <Small>{msg}</Small>}</div>
    </div>
  );
}
