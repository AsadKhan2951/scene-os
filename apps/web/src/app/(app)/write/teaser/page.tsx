'use client';

import clsx from 'clsx';
import { Download, Film, Image as ImageIcon, Sparkles, Trash2 } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useState } from 'react';
import { TEASER_MAX_SECONDS, TEASER_MIN_SECONDS, TEASER_MUSIC, TEASER_MUSIC_LABELS, TEASER_TONES, TEASER_VOICES, label, sceneDurationRange, sceneMarks, shotTiming, teaserTiming } from '@sceneos/shared';
import { WithStory, WriteTabs, useEpisodes, useStory } from '@/components/story';
import { Area, Btn, Chip, Empty, Glass, H2, Input, Note, Pill, Select, Small, type Tone } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import type { Frame, ScriptEpisode, Story, Teaser } from '@/lib/types';

export default function TeaserPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Suspense><TeaserMaker key={story._id} story={story} /></Suspense>}</WithStory></>);
}

const BUSY = ['queued', 'rendering'];
const SHOT: Record<string, { text: string; tone: Tone }> = {
  waiting: { text: 'Waiting', tone: 'idle' }, image: { text: 'Drawing picture', tone: 'ai' }, clip: { text: 'Adding motion', tone: 'ai' },
  done: { text: 'Done', tone: 'ok' }, failed: { text: 'Failed', tone: 'risk' },
};

function TeaserMaker({ story }: { story: Story }) {
  const { data: engines } = useApi<{ images: boolean; audio: boolean }>('/teasers/status');
  const { data: list, mutate: mutateList } = useApi<Teaser[]>(`/teasers?storyId=${story._id}`);
  const [id, setId] = useState<string | null>(null);
  const currentId = id ?? list?.[0]?._id ?? null;
  // While a teaser is being made, check on it every few seconds.
  const { data: teaser, mutate } = useApi<Teaser>(currentId ? `/teasers/${currentId}` : null, { refreshInterval: (t) => (t && BUSY.includes(t.status) ? 4000 : 0) });

  // What the video is made from: one storyboard scene (the default), or the whole story as a promo.
  const params = useSearchParams();
  const [mode, setMode] = useState<'scene' | 'story'>('scene');
  const { episodes, episode: listed, select } = useEpisodes(story._id);
  const { data: episode } = useApi<ScriptEpisode>(listed ? `/writers/episodes/${listed._id}` : null);
  const { data: frames } = useApi<Frame[]>(listed ? `/writers/episodes/${listed._id}/frames` : null);
  const [sceneNo, setSceneNo] = useState<number | null>(null);
  useEffect(() => { const e = Number(params.get('episode')); const s = Number(params.get('scene')); if (e) select(e); if (s) setSceneNo(s); }, []); // eslint-disable-line react-hooks/exhaustive-deps
  const usable = (frames ?? []).filter((f) => ['approved', 'needs_review', 'needs_image'].includes(f.status));
  const headings = episode ? sceneMarks(episode.content) : [];
  const drawnScenes = [...new Set(usable.map((f) => f.sceneNumber))].sort((a, b) => a - b);
  const scene = drawnScenes.includes(sceneNo ?? -1) ? sceneNo! : drawnScenes[0];
  const sceneFrames = usable.filter((f) => f.sceneNumber === scene);
  const range = sceneDurationRange(Math.max(1, sceneFrames.length));

  // The questions asked before anything is planned.
  const [q, setQ] = useState({ durationSeconds: 30, tone: 'emotional', music: 'soft_piano_strings', musicNotes: '', voiceOver: false, voice: 'female', voiceLanguage: 'urdu', endLine: '' });
  // Suggest five seconds a frame whenever a different scene is chosen.
  useEffect(() => { if (mode === 'scene' && sceneFrames.length) setQ((old) => ({ ...old, durationSeconds: range.suggested })); }, [mode, scene, sceneFrames.length]); // eslint-disable-line react-hooks/exhaustive-deps
  const [plan, setPlan] = useState<Pick<Teaser, 'characters' | 'shots' | 'voiceOverScript' | 'musicPrompt'> | null>(null);
  const [busy, setBusy] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);

  // Load the plan into the editor when a different teaser is opened or it stops rendering.
  useEffect(() => {
    if (teaser) setPlan({ characters: teaser.characters, shots: teaser.shots, voiceOverScript: teaser.voiceOverScript, musicPrompt: teaser.musicPrompt });
    else setPlan(null);
  }, [teaser?._id, teaser?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(name: string, fn: () => Promise<unknown>, ok?: string) {
    setBusy(name); setMsg(null);
    try { await fn(); await Promise.all([mutate(), mutateList()]); if (ok) setMsg({ tone: 'ok', text: ok }); }
    catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } finally { setBusy(''); }
  }
  const sceneMode = mode === 'scene';
  const timing = sceneMode ? { shots: sceneFrames.length, ...shotTiming(q.durationSeconds, Math.max(1, sceneFrames.length)) } : teaserTiming(q.durationSeconds);
  const minSeconds = sceneMode ? range.min : TEASER_MIN_SECONDS;
  const maxSeconds = sceneMode ? range.max : TEASER_MAX_SECONDS;
  const durationOk = q.durationSeconds >= minSeconds && q.durationSeconds <= maxSeconds;
  const canPlan = sceneMode ? sceneFrames.length > 0 : Boolean(story.oneLiner);
  const makePlan = () => run('plan', async () => {
    const t = await api.post<Teaser>('/teasers', { storyId: story._id, ...(sceneMode && listed ? { scriptEpisodeId: listed._id, sceneNumber: scene } : {}), ...q, musicNotes: q.musicNotes || undefined, endLine: q.endLine || undefined });
    setId(t._id);
  }, 'Plan ready. Read it, change anything you like, then make the video.');
  const dirty = !!teaser && !!plan && JSON.stringify(plan) !== JSON.stringify({ characters: teaser.characters, shots: teaser.shots, voiceOverScript: teaser.voiceOverScript, musicPrompt: teaser.musicPrompt });
  const savePlan = () => teaser && plan && api.patch(`/teasers/${teaser._id}`, { characters: plan.characters, shots: plan.shots.map((s) => ({ visual: s.visual, motion: s.motion })), voiceOverScript: plan.voiceOverScript, musicPrompt: plan.musicPrompt });
  const render = () => teaser && run('render', async () => { if (dirty) await savePlan(); await api.post(`/teasers/${teaser._id}/render`); }, 'Started. You can leave this page; the video keeps being made.');

  const rendering = !!teaser && BUSY.includes(teaser.status);
  const done = teaser?.shots.filter((s) => s.status === 'done').length ?? 0;
  const toDraw = teaser?.shots.filter((s) => !s.clipUrl).length ?? 0;
  const set = <K extends keyof typeof q>(k: K, v: (typeof q)[K]) => setQ({ ...q, [k]: v });

  return (
    <div className="flex flex-wrap items-start gap-4">
      {/* The questions */}
      <Glass className="min-w-0 flex-[1_1_300px] p-[22px]">
        <H2>New video</H2>
        <Small className="mb-4 mt-1 text-t2">{sceneMode ? 'Turns a storyboard scene into a realistic video, frame for frame, so everyone can see how the scene will look on screen.' : `A short promo for ${story.title}, with shots chosen by AI from the whole story.`}</Small>
        <div className="flex flex-col gap-4">
          <fieldset><legend className="mb-1.5 text-[13px] text-t2">What should the video show?</legend><div className="flex flex-wrap gap-1.5"><Pill on={sceneMode} onClick={() => setMode('scene')}>A storyboard scene</Pill><Pill on={!sceneMode} onClick={() => setMode('story')}>The whole story (promo)</Pill></div></fieldset>
          {sceneMode && (
            <>
              {episodes && episodes.length > 0 && <Select label="Episode" value={listed?.number ?? ''} onChange={(e) => { select(Number(e.target.value)); setSceneNo(null); }} options={episodes.map((e) => ({ value: String(e.number), label: `Episode ${e.number}${e.title ? `, ${e.title}` : ''}` }))} />}
              {drawnScenes.length > 0
                ? <Select label="Scene" value={scene ?? ''} onChange={(e) => setSceneNo(Number(e.target.value))} options={drawnScenes.map((n) => ({ value: String(n), label: `Scene ${n}${headings.find((h) => h.number === n) ? `, ${headings.find((h) => h.number === n)!.heading}` : ''}` }))} />
                : <Note tone="warn">This episode has no storyboard frames yet. Draw a scene in Storyboards first.</Note>}
              {sceneFrames.length > 0 && <Small>{sceneFrames.length} storyboard frame{sceneFrames.length === 1 ? '' : 's'} in this scene. The video follows them in the same order.</Small>}
            </>
          )}
          <div>
            <Input label={`How long, in seconds? (${minSeconds} to ${maxSeconds})`} type="number" min={minSeconds} max={maxSeconds} value={q.durationSeconds} onChange={(e) => set('durationSeconds', Number(e.target.value))} />
            {durationOk ? <Small className="mt-1.5">{timing.shots} shots of about {timing.shotSeconds} seconds, then the title.</Small> : <Small className="mt-1.5 text-risk">Choose between {minSeconds} and {maxSeconds} seconds.</Small>}
          </div>
          <fieldset><legend className="mb-1.5 text-[13px] text-t2">What should it feel like?</legend><div className="flex flex-wrap gap-1.5">{TEASER_TONES.map((t) => <Pill key={t} on={q.tone === t} onClick={() => set('tone', t)}>{label(t)}</Pill>)}</div></fieldset>
          <Select label="What kind of music?" value={q.music} onChange={(e) => set('music', e.target.value)} options={TEASER_MUSIC.map((m) => ({ value: m, label: TEASER_MUSIC_LABELS[m] }))} />
          {q.music !== 'no_music' && <Input label="Anything specific about the music? (optional)" value={q.musicNotes} onChange={(e) => set('musicNotes', e.target.value)} placeholder="For example: slow, sad, builds at the end" maxLength={300} />}
          <fieldset><legend className="mb-1.5 text-[13px] text-t2">Voice-over?</legend><div className="flex flex-wrap gap-1.5"><Pill on={q.voiceOver} onClick={() => set('voiceOver', true)}>Yes, with a narrator</Pill><Pill on={!q.voiceOver} onClick={() => set('voiceOver', false)}>No voice-over</Pill></div></fieldset>
          {q.voiceOver && (
            <div className="grid grid-cols-2 gap-3">
              <Select label="Narrator" value={q.voice} onChange={(e) => set('voice', e.target.value)} options={TEASER_VOICES.map((v) => ({ value: v, label: `${label(v)} voice` }))} />
              <Select label="Language" value={q.voiceLanguage} onChange={(e) => set('voiceLanguage', e.target.value)} options={[{ value: 'urdu', label: 'Urdu' }, { value: 'english', label: 'English' }]} />
            </div>
          )}
          <Input label="Line under the title (optional)" value={q.endLine} onChange={(e) => set('endLine', e.target.value)} placeholder="Jald aa raha hai" maxLength={80} />
          <Btn variant="primary" icon={Sparkles} disabled={!!busy || !durationOk || !canPlan} onClick={makePlan} className="w-full">{busy === 'plan' ? 'Planning…' : 'Plan the video'}</Btn>
          {!sceneMode && !story.oneLiner && <Small className="text-warn">Write the one-liner first. The promo is planned from it.</Small>}
          <Small>Planning is free of picture credits. Nothing is drawn until you press Make video.</Small>
        </div>
        {list && list.length > 1 && (
          <div className="mt-5 border-t border-white/10 pt-4">
            <Small className="mb-2">Earlier videos</Small>
            <div className="flex flex-col gap-1.5">{list.map((t) => (
              <button key={t._id} type="button" aria-pressed={currentId === t._id} onClick={() => { setId(t._id); setMsg(null); }} className={clsx('flex min-h-[44px] items-center justify-between gap-2 rounded-[14px] border px-3 text-left text-sm', currentId === t._id ? 'border-violet/55 bg-violet/20' : 'sub')}>
                <span>{t.sceneNumber ? `Scene ${t.sceneNumber}` : 'Story promo'}, {t.durationSeconds} seconds</span><Small>{day(t.createdAt)}</Small>
              </button>
            ))}</div>
          </div>
        )}
      </Glass>

      {/* The plan */}
      <Glass className="min-w-0 flex-[999_1_520px]">
        {!teaser || !plan ? <Empty title="No video yet">Choose a storyboard scene, answer the questions and plan the video. You review every shot and the music before anything is made.</Empty> : (
          <>
            <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
              <div><h1 className="text-[26px] font-semibold tracking-[-0.02em]">{teaser.sceneNumber ? `Scene ${teaser.sceneNumber}, ${teaser.durationSeconds} seconds` : `Story promo, ${teaser.durationSeconds} seconds`}</h1>{teaser.sceneHeading && <Small>{teaser.sceneHeading}</Small>}<Small>{label(teaser.tone)}, {TEASER_MUSIC_LABELS[teaser.music as keyof typeof TEASER_MUSIC_LABELS].toLowerCase()}, {teaser.voiceOver ? `${teaser.voice} ${teaser.voiceLanguage} narrator` : 'no voice-over'}</Small></div>
              <Chip tone={teaser.status === 'ready' ? 'ok' : teaser.status === 'failed' ? 'risk' : rendering ? 'ai' : 'info'}>{rendering ? (teaser.step ?? 'Working') : teaser.status === 'planned' ? 'Plan to review' : label(teaser.status)}</Chip>
            </div>
            {msg && <div className="mb-4"><Note tone={msg.tone}>{msg.text}</Note></div>}
            {teaser.status === 'failed' && teaser.error && <div className="mb-4"><Note>{teaser.error}</Note></div>}

            <fieldset disabled={rendering} className="min-w-0">
              <H2>Shots</H2><Small className="mb-3 mt-1">{teaser.sceneNumber ? 'One shot for each storyboard frame, in the same order. ' : ''}Each shot becomes one realistic picture, then a short moving clip. Changing a shot redraws only that shot.</Small>
              <div className="grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(250px,1fr))]">
                {plan.shots.map((s, i) => {
                  const live = teaser.shots[i];
                  const st = SHOT[live?.status ?? 'waiting'];
                  return (
                    <article key={i} className="sub flex flex-col gap-2.5 rounded-[20px] p-3">
                      {live?.clipUrl ? <video src={live.clipUrl} poster={live.imageUrl} controls muted loop playsInline className="aspect-video w-full rounded-[14px] bg-black object-cover" aria-label={`Clip for shot ${i + 1}`} />
                        : live?.imageUrl
                          // eslint-disable-next-line @next/next/no-img-element
                          ? <img src={live.imageUrl} alt={`Shot ${i + 1}`} className="aspect-video w-full rounded-[14px] object-cover" />
                          : <div className="flex aspect-video flex-col items-center justify-center gap-2 rounded-[14px] border border-dashed border-white/30 bg-white/[0.04] text-[13px] text-t2"><ImageIcon size={22} aria-hidden />Not drawn yet</div>}
                      <div className="flex items-center justify-between gap-2"><span className="text-[15px] font-semibold">{teaser.sceneNumber ? `Frame ${i + 1}` : `Shot ${i + 1}`}</span><Chip tone={st.tone}>{st.text}</Chip></div>
                      {live?.error && <Small className="text-risk">{live.error}</Small>}
                      <Area label="What we see" rows={4} value={s.visual} onChange={(e) => setPlan({ ...plan, shots: plan.shots.map((x, j) => (j === i ? { ...x, visual: e.target.value } : x)) })} />
                      <Input label="How it moves" value={s.motion} onChange={(e) => setPlan({ ...plan, shots: plan.shots.map((x, j) => (j === i ? { ...x, motion: e.target.value } : x)) })} />
                    </article>
                  );
                })}
              </div>

              <H2 className="mt-6">Characters</H2><Small className="mb-3 mt-1">AI-made faces. The same description is used in every shot so each person looks the same. Changing one redraws every shot.</Small>
              <div className="flex flex-col gap-3">{plan.characters.map((c, i) => <Area key={c.name} label={c.name} rows={3} value={c.look} onChange={(e) => setPlan({ ...plan, characters: plan.characters.map((x, j) => (j === i ? { ...x, look: e.target.value } : x)) })} />)}</div>

              {teaser.voiceOver && <div className="mt-6"><Area label={`Voice-over, ${teaser.voice} narrator`} dir="auto" rows={5} value={plan.voiceOverScript} onChange={(e) => setPlan({ ...plan, voiceOverScript: e.target.value })} className={teaser.voiceLanguage === 'urdu' ? 'font-urdu text-lg leading-[2.2]' : ''} /></div>}
              {teaser.music !== 'no_music' && <div className="mt-4"><Area label="Music brief" rows={2} value={plan.musicPrompt} onChange={(e) => setPlan({ ...plan, musicPrompt: e.target.value })} /></div>}
            </fieldset>

            <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-white/10 pt-[18px]">
              <Btn variant="danger" icon={Trash2} disabled={!!busy || rendering} onClick={() => run('delete', async () => { await api.del(`/teasers/${teaser._id}`); setId(null); })}>Delete video</Btn>
              <div className="flex flex-wrap gap-2.5">
                {dirty && !rendering && <Btn disabled={!!busy} onClick={() => run('save', async () => { await savePlan(); }, 'Changes saved.')}>Save changes</Btn>}
                <Btn variant="primary" icon={Film} disabled={!!busy || rendering || !engines?.images} onClick={render}>{rendering ? `Making, ${done} of ${teaser.shots.length} shots done` : teaser.hasVideo ? (toDraw || dirty ? 'Remake video' : 'Remake sound and cut') : 'Make video'}</Btn>
              </div>
            </div>
            {!rendering && <Small className="mt-3 text-right">{toDraw || dirty ? `Making it draws ${dirty ? 'the changed shots' : `${toDraw} shot${toDraw === 1 ? '' : 's'}`} (a picture and a clip each) and uses Higgsfield credits. It takes about 10 to 15 minutes.` : 'All shots are already made, so this only redoes the sound and the cut.'}</Small>}
          </>
        )}
      </Glass>

      {/* The result */}
      <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
        <Glass className="p-[22px]">
          <H2>Finished video</H2>
          {teaser?.hasVideo ? (
            <>
              <video key={teaser.result?.renderedAt} src={`/api/teasers/${teaser._id}/video?v=${encodeURIComponent(teaser.result?.renderedAt ?? '')}`} controls playsInline className="mt-3 aspect-video w-full rounded-[14px] bg-black" aria-label="Teaser video" />
              <div className="mt-3 flex flex-wrap items-center gap-2"><Chip tone={teaser.result?.hasVoiceOver ? 'ok' : 'idle'}>{teaser.result?.hasVoiceOver ? 'Voice-over' : 'No voice-over'}</Chip><Chip tone={teaser.result?.hasMusic ? 'ok' : 'idle'}>{teaser.result?.hasMusic ? 'Music' : 'No music'}</Chip></div>
              {teaser.result?.notes?.map((n) => <Small key={n} className="mt-2 text-warn">{n}</Small>)}
              <a href={`/api/teasers/${teaser._id}/video?download=1`} className="mt-3 inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.07] px-[18px] text-sm font-medium"><Download size={16} aria-hidden />Download MP4</a>
            </>
          ) : <Small className="mt-2 text-t2">{rendering ? 'The finished video appears here.' : 'Nothing made yet.'}</Small>}
        </Glass>
        <Glass className="p-[22px]">
          <H2>What is connected</H2>
          <div className="mt-3 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2"><span className="text-[15px]">Pictures and clips</span><Chip tone={engines?.images ? 'ok' : 'risk'}>{engines?.images ? 'Connected' : 'Not set up'}</Chip></div>
            <div className="flex items-center justify-between gap-2"><span className="text-[15px]">Voice-over and music</span><Chip tone={engines?.audio ? 'ok' : 'warn'}>{engines?.audio ? 'Connected' : 'Not set up'}</Chip></div>
          </div>
          {engines && !engines.audio && <Small className="mt-3 text-warn">Without the sound service, the video is made silent. The narration and music brief are still planned and saved.</Small>}
          <Small className="mt-3">Characters are AI-made and are not real actors. The picture follows each frame's description; it is not traced from the sketch. This is a planning preview, not broadcast material.</Small>
        </Glass>
      </div>
    </div>
  );
}
