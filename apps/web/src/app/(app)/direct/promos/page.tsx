'use client';

import clsx from 'clsx';
import { Check, Download, FileText, Mic, Play, Sparkles, Square, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { PITCH_AUDIENCES, PITCH_AUDIENCE_LABELS, PROMO_ASPECTS, TEASER_MUSIC_LABELS, label, type PitchAudience } from '@sceneos/shared';
import { useDictation } from '@/components/dictation';
import { SlideCard } from '@/components/pitch';
import { RunChecklist } from '@/components/run';
import { useApp } from '@/components/shell';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Area, Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, Pill, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import type { PitchDeck, PitchSlide, Story, Teaser } from '@/lib/types';

export default function PromosPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Promos key={story._id} story={story} />}</WithStory></>);
}

function Promos({ story }: { story: Story }) {
  return (
    <>
      <div>
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Pitch it before you shoot it.</h1>
        <p className="mt-1.5 text-base text-t2">Promos, teasers and pitch decks made from the storyboard, the characters and the look book.</p>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <TeaserCard story={story} />
        <Pitch story={story} />
      </div>
      <Concept />
    </>
  );
}

const kindOf = (t: Teaser) => (t.frameIds?.length ? (t.sceneHeading?.replace(/^Promo from /, '') ?? `${t.frameIds.length} key frames`) : t.sceneNumber ? `Scene ${t.sceneNumber} storyboard` : 'The idea (concept promo)');
const VIDEO_SHAPE: Record<string, string> = { '9:16': 'aspect-[9/16] max-h-[420px] mx-auto', '1:1': 'aspect-square max-h-[420px] mx-auto', '2.39:1': 'aspect-[2.39/1]', '16:9': 'aspect-video' };

/** The latest promo: player, what it was built from, and a new cut. Older cuts are one click away. */
function TeaserCard({ story }: { story: Story }) {
  const { data: list } = useApi<Teaser[]>(`/teasers?storyId=${story._id}`);
  const [id, setId] = useState<string | null>(null);
  const t = list?.find((x) => x._id === id) ?? list?.find((x) => x.status === 'ready') ?? list?.[0];
  return (
    <Glass className="min-w-0 flex-[1_1_420px]">
      <div className="flex items-center justify-between gap-2">
        <H2>Teaser</H2>
        {t && <Chip tone={t.status === 'ready' ? 'ok' : t.status === 'failed' ? 'risk' : t.status === 'planned' ? 'info' : 'ai'}>{t.status === 'ready' ? <><Check size={12} className="mr-1 inline" aria-hidden />Ready · {t.durationSeconds} s</> : t.status === 'planned' ? 'Plan to review' : label(t.status)}</Chip>}
      </div>
      {!t ? <div className="mt-3"><Empty title="No promo yet">Cut one from the key frames of the storyboard, or make a concept promo from the idea below.</Empty></div> : (
        <>
          <div className={clsx('relative mt-3 w-full overflow-hidden rounded-[18px] bg-black', VIDEO_SHAPE[t.aspect ?? '16:9'])}>
            {t.status === 'ready'
              ? <video key={t._id} src={`/api/teasers/${t._id}/video`} controls playsInline preload="metadata" className="h-full w-full" aria-label="Promo video" />
              // eslint-disable-next-line @next/next/no-img-element
              : t.shots[0]?.imageUrl ? <img src={t.shots[0].imageUrl} alt="" className="h-full w-full object-cover opacity-70" /> : <div className="flex h-full items-center justify-center text-t3"><Play size={28} aria-hidden /></div>}
          </div>
          <dl className="mt-3 grid grid-cols-2 gap-2.5">
            <div className="sub rounded-2xl p-3"><dt className="text-[13px] text-t3">Built from</dt><dd className="text-[15px] font-medium">{kindOf(t)}</dd></div>
            <div className="sub rounded-2xl p-3"><dt className="text-[13px] text-t3">Length</dt><dd className="text-[15px] font-medium">{t.durationSeconds} seconds, {t.aspect ?? '16:9'}</dd></div>
            <div className="sub rounded-2xl p-3"><dt className="text-[13px] text-t3">Music</dt><dd className="text-[15px] font-medium">{TEASER_MUSIC_LABELS[t.music as keyof typeof TEASER_MUSIC_LABELS] ?? t.music}</dd></div>
            <div className="sub rounded-2xl p-3"><dt className="text-[13px] text-t3">Voice-over</dt><dd className="text-[15px] font-medium">{t.voiceOver ? `${label(t.voice)} narrator, ${label(t.voiceLanguage)}` : 'None'}</dd></div>
          </dl>
          <div className="mt-3 flex flex-wrap gap-2">
            <Btn icon={Sparkles} href="/write/teaser?mode=key_frames">New cut</Btn>
            <Btn href={`/write/teaser?teaser=${t._id}`}>{t.status === 'planned' ? 'Review the plan' : 'Open'}</Btn>
            {t.status === 'ready' && <a href={`/api/teasers/${t._id}/video?download=1`} className="inline-flex min-h-[44px] items-center gap-2 rounded-full border border-white/[0.14] bg-white/[0.07] px-[18px] text-sm font-medium"><Download size={16} aria-hidden />Download MP4</a>}
          </div>
          {list && list.length > 1 && (
            <div className="mt-3 flex flex-wrap gap-1.5">
              {list.slice(0, 6).map((x) => <Pill key={x._id} on={x._id === t._id} onClick={() => setId(x._id)}>{x.frameIds?.length ? 'Key frames' : x.sceneNumber ? `Sc ${x.sceneNumber}` : 'Concept'} · {x.aspect ?? '16:9'} · {day(x.createdAt)}</Pill>)}
            </div>
          )}
        </>
      )}
    </Glass>
  );
}

function Pitch({ story }: { story: Story }) {
  const key = `/direction/stories/${story._id}/pitch`;
  const { data: decks, mutate } = useApi<PitchDeck[]>(key, { refreshInterval: (d) => (d?.some((x) => ['queued', 'running'].includes(x.runStatus ?? '')) ? 5000 : 0) });
  const [audience, setAudience] = useState<PitchAudience>('streamer');
  const [deckId, setDeckId] = useState<string | null>(null);
  const [runId, setRunId] = useState<string | null>(null);
  const [index, setIndex] = useState<number | null>(null);
  const [error, setError] = useState('');
  const deck = decks?.find((d) => d._id === deckId) ?? decks?.find((d) => d.audience === audience) ?? decks?.[0];
  const writing = deck && ['queued', 'running'].includes(deck.runStatus ?? '');

  const write = async () => {
    setError('');
    try { const r = await api.post<{ deck: PitchDeck; run: { _id: string } }>(key, { audience }); setDeckId(r.deck._id); setRunId(r.run._id); setIndex(null); await mutate(); await refresh('/credits'); }
    catch (e) { setError(errorText(e)); }
  };
  const remove = async (id: string) => { try { await api.del(`/direction/pitch/${id}`); setDeckId(null); await mutate(); } catch (e) { setError(errorText(e)); } };
  const hasForAudience = decks?.some((d) => d.audience === audience);

  return (
    <Glass className="min-w-0 flex-[1_1_480px]">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><H2>Pitch deck</H2><Small>{deck ? `For ${PITCH_AUDIENCE_LABELS[deck.audience as PitchAudience]?.toLowerCase() ?? deck.audience} · ${deck.slides.length || 14} slides` : 'For producers, channels, streamers and funds · 14 slides'}</Small></div>
        {deck && deck.slides.length > 0 && (
          <div className="flex flex-wrap gap-2">
            <Btn icon={FileText} onClick={() => window.open(`/print/pitch/${deck._id}`, '_blank', 'noopener')}>PDF</Btn>
            <Btn icon={Download} onClick={() => { window.location.href = `/api/direction/pitch/${deck._id}/deck.pptx`; }}>PowerPoint</Btn>
            <IconBtn label="Delete this deck" icon={Trash2} onClick={() => void remove(deck._id)} />
          </div>
        )}
      </div>
      {error && <div className="mt-3"><Note>{error}</Note></div>}
      {(runId || (writing && deck?.runId)) && <div className="mt-3"><RunChecklist runId={runId ?? deck!.runId!} onDone={() => { setRunId(null); void mutate(); }} /></div>}

      {!deck || deck.slides.length === 0 ? (
        <div className="mt-4"><Empty title={writing ? 'Writing the slides…' : 'No deck yet'}>{writing ? 'This takes about a minute.' : 'Choose who you are pitching to below and write the deck (about 60 credits).'}</Empty></div>
      ) : (
        <ol className="mt-3 grid gap-2.5 [grid-template-columns:repeat(auto-fill,minmax(140px,1fr))]">
          {deck.slides.map((s, i) => (
            <li key={i}>
              <button type="button" onClick={() => setIndex(index === i ? null : i)} aria-expanded={index === i} aria-label={`Slide ${i + 1}: ${s.title}`}
                className={clsx('sub block w-full overflow-hidden rounded-[16px] p-2 text-left', index === i && 'ring-2 ring-violet')}>
                <SlideCard slide={s} small />
                <div className="mt-1.5 line-clamp-2 text-[13px] font-medium">{s.title}</div>
                <Small>{label(s.kind)}</Small>
              </button>
            </li>
          ))}
        </ol>
      )}
      {deck && index !== null && deck.slides[index] && <SlideEditor key={`${deck._id}-${index}`} deckId={deck._id} index={index} slide={deck.slides[index]} onSaved={() => void mutate()} />}

      <div className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="mr-1 text-[13px] text-t3">Tune for</span>
        {PITCH_AUDIENCES.map((a) => <Pill key={a} on={audience === a} onClick={() => { setAudience(a); setDeckId(null); setIndex(null); }}>{PITCH_AUDIENCE_LABELS[a]}</Pill>)}
        <Btn variant={hasForAudience ? 'ghost' : 'primary'} icon={Sparkles} onClick={() => void write()}>{hasForAudience ? 'Write again' : `Write for ${PITCH_AUDIENCE_LABELS[audience].toLowerCase()}`}</Btn>
      </div>
      <Small className="mt-2">Facts the deck does not have (budget, team) are left in [brackets] for you to fill.</Small>
    </Glass>
  );
}

function SlideEditor({ deckId, index, slide, onSaved }: { deckId: string; index: number; slide: PitchSlide; onSaved: () => void }) {
  const [form, setForm] = useState({ title: slide.title, subtitle: slide.subtitle ?? '', body: slide.body ?? '', bullets: slide.bullets.join('\n'), notes: slide.notes ?? '' });
  const [msg, setMsg] = useState('');
  useEffect(() => { setMsg(''); }, [index]);
  const save = async () => {
    try {
      await api.patch(`/direction/pitch/${deckId}/slides/${index}`, { ...form, bullets: form.bullets.split('\n').map((b) => b.trim()).filter(Boolean) });
      setMsg('Saved'); onSaved();
    } catch (e) { setMsg(errorText(e)); }
  };
  return (
    <div className="mt-4 flex flex-wrap items-start gap-4 border-t border-white/10 pt-4">
      <div className="min-w-0 flex-[1_1_300px]"><SlideCard slide={{ ...slide, ...form, bullets: form.bullets.split('\n').filter(Boolean) }} /></div>
      <div className="flex min-w-0 flex-[1_1_280px] flex-col gap-3">
        <Input label={`Slide ${index + 1} title`} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
        <Input label="Subtitle" value={form.subtitle} maxLength={200} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
        <Area label="Body" rows={3} value={form.body} maxLength={1500} onChange={(e) => setForm({ ...form, body: e.target.value })} />
        <Area label="Bullets, one per line" rows={3} value={form.bullets} onChange={(e) => setForm({ ...form, bullets: e.target.value })} />
        <Area label="Speaker notes" rows={2} value={form.notes} maxLength={1500} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
        <div className="flex items-center gap-3"><Btn variant="primary" onClick={() => void save()}>Save slide</Btn>{msg && <Small>{msg}</Small>}</div>
      </div>
    </div>
  );
}

/** Concept promo: from an idea typed or spoken, before any script. */
function Concept() {
  const router = useRouter();
  const { production } = useApp();
  const [idea, setIdea] = useState('');
  const [aspect, setAspect] = useState('16:9');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const mic = useDictation((text) => setIdea((v) => (v ? `${v} ${text}` : text)));
  const make = async () => {
    setBusy(true); setError('');
    try {
      const t = await api.post<Teaser & { storyId: string }>('/teasers/concept', { idea, productionId: production?._id, aspect });
      // Open the new concept's story so its plan can be reviewed and made.
      try { localStorage.setItem('sceneos.story', t.storyId); } catch { /* storage unavailable */ }
      await refresh('/writers/stories'); await refresh('/credits');
      router.push(`/write/teaser?teaser=${t._id}`);
    } catch (e) { setError(errorText(e)); setBusy(false); }
  };
  return (
    <Glass>
      <H2>Concept promo, before a script exists</H2>
      <Small className="mt-1">Have only an idea? Describe it or speak it; Scene AI casts faces, plans six key moments and a 30 second promo you review before anything is drawn.</Small>
      <form className="mt-3 flex flex-wrap items-end gap-2" onSubmit={(e) => { e.preventDefault(); void make(); }}>
        <div className="min-w-0 flex-[1_1_420px]"><Area label="The idea" rows={2} value={idea} maxLength={4000} placeholder="A micro drama: a night-shift nurse in Lahore keeps getting texts from a patient who died…" onChange={(e) => setIdea(e.target.value)} /></div>
        <IconBtn label={mic.state === 'recording' ? 'Stop and write it down' : 'Speak the idea'} icon={mic.state === 'recording' ? Square : Mic} disabled={mic.state === 'writing'} onClick={() => void mic.toggle()} />
        <label className="flex flex-col gap-1.5 text-[13px] text-t3">Shape<select className="field !w-auto" value={aspect} onChange={(e) => setAspect(e.target.value)}>{PROMO_ASPECTS.map((a) => <option key={a} value={a}>{a}</option>)}</select></label>
        <Btn type="submit" variant="primary" icon={Sparkles} disabled={busy || idea.trim().length < 20}>{busy ? 'Planning…' : 'Make concept promo'}</Btn>
      </form>
      {mic.state !== 'idle' && <Small className="mt-2">{mic.state === 'recording' ? 'Listening… press the button again to stop.' : 'Writing down what you said…'}</Small>}
      {(error || mic.error) && <div className="mt-3"><Note>{error || mic.error}</Note></div>}
    </Glass>
  );
}
