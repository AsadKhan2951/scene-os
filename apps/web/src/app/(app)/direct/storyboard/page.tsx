'use client';

import clsx from 'clsx';
import { Clapperboard, Image as ImageIcon, Star, Wand2 } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Btn, Chip, Empty, Glass, Note, Pill, Select, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { picture } from '@/lib/direction';
import type { FilmBoard, Frame, Story } from '@/lib/types';

export default function FilmStoryboardPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Board key={story._id} story={story} />}</WithStory></>);
}

const TIMES = [{ value: '', label: 'Any time' }, { value: 'day', label: 'Day' }, { value: 'night', label: 'Night' }, { value: 'dawn_dusk', label: 'Dawn or dusk' }] as const;


function Board({ story }: { story: Story }) {
  const [character, setCharacter] = useState('');
  const [location, setLocation] = useState('');
  const [time, setTime] = useState('');
  const [keyOnly, setKeyOnly] = useState(false);
  const [view, setView] = useState<'film' | 'scene'>('film');
  const [sceneKey, setSceneKey] = useState('');
  const [error, setError] = useState('');
  const query = new URLSearchParams({ ...(character && { character }), ...(location && { location }), ...(time && { time }), ...(keyOnly && { key: 'true' }) }).toString();
  const { data, mutate } = useApi<FilmBoard>(`/direction/stories/${story._id}/board${query ? `?${query}` : ''}`);

  const toggleKey = async (f: Frame) => {
    setError('');
    try { await api.patch(`/direction/frames/${f._id}/key`, { keyFrame: !f.keyFrame }); await mutate(); } catch (e) { setError(errorText(e)); }
  };

  if (!data) return null;
  const t = data.totals;
  const keyOf = (s: { episodeNumber: number; sceneNumber: number }) => `${s.episodeNumber}:${s.sceneNumber}`;
  const shown = view === 'scene' ? data.scenes.filter((s) => keyOf(s) === (sceneKey || keyOf(data.scenes[0] ?? { episodeNumber: 0, sceneNumber: 0 }))) : data.scenes;

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{t.scenes} scenes, {t.frames} frames.</h1>
          <p className="mt-1.5 text-base text-t2">{story.title} · {t.rendered} rendered · {t.keyFrames} key frames{t.scriptScenes ? ` · ${t.scriptScenes - t.scenes > 0 ? `${t.scriptScenes - t.scenes} script scenes not drawn yet` : 'every scene drawn'}` : ''}</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          <Btn icon={Clapperboard} href="/write/storyboards">Draw scenes</Btn>
          <Btn variant="primary" icon={Wand2} href="/direct/director">Open AI Director</Btn>
        </div>
      </div>

      <Glass>
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Character" value={character} onChange={(e) => setCharacter(e.target.value)} options={[{ value: '', label: 'Everyone' }, ...data.filters.characters.map((c) => ({ value: c, label: c }))]} className="w-48" />
          <Select label="Location" value={location} onChange={(e) => setLocation(e.target.value)} options={[{ value: '', label: 'Every location' }, ...data.filters.locations.map((l) => ({ value: l, label: l }))]} className="w-56" />
          <fieldset><legend className="mb-1.5 text-[13px] text-t3">Time</legend><div className="flex flex-wrap gap-1.5">{TIMES.map((x) => <Pill key={x.value} on={time === x.value} onClick={() => setTime(x.value)}>{x.label}</Pill>)}</div></fieldset>
          <Pill on={keyOnly} onClick={() => setKeyOnly(!keyOnly)}><Star size={14} className="mr-1.5 inline" aria-hidden />Key frames</Pill>
          <div className="ml-auto flex gap-1.5"><Pill on={view === 'film'} onClick={() => setView('film')}>Full film</Pill><Pill on={view === 'scene'} onClick={() => setView('scene')}>Scene by scene</Pill></div>
        </div>
        {view === 'scene' && data.scenes.length > 0 && (
          <div className="mt-3 max-w-md"><Select label="Scene" value={sceneKey || keyOf(data.scenes[0])} onChange={(e) => setSceneKey(e.target.value)} options={data.scenes.map((s) => ({ value: keyOf(s), label: `Ep ${s.episodeNumber}, sc ${s.sceneNumber}: ${s.heading}` }))} /></div>
        )}
      </Glass>
      {error && <Note>{error}</Note>}

      {shown.length === 0 ? (
        <Glass><Empty title={t.frames ? 'No frames match these filters' : 'No storyboard yet'}>{t.frames ? 'Clear a filter to see more.' : 'Draw scenes from the script first; each scene becomes 3 to 6 frames with a continuity sheet.'}{!t.frames && <div className="mt-4"><Btn variant="primary" href="/write/storyboards">Draw scenes</Btn></div>}</Empty></Glass>
      ) : shown.map((s) => (
        <Glass key={keyOf(s)}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div className="min-w-0"><span className="text-[15px] font-semibold">Ep {s.episodeNumber} · Sc {s.sceneNumber}</span> <span className="text-[15px] text-t2">{s.heading}</span></div>
            <Link href={`/write/teaser?episode=${s.episodeNumber}&scene=${s.sceneNumber}`} className="text-[13px] text-violet hover:text-white">Scene previs video</Link>
          </div>
          <ul className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(200px,1fr))]">
            {s.frames.map((f) => {
              const src = picture(f);
              return (
                <li key={f._id} className="sub relative overflow-hidden rounded-[16px]">
                  <Link href={`/direct/director?frame=${f._id}`} className="block" aria-label={`Open frame ${f.order} of scene ${s.sceneNumber} in the AI Director`}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {src ? <img src={src} alt="" className={clsx('aspect-video w-full object-cover', !f.render?.url && 'grayscale')} loading="lazy" />
                      : <div className="flex aspect-video items-center justify-center bg-white/[0.05] text-t3"><ImageIcon size={20} aria-hidden /></div>}
                    <div className="px-3 py-2">
                      <div className="truncate text-[13px] font-medium">{f.order}. {f.shot || 'Frame'}{f.lens ? ` · ${f.lens}` : ''}</div>
                      <div className="truncate text-[12px] text-t3">{f.action}</div>
                    </div>
                  </Link>
                  <div className="absolute left-2 top-2 flex gap-1">
                    {f.render?.status === 'ready' && <Chip tone="ok">Rendered</Chip>}
                    {['queued', 'drawing'].includes(f.render?.status ?? '') && <Chip tone="ai">Rendering</Chip>}
                  </div>
                  <button type="button" onClick={() => void toggleKey(f)} aria-pressed={!!f.keyFrame} aria-label={f.keyFrame ? 'Remove from key frames' : 'Mark as key frame'} title={f.keyFrame ? 'Key frame' : 'Mark as key frame'}
                    className="absolute right-1.5 top-1.5 inline-flex h-9 w-9 items-center justify-center rounded-full bg-black/55 text-white hover:bg-black/75">
                    <Star size={16} fill={f.keyFrame ? 'currentColor' : 'none'} className={f.keyFrame ? 'text-[#f5d742]' : ''} aria-hidden />
                  </button>
                </li>
              );
            })}
          </ul>
          <Small className="mt-2">{s.time}{s.characters.length ? ` · ${s.characters.join(', ')}` : ''}</Small>
        </Glass>
      ))}
    </>
  );
}
