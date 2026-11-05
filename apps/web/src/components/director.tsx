'use client';

import clsx from 'clsx';
import { Clapperboard, Film, Presentation, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { CAMERA_MOVES, FRAME_ASPECTS, LENSES, LIGHT_LOOKS, STYLE_PRESETS, STYLE_PRESET_LABELS, shotSizeOf } from '@sceneos/shared';
import { RunChecklist } from './run';
import { Btn, Note, Small } from './ui';
import { api, errorText, refresh } from '@/lib/api';
import type { Frame } from '@/lib/types';

const BUSY = ['queued', 'drawing'];

/** "3.2 · CU 85mm": scene and frame number, shot size and focal length, as on a paper storyboard. */
export function frameLabel(f: Pick<Frame, 'sceneNumber' | 'order' | 'shot' | 'lens'>) {
  const size = shotSizeOf(f.shot) || (f.shot ?? '').split(/[,;]/)[0].slice(0, 18);
  const mm = (f.lens ?? '').match(/\d+\s?mm/i)?.[0].replace(/\s/g, '') ?? '';
  return `${f.sceneNumber}.${f.order} · ${[size, mm].filter(Boolean).join(' ')}`.trim();
}

function Choice({ label, value, options, onChange }: { label: string; value: string; options: readonly string[]; onChange: (v: string) => void }) {
  const known = !value || options.includes(value);
  return (
    <label className="flex min-w-0 flex-col gap-1.5 text-[13px] text-t3">
      {label}
      <select className="field" value={value} onChange={(e) => onChange(e.target.value)}>
        <option value="">As the frame says</option>
        {!known && <option value={value}>{value}</option>}
        {options.map((o) => <option key={o} value={o}>{o}</option>)}
      </select>
    </label>
  );
}

/**
 * The AI Director's controls for one frame: cinematic style, lens, camera move, light and aspect,
 * then render, motion clip, scene previs and promo. Shared by the Storyboard and AI Director screens.
 */
export function DirectorControls({ frame, episodeNumber, onChanged }: { frame: Frame; episodeNumber?: number; onChanged: () => void }) {
  const [look, setLook] = useState({ preset: '', lens: '', camera: '', light: '', aspect: '16:9' });
  const [runId, setRunId] = useState<string | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);
  useEffect(() => {
    const r = frame.render;
    setLook({ preset: r?.preset ?? '', lens: r?.lens ?? '', camera: r?.camera ?? '', light: r?.light ?? '', aspect: r?.aspect ?? '16:9' });
    setRunId(null); setMsg(null);
  }, [frame._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = async (name: string, fn: () => Promise<unknown>, ok?: string) => {
    setBusy(name); setMsg(null);
    try { await fn(); onChanged(); await refresh('/credits'); if (ok) setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } finally { setBusy(''); }
  };
  const rendering = BUSY.includes(frame.render?.status ?? '');
  const rendered = frame.render?.status === 'ready' && !!frame.render.url;
  const clipping = BUSY.includes(frame.videoStatus ?? '');

  return (
    <div className="flex flex-col gap-4">
      <fieldset>
        <legend className="mb-1.5 text-[13px] text-t3">Cinematic style</legend>
        <div className="flex flex-wrap gap-1.5">
          {STYLE_PRESETS.map((p) => (
            <button key={p} type="button" aria-pressed={look.preset === p} onClick={() => setLook({ ...look, preset: look.preset === p ? '' : p })}
              className={clsx('min-h-[40px] rounded-full border px-3.5 text-[13px] font-medium', look.preset === p ? 'border-violet/60 bg-violet/25 text-white' : 'border-white/10 bg-white/[0.04] text-t2 hover:text-white')}>
              {STYLE_PRESET_LABELS[p]}
            </button>
          ))}
        </div>
        <Small className="mt-1">{look.preset ? '' : 'None chosen: the project\'s own style is used.'}</Small>
      </fieldset>
      <div className="grid grid-cols-2 gap-3">
        <Choice label="Lens" value={look.lens} options={LENSES} onChange={(lens) => setLook({ ...look, lens })} />
        <Choice label="Camera move" value={look.camera} options={CAMERA_MOVES} onChange={(camera) => setLook({ ...look, camera })} />
        <Choice label="Light" value={look.light} options={LIGHT_LOOKS} onChange={(light) => setLook({ ...look, light })} />
        <label className="flex min-w-0 flex-col gap-1.5 text-[13px] text-t3">Aspect
          <select className="field" value={look.aspect} onChange={(e) => setLook({ ...look, aspect: e.target.value })}>{FRAME_ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}</select>
        </label>
      </div>
      <div className="flex flex-col gap-2">
        <Btn variant="primary" icon={Sparkles} disabled={!!busy || rendering} onClick={() => act('render', async () => {
          const run = await api.post<{ _id: string }>(`/direction/frames/${frame._id}/render`, { aspect: look.aspect, preset: look.preset || undefined, lens: look.lens || undefined, camera: look.camera || undefined, light: look.light || undefined });
          setRunId(run._id);
        })}>{rendering ? 'Rendering…' : rendered ? 'Render again' : 'Render realistic frame'}</Btn>
        <Btn icon={Film} disabled={!!busy || clipping || (!rendered && frame.status !== 'approved')} onClick={() => act('clip', () => api.post(`/writers/frames/${frame._id}/clip`), 'Making a 5 second clip. It appears with the frame in a few minutes.')}>
          {clipping ? 'Making clip…' : 'Make motion clip, 5 s'}
        </Btn>
        <Btn icon={Clapperboard} href={`/write/teaser?${episodeNumber ? `episode=${episodeNumber}&` : ''}scene=${frame.sceneNumber}`}>Make scene previs video</Btn>
        <Btn icon={Presentation} href="/direct/promos">Promo or pitch deck</Btn>
      </div>
      {!rendered && frame.status !== 'approved' && <Small>Render the frame, or approve its sketch in Draw scenes, before making a clip.</Small>}
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      {runId && <RunChecklist runId={runId} onDone={() => { setRunId(null); onChanged(); }} />}
      {!rendering && frame.render?.error && <Note>{`The last render failed: ${frame.render.error}`}</Note>}
      <Small>Scene AI reads the continuity sheet, the locked cast faces and the location plate, so every render matches the scene. A render is about 25 credits, a clip about 110.</Small>
    </div>
  );
}
