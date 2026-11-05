'use client';

import clsx from 'clsx';
import { Clapperboard, Image as ImageIcon, Lock, Maximize2, Star, Wand2 } from 'lucide-react';
import { useState } from 'react';
import { DirectorControls, frameLabel } from '@/components/director';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Btn, Chip, Empty, Glass, Note, Pill, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { picture } from '@/lib/direction';
import type { FaceRow, FilmBoard, FilmScene, Frame, Story } from '@/lib/types';

export default function FilmStoryboardPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Board key={story._id} story={story} />}</WithStory></>);
}

const TIMES = [{ value: '', label: 'Any time' }, { value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }, { value: 'dawn_dusk', label: 'Dawn or dusk' }] as const;
const BUSY = ['queued', 'drawing'];
const keyOf = (s: { episodeNumber: number; sceneNumber: number }) => `${s.episodeNumber}:${s.sceneNumber}`;
const place = (s: FilmScene) => `${s.location.toLowerCase().replace(/(^|\s)\S/g, (c) => c.toUpperCase())}${s.time ? `, ${s.time.toLowerCase()}` : ''}`;

function Board({ story }: { story: Story }) {
  const [character, setCharacter] = useState('');
  const [location, setLocation] = useState('');
  const [time, setTime] = useState('');
  const [keyOnly, setKeyOnly] = useState(false);
  const [view, setView] = useState<'film' | 'scene'>('film');
  const [sceneKey, setSceneKey] = useState('');
  const [selected, setSelected] = useState<string | null>(null);
  const [error, setError] = useState('');
  const query = new URLSearchParams({ ...(character && { character }), ...(location && { location }), ...(time && { time }), ...(keyOnly && { key: 'true' }) }).toString();
  const { data, mutate } = useApi<FilmBoard>(`/direction/stories/${story._id}/board${query ? `?${query}` : ''}`, {
    // While a render or clip is being made, check every few seconds so it appears on its own.
    refreshInterval: (d) => (d?.scenes.some((s) => s.frames.some((f) => BUSY.includes(f.render?.status ?? '') || BUSY.includes(f.videoStatus ?? ''))) ? 5000 : 0),
  });
  const { data: faces } = useApi<FaceRow[]>(`/direction/stories/${story._id}/faces`);

  const toggleKey = async (f: Frame) => {
    setError('');
    try { await api.patch(`/direction/frames/${f._id}/key`, { keyFrame: !f.keyFrame }); await mutate(); } catch (e) { setError(errorText(e)); }
  };

  if (!data) return null;
  const t = data.totals;
  const shown = view === 'scene' ? data.scenes.filter((s) => keyOf(s) === (sceneKey || (data.scenes[0] ? keyOf(data.scenes[0]) : ''))) : data.scenes;
  const all = data.scenes.flatMap((s) => s.frames.map((f) => ({ f, s })));
  const current = all.find((x) => x.f._id === selected) ?? all[0];
  const locked = (faces ?? []).filter((c) => c.soulId).map((c) => c.name);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">The whole film, frame by frame.</h1>
          <p className="mt-1.5 text-base text-t2">{story.title} · {t.scenes} scenes · {t.frames} frames · every frame carries its continuity sheet{t.rendered ? ` · ${t.rendered} rendered` : ''}{t.scriptScenes && t.scriptScenes > t.scenes ? ` · ${t.scriptScenes - t.scenes} scenes not drawn yet` : ''}</p>
        </div>
        <div className="flex gap-1 rounded-full border border-white/10 p-1" role="group" aria-label="View">
          <Pill on={view === 'film'} onClick={() => setView('film')}>Full storyboard</Pill>
          <Pill on={view === 'scene'} onClick={() => setView('scene')}>Scene by scene</Pill>
        </div>
      </div>
      {error && <Note>{error}</Note>}

      {t.frames === 0 ? (
        <Glass><Empty title="No storyboard yet">Draw scenes from the script first; each scene becomes 3 to 6 frames with a continuity sheet.<div className="mt-4"><Btn variant="primary" icon={Clapperboard} href="/write/storyboards">Draw scenes</Btn></div></Empty></Glass>
      ) : (
        <div className="flex flex-wrap items-start gap-4">
          <Glass className="min-w-0 flex-[999_1_620px]">
            <div className="flex flex-wrap items-center gap-2 border-b border-white/10 pb-3">
              <span className="text-[13px] text-t3">Filter</span>
              <select aria-label="Character" className="field !min-h-[40px] !w-auto !rounded-full" value={character} onChange={(e) => setCharacter(e.target.value)}>
                <option value="">All characters</option>{data.filters.characters.map((c) => <option key={c} value={c}>{c}</option>)}
              </select>
              <select aria-label="Location" className="field !min-h-[40px] !w-auto !rounded-full" value={location} onChange={(e) => setLocation(e.target.value)}>
                <option value="">All locations</option>{data.filters.locations.map((l) => <option key={l} value={l}>{l}</option>)}
              </select>
              <select aria-label="Time of day" className="field !min-h-[40px] !w-auto !rounded-full" value={time} onChange={(e) => setTime(e.target.value)}>
                {TIMES.map((x) => <option key={x.value} value={x.value}>{x.label}</option>)}
              </select>
              <Pill on={keyOnly} onClick={() => setKeyOnly(!keyOnly)}><Star size={13} className="mr-1 inline" aria-hidden />Key frames</Pill>
              {locked.length > 0 && <span className="ml-auto"><Chip tone="ai"><Lock size={12} className="mr-1 inline" aria-hidden />{locked.slice(0, 3).join(' and ')}{locked.length > 3 ? ` +${locked.length - 3}` : ''} face{locked.length === 1 ? '' : 's'} locked</Chip></span>}
            </div>
            {view === 'scene' && (
              <div className="mt-3 max-w-md">
                <select aria-label="Scene" className="field" value={sceneKey || (data.scenes[0] ? keyOf(data.scenes[0]) : '')} onChange={(e) => setSceneKey(e.target.value)}>
                  {data.scenes.map((s) => <option key={keyOf(s)} value={keyOf(s)}>Ep {s.episodeNumber}, sc {s.sceneNumber}: {s.heading}</option>)}
                </select>
              </div>
            )}
            {shown.length === 0 ? <Small className="mt-4">No frames match these filters.</Small> : shown.map((s) => (
              <section key={keyOf(s)} className="rule pt-3" aria-label={`Scene ${s.sceneNumber}`}>
                <div className="mb-2.5 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 className="text-[16px] font-semibold">{data.scenes.some((x) => x.episodeNumber !== s.episodeNumber) ? `Ep ${s.episodeNumber} · ` : ''}Scene {s.sceneNumber} · {place(s)}</h2>
                  <Small>{s.frames.length} frame{s.frames.length === 1 ? '' : 's'}</Small>
                </div>
                <ul className="mb-3 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(170px,1fr))]">
                  {s.frames.map((f) => {
                    const src = picture(f);
                    const on = current?.f._id === f._id;
                    return (
                      <li key={f._id} className={clsx('relative overflow-hidden rounded-[14px] border', on ? 'border-violet ring-2 ring-violet' : 'border-white/10')}>
                        <button type="button" onClick={() => setSelected(f._id)} aria-pressed={on} aria-label={`Frame ${frameLabel(f)}: ${f.action ?? ''}`} className="block w-full">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          {src ? <img src={src} alt="" className={clsx('aspect-video w-full object-cover', !f.render?.url && 'grayscale')} loading="lazy" />
                            : <div className="flex aspect-video items-center justify-center bg-white/[0.05] text-t3"><ImageIcon size={18} aria-hidden /></div>}
                          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[12px] font-medium text-white">{frameLabel(f)}</span>
                          {BUSY.includes(f.render?.status ?? '') && <span className="absolute left-1.5 top-1.5"><Chip tone="ai">Rendering</Chip></span>}
                        </button>
                        <button type="button" onClick={() => void toggleKey(f)} aria-pressed={!!f.keyFrame} aria-label={f.keyFrame ? 'Remove from key frames' : 'Mark as key frame'} title={f.keyFrame ? 'Key frame' : 'Mark as key frame'}
                          className="absolute right-1 top-1 inline-flex h-8 w-8 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75">
                          <Star size={14} fill={f.keyFrame ? 'currentColor' : 'none'} className={f.keyFrame ? 'text-[#f5d742]' : ''} aria-hidden />
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </Glass>

          {current && (
            <Glass className="min-w-0 flex-[1_1_340px] lg:sticky lg:top-4">
              <div className="flex items-center justify-between gap-2"><Chip tone="ai"><Wand2 size={12} className="mr-1 inline" aria-hidden />AI Director</Chip><Btn variant="text" icon={Maximize2} href={`/direct/director?frame=${current.f._id}`}>Open large</Btn></div>
              <h2 className="mt-2 text-[20px] font-semibold tracking-[-0.01em]">Scene {current.s.sceneNumber} · {place(current.s)}</h2>
              <Small>Frame {frameLabel(current.f)} selected{current.f.camera ? ` · ${current.f.camera}` : ''}</Small>
              <div className="relative mt-3 aspect-video w-full overflow-hidden rounded-[14px] bg-black">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {picture(current.f) ? <img src={picture(current.f)} alt={current.f.action ?? ''} className={clsx('h-full w-full object-cover', !current.f.render?.url && 'grayscale')} /> : null}
                <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[12px] font-medium">{current.f.sceneNumber}.{current.f.order} · {current.f.render?.status === 'ready' ? 'realistic render' : 'sketch'}</span>
                {BUSY.includes(current.f.render?.status ?? '') && <div role="status" className="absolute inset-0 flex items-center justify-center bg-black/55 text-[14px]">Rendering…</div>}
              </div>
              {current.f.videoUrl && current.f.videoStatus === 'ready' && <video src={current.f.videoUrl} controls muted loop playsInline className="mt-2 aspect-video w-full rounded-[14px] bg-black" aria-label="Motion clip" />}
              <div className="mt-4"><DirectorControls key={current.f._id} frame={current.f} episodeNumber={current.s.episodeNumber} onChanged={() => void mutate()} /></div>
            </Glass>
          )}
        </div>
      )}
    </>
  );
}
