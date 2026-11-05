'use client';

import { ExternalLink, Image as ImageIcon, Lock, MapPin, Plus, Search, Sparkles, Trash2, Unlock } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { RunChecklist } from '@/components/run';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Async, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, PageTitle, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { GroupedLocation, PlaceResult, Production, ProductionOverview } from '@/lib/types';

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
      {saved && open && saved.find((l) => l._id === open) && (
        <LocationDetail key={open} loc={saved.find((l) => l._id === open)!} productionId={p._id} placesReady={!!status?.places}
          boardRunId={boardRun[open]} onBoard={(runId) => setBoardRun({ ...boardRun, [open]: runId })} onClose={() => setOpen(null)} onChanged={() => void mutate()} />
      )}

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
                  <div className="mt-auto flex flex-wrap gap-2">
                    {!l.placeId && <Btn icon={Search} onClick={() => { setQuery(`${l.name}${l.description ? `, ${l.description.split('.')[0]}` : ''}`.slice(0, 120)); setScriptName(l.scriptNames?.[0] ?? l.name); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Find real places</Btn>}
                    <Btn icon={ImageIcon} disabled={!!busy} onClick={() => run(`board-${l._id}`, async () => { const r = await api.post<{ _id: string }>(`/production/locations/${l._id}/board`); setBoardRun({ ...boardRun, [l._id]: r._id }); })}>{l.board?.length ? 'Redraw art board' : 'Make art board'}</Btn>
                    <Btn variant="primary" onClick={() => { setOpen(l._id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Open board</Btn>
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

/** One shoot location as the director signs it off: its scenes, art board, real places that fit, and logistics. */
function LocationDetail({ loc, productionId, placesReady, boardRunId, onBoard, onClose, onChanged }: {
  loc: GroupedLocation; productionId: string; placesReady: boolean; boardRunId?: string; onBoard: (runId: string) => void; onClose: () => void; onChanged: () => void;
}) {
  const { data: overview } = useApi<ProductionOverview>(`/production/${productionId}/overview`);
  const [places, setPlaces] = useState<PlaceResult[] | null>(null);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  const act = async (name: string, fn: () => Promise<unknown>) => {
    setBusy(name); setError('');
    try { await fn(); onChanged(); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  };
  const scenes = (overview?.scenes ?? []).filter((s) => s.locationId === loc._id);
  const times = [...new Set(scenes.map((s) => (s.time ?? '').toLowerCase()).filter(Boolean))];
  const eighths = scenes.reduce((n, s) => n + s.eighths, 0);
  const cast = [...new Set(scenes.flatMap((s) => s.elements.filter((e) => e.category === 'cast').map((e) => e.name)))];
  const extras = scenes.reduce((n, s) => Math.max(n, s.elements.filter((e) => e.category === 'extras').reduce((m, e) => m + (e.qty ?? 0), 0)), 0);
  const summary = [
    loc.sceneNumbers.length ? `Scenes ${loc.sceneNumbers.slice(0, 8).join(', ')}${loc.sceneNumbers.length > 8 ? '…' : ''}` : null,
    times.join(' and ') || null,
    scenes.length ? `${scenes.length} scene${scenes.length === 1 ? '' : 's'}` : null,
    eighths ? `${Math.round(eighths / 8)} pages` : null,
    cast.slice(0, 3).join(', ') || null,
    extras ? `${extras} extras` : null,
  ].filter(Boolean).join(' · ');
  const search = () => act('search', async () => {
    const q = `${loc.name}${loc.description ? `, ${loc.description.split('.')[0]}` : ''}`.slice(0, 150);
    setPlaces(await api.post<PlaceResult[]>('/locations/search', { productionId, query: q }));
  });
  const use = (r: PlaceResult) => act(`use-${r.placeId}`, () => api.patch(`/locations/${loc._id}`, { placeId: r.placeId, address: r.address, lat: r.lat, lng: r.lng, mapsUri: r.mapsUri, photoNames: r.photoNames, types: r.types, rating: r.rating }));

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h2 className="text-[30px] font-semibold leading-tight tracking-[-0.02em]">{loc.name}</h2>
          <p className="mt-1 text-[15px] text-t2">{summary || loc.description}</p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Btn onClick={onClose}>Back to all locations</Btn>
          <Btn icon={Sparkles} disabled={!!busy || !!boardRunId} onClick={() => act('board', async () => onBoard((await api.post<{ _id: string }>(`/production/locations/${loc._id}/board`))._id))}>{loc.board?.length ? 'Regenerate board' : 'Make art board'}</Btn>
          <Btn variant="primary" icon={loc.status === 'locked' ? Unlock : Lock} disabled={!!busy} onClick={() => act('lock', () => api.post(`/locations/${loc._id}/lock`, { locked: loc.status !== 'locked' }))}>{loc.status === 'locked' ? 'Unlock location' : 'Lock location'}</Btn>
        </div>
      </div>
      {error && <Note>{error}</Note>}

      <Glass>
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div><H2>Location art board</H2><Small>AI-made from the scene settings: palette, light and textures the director signs off before scouting.</Small></div>
          {!!loc.palette?.length && <div className="flex gap-1.5" aria-label="Palette">{loc.palette.map((c) => <span key={c} title={c} className="h-7 w-7 rounded-md border border-white/10" style={{ background: c }} />)}</div>}
        </div>
        {boardRunId && <div className="mt-3"><RunChecklist runId={boardRunId} onDone={onChanged} /></div>}
        {loc.board?.length ? (
          <div className="mt-3 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
            {loc.board.map((b) => (
              <figure key={b.imageUrl} className="relative overflow-hidden rounded-xl">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={b.imageUrl} alt={b.label} className="aspect-video w-full object-cover" loading="lazy" />
                <figcaption className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[12px]">{b.label}</figcaption>
              </figure>
            ))}
          </div>
        ) : <Small className="mt-3">No art board yet. Make one to agree the look before anyone scouts (about 140 credits).</Small>}
      </Glass>

      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[2_1_520px]">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <H2>Real places that fit</H2>
            <Btn icon={Search} disabled={!!busy || !placesReady} onClick={() => void search()}>{busy === 'search' ? 'Searching…' : places ? 'Search again' : 'Search Google'}</Btn>
          </div>
          {loc.placeId && <Small className="mt-1">Chosen: {loc.address}{loc.mapsUri && <> · <a href={loc.mapsUri} target="_blank" rel="noreferrer" className="text-violet">map</a></>}</Small>}
          {!placesReady && <Small className="mt-2">Google search is not set up on the server yet.</Small>}
          {places && (places.length === 0 ? <Small className="mt-3">Nothing found. Try the search on the Locations list with other words.</Small> : (
            <div className="mt-3 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
              {places.map((r) => (
                <div key={r.placeId} className="sub flex flex-col gap-2 rounded-[18px] p-2.5">
                  <Photo name={r.photoNames[0]} alt={r.name} />
                  <div><div className="text-[14px] font-medium">{r.name}</div><Small>{r.address}</Small></div>
                  <div className="mt-auto flex flex-wrap gap-1.5">
                    {loc.placeId === r.placeId ? <Chip tone="ok">Chosen</Chip> : <Btn disabled={!!busy} onClick={() => void use(r)}>Use this place</Btn>}
                    {r.mapsUri && <a href={r.mapsUri} target="_blank" rel="noreferrer" className="inline-flex min-h-[44px] items-center px-2 text-[13px] text-violet">Map</a>}
                  </div>
                </div>
              ))}
            </div>
          ))}
          <div className="mt-3 text-sm">
            {loc.costPerDay !== undefined
              ? <>{loc.currency} {loc.costPerDay.toLocaleString('en-US')} a day · permit {loc.permitDays ?? '?'} days {loc.costIsEstimate && <Chip tone="ai">AI estimate</Chip>}</>
              : <span className="text-t3">No cost or permit time yet.</span>}
            {loc.placeId && <Btn variant="text" icon={Sparkles} disabled={!!busy} onClick={() => void act('estimate', () => api.post(`/locations/${loc._id}/estimate`))}>Estimate cost</Btn>}
          </div>
        </Glass>
        <Glass className="min-w-0 flex-[1_1_320px]">
          <H2>Scouting and logistics</H2>
          <div className="mt-3"><Board loc={loc} onSaved={onChanged} /></div>
        </Glass>
      </div>
    </>
  );
}
