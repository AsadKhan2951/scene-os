'use client';

import clsx from 'clsx';
import { Clapperboard, Film, Image as ImageIcon, Lock, Presentation, Sparkles, Star } from 'lucide-react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { CAMERA_MOVES, FRAME_ASPECTS, LENSES, LIGHT_LOOKS, STYLE_PRESETS, STYLE_PRESET_LABELS } from '@sceneos/shared';
import { RunChecklist } from '@/components/run';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Btn, Chip, Empty, Glass, H2, Note, Pill, Select, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { picture } from '@/lib/direction';
import type { FaceRow, FilmBoard, Frame, Story } from '@/lib/types';

export default function DirectorPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Suspense><Director key={story._id} story={story} /></Suspense>}</WithStory></>);
}

const BUSY = ['queued', 'drawing'];
const ASPECT_CLASS: Record<string, string> = { '16:9': 'aspect-video', '2.39:1': 'aspect-[2.39/1]', '9:16': 'aspect-[9/16] max-h-[620px] mx-auto', '1:1': 'aspect-square max-h-[620px] mx-auto', '4:3': 'aspect-[4/3]' };

function Director({ story }: { story: Story }) {
  const router = useRouter();
  const params = useSearchParams();
  const { data: board } = useApi<FilmBoard>(`/direction/stories/${story._id}/board`);
  const { data: faces } = useApi<FaceRow[]>(`/direction/stories/${story._id}/faces`);
  const all = (board?.scenes ?? []).flatMap((s) => s.frames.map((f) => ({ ...f, scene: s })));
  const frameId = params.get('frame') ?? all[0]?._id ?? null;
  const { data: frame, mutate } = useApi<Frame & { renderRun?: { _id: string; status: string } | null }>(frameId ? `/direction/frames/${frameId}` : null, {
    refreshInterval: (f) => (f && (BUSY.includes(f.render?.status ?? '') || BUSY.includes(f.videoStatus ?? '')) ? 4000 : 0),
  });
  const current = all.find((f) => f._id === frameId);
  const scene = current?.scene;

  const [look, setLook] = useState({ preset: '', lens: '', camera: '', light: '', aspect: '16:9' });
  const [show, setShow] = useState<'render' | 'sketch'>('render');
  const [runId, setRunId] = useState<string | null>(null);
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);
  const [busy, setBusy] = useState('');
  // Start from what the frame already says, or how it was last rendered.
  useEffect(() => {
    if (!frame) return;
    const r = frame.render;
    setLook({ preset: r?.preset ?? '', lens: r?.lens ?? frame.lens ?? '', camera: r?.camera ?? frame.camera ?? '', light: r?.light ?? frame.light ?? '', aspect: r?.aspect ?? '16:9' });
    setRunId(null); setMsg(null);
  }, [frame?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (name: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(name); setMsg(null);
    try { await fn(); await mutate(); await refresh('/credits'); if (ok) setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } finally { setBusy(''); }
  };
  const go = (id: string) => router.replace(`/direct/director?frame=${id}`, { scroll: false });

  if (!board) return null;
  if (!all.length) return <Glass><Empty title="Nothing to direct yet">Draw a scene first. Each storyboard frame carries a continuity sheet the AI Director renders from.<div className="mt-4"><Btn variant="primary" href="/write/storyboards">Draw scenes</Btn></div></Empty></Glass>;

  const rendering = BUSY.includes(frame?.render?.status ?? '');
  const rendered = frame?.render?.status === 'ready' ? frame.render.url : undefined;
  const src = show === 'render' && rendered ? rendered : frame?.imageUrl;
  const sceneFrames = all.filter((f) => f.scene === scene);
  const idx = sceneFrames.findIndex((f) => f._id === frameId);
  const castNames = new Set((frame?.cast ?? []).map((c) => c.name.toUpperCase()));

  return (
    <div className="flex flex-wrap items-start gap-4">
      <div className="flex min-w-0 flex-[999_1_620px] flex-col gap-4">
        <Glass>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <Small>Ep {scene?.episodeNumber} · Sc {scene?.sceneNumber} · frame {current?.order} of {sceneFrames.length}</Small>
              <h1 className="truncate text-[24px] font-semibold tracking-[-0.02em]">{frame?.shot || 'Frame'}{frame?.lens ? ` · ${frame.lens}` : ''}</h1>
              <Small>{scene?.heading}</Small>
            </div>
            <div className="flex gap-1.5">
              <Pill on={show === 'render'} onClick={() => setShow('render')} disabled={!rendered}>Realistic</Pill>
              <Pill on={show === 'sketch'} onClick={() => setShow('sketch')}>Sketch</Pill>
            </div>
          </div>
          <div className={clsx('relative mt-4 w-full overflow-hidden rounded-[18px] bg-black', ASPECT_CLASS[(show === 'render' && rendered && frame?.render?.aspect) || '16:9'])}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {src ? <img src={src} alt={`${frame?.shot ?? 'Frame'}: ${frame?.action ?? ''}`} className={clsx('h-full w-full object-cover', show === 'sketch' && 'grayscale')} />
              : <div className="flex h-full items-center justify-center text-t3"><ImageIcon size={26} aria-hidden /></div>}
            {rendering && <div className="absolute inset-0 flex items-center justify-center bg-black/55 text-[15px]" role="status">Rendering…</div>}
          </div>
          {frame?.videoUrl && frame.videoStatus === 'ready' && <video src={frame.videoUrl} controls muted loop playsInline className="mt-3 aspect-video w-full rounded-[14px] bg-black" aria-label="Motion clip" />}
          {frame?.render?.status === 'failed' && <div className="mt-3"><Note>{frame.render.error ?? 'The render failed. Try again.'}</Note></div>}
          {frame?.videoStatus === 'failed' && <div className="mt-3"><Note>{frame.videoError ?? 'The clip failed. Try again.'}</Note></div>}
          {msg && <div className="mt-3"><Note tone={msg.tone}>{msg.text}</Note></div>}
          {runId && <div className="mt-3"><RunChecklist runId={runId} onDone={() => void mutate()} /></div>}
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <Btn disabled={idx <= 0} onClick={() => go(sceneFrames[idx - 1]._id)}>Previous</Btn>
              <Btn disabled={idx < 0 || idx >= sceneFrames.length - 1} onClick={() => go(sceneFrames[idx + 1]._id)}>Next</Btn>
            </div>
            <Btn icon={Star} onClick={() => act('key', () => api.patch(`/direction/frames/${frameId}/key`, { keyFrame: !frame?.keyFrame }))}>{frame?.keyFrame ? 'Key frame' : 'Mark as key frame'}</Btn>
          </div>
        </Glass>

        <Glass>
          <H2>Scene {scene?.sceneNumber}</H2>
          <ul className="mt-3 flex gap-2 overflow-x-auto pb-1">
            {sceneFrames.map((f) => {
              const p = picture(f);
              return (
                <li key={f._id} className="w-36 shrink-0">
                  <button type="button" onClick={() => go(f._id)} aria-current={f._id === frameId ? 'true' : undefined} className={clsx('block w-full overflow-hidden rounded-lg border text-left', f._id === frameId ? 'border-violet' : 'border-white/10')}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {p ? <img src={p} alt="" className={clsx('aspect-video w-full object-cover', !f.render?.url && 'grayscale')} /> : <div className="aspect-video bg-white/[0.05]" />}
                    <span className="block truncate px-2 py-1 text-[12px]">{f.order}. {f.shot}</span>
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-3 max-w-md"><Select label="Jump to scene" value={scene ? `${scene.episodeNumber}:${scene.sceneNumber}` : ''} onChange={(e) => { const s = board.scenes.find((x) => `${x.episodeNumber}:${x.sceneNumber}` === e.target.value); if (s?.frames[0]) go(s.frames[0]._id); }} options={board.scenes.map((s) => ({ value: `${s.episodeNumber}:${s.sceneNumber}`, label: `Ep ${s.episodeNumber}, sc ${s.sceneNumber}: ${s.heading}` }))} /></div>
        </Glass>
      </div>

      <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-4">
        <Glass>
          <H2>AI Director</H2>
          <Small className="mt-1">Renders this frame as a realistic still from its continuity sheet, the locked faces and the location plate.</Small>
          <div className="mt-4 flex flex-col gap-4">
            <Select label="Cinematic style" value={look.preset} onChange={(e) => setLook({ ...look, preset: e.target.value })} options={[{ value: '', label: 'The project\'s style' }, ...STYLE_PRESETS.map((p) => ({ value: p, label: STYLE_PRESET_LABELS[p] }))]} />
            <Chooser label="Lens" value={look.lens} options={LENSES} onPick={(lens) => setLook({ ...look, lens })} />
            <Chooser label="Camera move" value={look.camera} options={CAMERA_MOVES} onPick={(camera) => setLook({ ...look, camera })} />
            <Chooser label="Light" value={look.light} options={LIGHT_LOOKS} onPick={(light) => setLook({ ...look, light })} />
            <Chooser label="Aspect" value={look.aspect} options={FRAME_ASPECTS} onPick={(aspect) => setLook({ ...look, aspect: aspect || '16:9' })} />
          </div>
          <div className="mt-5 flex flex-col gap-2">
            <Btn variant="primary" icon={Sparkles} disabled={!!busy || rendering} onClick={() => act('render', async () => {
              const run = await api.post<{ _id: string }>(`/direction/frames/${frameId}/render`, { ...look, preset: look.preset || undefined, lens: look.lens || undefined, camera: look.camera || undefined, light: look.light || undefined });
              setRunId(run._id); setShow('render');
            })}>{rendering ? 'Rendering…' : rendered ? 'Render again' : 'Render realistic frame'}</Btn>
            <Btn icon={Film} disabled={!!busy || BUSY.includes(frame?.videoStatus ?? '') || (!rendered && frame?.status !== 'approved')} onClick={() => act('clip', () => api.post(`/writers/frames/${frameId}/clip`), 'Making a 5 second clip. It appears above in a few minutes.')}>
              {BUSY.includes(frame?.videoStatus ?? '') ? 'Making clip…' : 'Make motion clip, 5 s'}
            </Btn>
            {!rendered && frame?.status !== 'approved' && <Small>Render the frame, or approve the sketch in Draw scenes, to make a clip.</Small>}
            <Btn icon={Clapperboard} href={`/write/teaser?episode=${scene?.episodeNumber}&scene=${scene?.sceneNumber}`}>Make scene previs video</Btn>
            <Btn icon={Presentation} href="/direct/promos">Promo or pitch deck</Btn>
          </div>
          <Small className="mt-3">A render costs about 25 credits; a clip about 110. The exact cost is charged after and shown in AI credits.</Small>
        </Glass>

        <Glass>
          <H2>Continuity sheet</H2>
          <dl className="mt-3 grid grid-cols-[96px_1fr] gap-x-3 gap-y-2 text-[14px]">
            {(frame?.cast ?? []).map((c) => <div key={c.name} className="contents"><dt className="text-t3">{c.name}</dt><dd>{[c.wardrobe, c.facing].filter(Boolean).join(' · ') || '—'}</dd></div>)}
            <dt className="text-t3">Place</dt><dd>{frame?.location || '—'}</dd>
            <dt className="text-t3">Light</dt><dd>{frame?.light || '—'}</dd>
            <dt className="text-t3">Camera</dt><dd>{[frame?.lens, frame?.camera].filter(Boolean).join(', ') || '—'}</dd>
            <dt className="text-t3">Props</dt><dd>{frame?.props || '—'}</dd>
          </dl>
          <Small className="mt-3">Change the sheet in Draw scenes; the render and the scene video both follow it.</Small>
        </Glass>

        <Glass>
          <H2>Faces</H2>
          <ul className="mt-3 flex flex-col gap-2">
            {(faces ?? []).filter((c) => castNames.has(c.name.toUpperCase())).map((c) => (
              <li key={c._id} className="flex items-center gap-3">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {c.lookImageUrl ? <img src={c.lookImageUrl} alt="" className="h-11 w-11 rounded-full object-cover" /> : <span className="h-11 w-11 rounded-full bg-white/10" />}
                <div className="min-w-0 flex-1"><div className="text-[14px] font-medium">{c.name}</div><Small>{c.soulId ? 'Same face in every frame' : c.lookImageUrl ? 'Casting photo, not trained yet' : 'No face cast yet'}</Small></div>
                {c.soulId && <Chip tone="ok"><Lock size={12} className="mr-1 inline" aria-hidden />Locked</Chip>}
              </li>
            ))}
            {!(frame?.cast ?? []).length && <Small>No one in this frame.</Small>}
          </ul>
        </Glass>
      </div>
    </div>
  );
}

function Chooser({ label, value, options, onPick }: { label: string; value: string; options: readonly string[]; onPick: (v: string) => void }) {
  const custom = value && !options.includes(value);
  return (
    <fieldset>
      <legend className="mb-1.5 text-[13px] text-t3">{label}{custom ? `: ${value}` : ''}</legend>
      <div className="flex flex-wrap gap-1.5">{options.map((o) => <Pill key={o} on={value === o} onClick={() => onPick(value === o ? '' : o)}>{o}</Pill>)}</div>
    </fieldset>
  );
}
