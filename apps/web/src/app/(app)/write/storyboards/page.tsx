'use client';

import clsx from 'clsx';
import { Check, Film, Image as ImageIcon, RefreshCw, Sparkles } from 'lucide-react';
import { useState } from 'react';
import { label } from '@sceneos/shared';
import { WithStory, WriteTabs, scenes, useEpisodes, useStory } from '@/components/story';
import { Area, Btn, Chip, Empty, Glass, H2, Note, Select, Small } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { tone } from '@/lib/format';
import type { Frame, ScriptEpisode, Story } from '@/lib/types';

export default function StoryboardsPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Storyboards key={story._id} story={story} />}</WithStory></>);
}

const BUSY = ['queued', 'drawing'];

function Storyboards({ story }: { story: Story }) {
  const { episodes, episode: listed, select } = useEpisodes(story._id);
  const { data: episode } = useApi<ScriptEpisode>(listed ? `/writers/episodes/${listed._id}` : null);
  // Poll while the worker is drawing so new frames appear on their own.
  const { data: frames, mutate } = useApi<Frame[]>(listed ? `/writers/episodes/${listed._id}/frames` : null, { refreshInterval: (d) => (d?.some((f) => BUSY.includes(f.status) || BUSY.includes(f.videoStatus ?? '')) || waiting ? 4000 : 0) });
  const { data: engine } = useApi<{ images: boolean }>('/writers/storyboards/status');
  const [waiting, setWaiting] = useState(false);
  const [sceneNo, setSceneNo] = useState<number | null>(null);
  const [frameId, setFrameId] = useState<string | null>(null);
  const [note, setNote] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);

  const list = episode ? scenes(episode.content) : [];
  const sceneList = list.length ? list : episode?.content ? [{ number: 1, heading: 'From the story text' }] : [];
  const scene = sceneList.find((s) => s.number === sceneNo) ?? sceneList[0];
  const sceneFrames = frames?.filter((f) => f.sceneNumber === scene?.number) ?? [];
  const frame = sceneFrames.find((f) => f._id === frameId);

  async function run(fn: () => Promise<unknown>, ok?: string) { setMsg(null); try { await fn(); await mutate(); if (ok) setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } }
  // After a scene is queued, keep checking for a couple of minutes even though no frame exists yet.
  const draw = () => listed && scene && run(async () => { await api.post('/writers/storyboards/generate', { scriptEpisodeId: listed._id, sceneNumber: scene.number }); setWaiting(true); setTimeout(() => setWaiting(false), 150_000); }, 'Drawing started. Frames appear here as they finish.');
  const redraw = (f: Frame) => run(async () => { if (note.trim()) await api.patch(`/writers/frames/${f._id}`, { redrawNote: note.trim() }); await api.post(`/writers/frames/${f._id}/redraw`); }, 'Redrawing this frame.');
  const clip = (f: Frame) => run(() => api.post(`/writers/frames/${f._id}/clip`), 'Making the motion clip. This usually takes a few minutes.');
  const setStatus = (f: Frame, status: 'approved' | 'needs_review') => run(() => api.patch(`/writers/frames/${f._id}`, { status }));

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[1_1_270px] p-5">
        {episodes && episodes.length > 0 && <Select label="Episode" value={listed?.number ?? ''} onChange={(e) => select(Number(e.target.value))} options={episodes.map((e) => ({ value: String(e.number), label: `Episode ${e.number}${e.title ? `, ${e.title}` : ''}` }))} />}
        <H2 className="mt-5">Scenes</H2>
        {sceneList.length === 0 && <Small className="mt-2">This episode has no script yet. Write it first.</Small>}
        <div className="mt-3 flex flex-col gap-2">
          {sceneList.map((s) => {
            const fs = frames?.filter((f) => f.sceneNumber === s.number) ?? [];
            const approved = fs.filter((f) => f.status === 'approved').length;
            return (
              <button key={s.number} type="button" aria-pressed={scene?.number === s.number} onClick={() => setSceneNo(s.number)} className={clsx('min-h-[44px] w-full rounded-2xl border px-3.5 py-3 text-left', scene?.number === s.number ? 'border-violet/55 bg-violet/20' : 'sub')}>
                <span className="block text-[15px] font-medium">{s.number}. {s.heading}</span>
                <span className="mt-2 block"><Chip tone={fs.length === 0 ? 'idle' : approved === fs.length ? 'ok' : 'warn'}>{fs.length === 0 ? 'Not started' : `${approved} of ${fs.length} approved`}</Chip></span>
              </button>
            );
          })}
        </div>
        <Small className="mt-3">Frames are drawn one scene at a time so you can review as you go.</Small>
      </Glass>

      <Glass className="min-w-0 flex-[999_1_560px]">
        {!scene ? <Empty title="Nothing to storyboard yet">Write the episode script, then come back to draw its scenes.</Empty> : (
          <>
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3">
              <div><h1 className="text-[26px] font-semibold tracking-[-0.02em]">Scene {scene.number}</h1><Small>{scene.heading}</Small></div>
              <div className="flex flex-wrap gap-2.5">
                {sceneFrames.length > 0 && listed && <Btn icon={Film} href={`/write/teaser?episode=${listed.number}&scene=${scene.number}`}>Make realistic video of this scene</Btn>}
                <Btn variant="primary" icon={Sparkles} onClick={draw}>{sceneFrames.length ? 'Redraw unapproved frames' : 'Draw this scene'}</Btn>
              </div>
            </div>
            {msg && <div className="mb-4"><Note tone={msg.tone}>{msg.text}</Note></div>}
            {sceneFrames.length === 0 ? <Empty title="No frames for this scene">Draw the scene to get three to six frames.</Empty> : (
              <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                {sceneFrames.map((f) => (
                  <article key={f._id} className={clsx('flex flex-col gap-2.5 rounded-[20px] border p-3', frameId === f._id ? 'border-violet/60 bg-white/[0.08]' : 'sub')}>
                    <button type="button" onClick={() => setFrameId(f._id)} aria-label={`Select frame ${f.order}`} className="block">
                      {f.videoUrl && f.videoStatus === 'ready'
                        ? <video src={f.videoUrl} poster={f.imageUrl} controls loop muted playsInline className="aspect-video w-full rounded-[14px] bg-black object-cover" aria-label={`Motion clip for frame ${f.order}`} />
                        : f.imageUrl
                        // eslint-disable-next-line @next/next/no-img-element
                        ? <img src={f.imageUrl} alt={f.action ?? `Frame ${f.order}`} className="aspect-video w-full rounded-[14px] object-cover" />
                        : <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-white/30 bg-white/[0.04] p-4 text-center text-[13px] text-t2"><ImageIcon size={22} aria-hidden />{f.status === 'needs_image' ? 'No image yet. Higgsfield is not set up on the server.' : f.status === 'failed' ? (f.error ?? 'Drawing failed') : f.status === 'queued' ? 'Waiting to be drawn' : 'Drawing this frame'}</div>}
                    </button>
                    <div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[15px] font-semibold">Frame {f.order}{f.shot ? `, ${f.shot}` : ''}</span><Chip tone={tone(f.status)}>{label(f.status)}</Chip></div>
                    <div dir="auto" className="text-sm leading-normal text-t2">{f.action}</div>
                    {f.dialogue && <div dir="auto" className="text-sm italic">“{f.dialogue}”</div>}
                    {f.status !== 'approved' && !BUSY.includes(f.status) && f.status !== 'failed' && <Btn icon={Check} onClick={() => setStatus(f, 'approved')}>Approve frame</Btn>}
                    {f.status === 'approved' && f.imageUrl && engine?.images && (
                      BUSY.includes(f.videoStatus ?? '')
                        ? <Chip tone="ai">Making motion clip</Chip>
                        : <Btn icon={Film} onClick={() => clip(f)}>{f.videoStatus === 'ready' ? 'Remake motion clip' : 'Make motion clip'}</Btn>
                    )}
                    {f.videoStatus === 'failed' && <Small className="text-risk">{f.videoError ?? 'The clip could not be made.'}</Small>}
                  </article>
                ))}
              </div>
            )}
          </>
        )}
      </Glass>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <Glass className="p-[22px]">
          <H2>{frame ? `Frame ${frame.order}` : 'Frame notes'}</H2>
          {!frame ? <Small className="mt-2">Select a frame to leave a note or change its approval.</Small> : (
            <div className="mt-3 flex flex-col gap-3">
              <Area label="What should change?" value={note} onChange={(e) => setNote(e.target.value)} placeholder="For example: tighter on her eyes, morning light from the left" />
              {engine?.images
                ? <Btn icon={RefreshCw} disabled={BUSY.includes(frame.status)} onClick={() => redraw(frame)}>{note.trim() ? 'Redraw with this note' : 'Redraw frame'}</Btn>
                : <Btn disabled={!note.trim()} onClick={() => run(() => api.patch(`/writers/frames/${frame._id}`, { redrawNote: note.trim(), status: 'needs_review' }), 'Note saved on the frame.')}>Save note</Btn>}
              {frame.status === 'approved' && <Btn onClick={() => setStatus(frame, 'needs_review')}>Remove approval</Btn>}
            </div>
          )}
        </Glass>
        <Glass className="p-[22px]"><H2>About the frames</H2><Small className="mt-2 text-t2">Frames are hand-drawn style planning references, not final art. {engine?.images ? 'Approve a frame to make a short motion clip from it. Each image and clip uses Higgsfield credits.' : 'Higgsfield is not set up on the server yet, so each frame shows its shot, action and dialogue without a picture.'}</Small>{frames?.some((f) => f.imageUrl && !f.filesPermanent) && <Small className="mt-2 text-warn">Pictures and clips are stored at Higgsfield for a limited time. Set up file storage on the server to keep them.</Small>}</Glass>
      </div>
    </div>
  );
}
