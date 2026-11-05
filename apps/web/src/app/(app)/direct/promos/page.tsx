'use client';

import clsx from 'clsx';
import { Clapperboard, Download, FileText, Film, Lightbulb, Sparkles, Star, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { PITCH_AUDIENCES, PITCH_AUDIENCE_LABELS, type PitchAudience } from '@sceneos/shared';
import { SlideCard } from '@/components/pitch';
import { RunChecklist } from '@/components/run';
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
        <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Promos and pitch</h1>
        <p className="mt-1.5 text-base text-t2">Cut promos from the film&apos;s key frames or from the idea alone, in widescreen, scope or vertical, and write a pitch deck for who you are pitching to.</p>
      </div>
      <PromoList story={story} />
      <Pitch story={story} />
    </>
  );
}

function kindOf(t: Teaser) { return t.frameIds?.length ? 'Key-frame promo' : t.sceneNumber ? `Scene ${t.sceneNumber} previs` : 'Concept promo'; }

function PromoList({ story }: { story: Story }) {
  const { data: list } = useApi<Teaser[]>(`/teasers?storyId=${story._id}`);
  return (
    <Glass>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H2>Promos</H2>
        <div className="flex flex-wrap gap-2">
          <Btn variant="primary" icon={Star} href="/write/teaser?mode=key_frames">Promo from key frames</Btn>
          <Btn icon={Lightbulb} href="/write/teaser?mode=story">Concept promo</Btn>
          <Btn icon={Clapperboard} href="/write/teaser">Scene previs</Btn>
        </div>
      </div>
      <Small className="mt-1">You review every shot, the voice-over and the music before anything is drawn. Vertical 9:16 and square are cut from the widescreen master.</Small>
      {!list?.length ? <Small className="mt-4">No promos yet.</Small> : (
        <ul className="mt-4 grid gap-3 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {list.map((t) => (
            <li key={t._id} className="sub overflow-hidden rounded-[18px]">
              <Link href={`/write/teaser?teaser=${t._id}`} className="block">
                {t.status === 'ready'
                  ? <video src={`/api/teasers/${t._id}/video`} preload="metadata" muted playsInline className={clsx('w-full bg-black object-cover', t.aspect === '9:16' ? 'aspect-[9/16] max-h-64' : 'aspect-video')} aria-label={`${kindOf(t)} video`} />
                  // eslint-disable-next-line @next/next/no-img-element
                  : t.shots[0]?.imageUrl ? <img src={t.shots[0].imageUrl} alt="" className="aspect-video w-full object-cover" /> : <div className="flex aspect-video items-center justify-center bg-white/[0.05] text-t3"><Film size={20} aria-hidden /></div>}
                <div className="flex items-start justify-between gap-2 p-3">
                  <div className="min-w-0"><div className="truncate text-[14px] font-medium">{kindOf(t)}</div><Small>{t.durationSeconds} s · {t.aspect ?? '16:9'} · {day(t.createdAt)}</Small></div>
                  <Chip tone={t.status === 'ready' ? 'ok' : t.status === 'failed' ? 'risk' : t.status === 'planned' ? 'info' : 'ai'}>{t.status === 'planned' ? 'Plan' : t.status}</Chip>
                </div>
              </Link>
            </li>
          ))}
        </ul>
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
  const [index, setIndex] = useState(0);
  const [error, setError] = useState('');
  const deck = decks?.find((d) => d._id === deckId) ?? decks?.[0];
  const writing = deck && ['queued', 'running'].includes(deck.runStatus ?? '');

  const write = async () => {
    setError('');
    try { const r = await api.post<{ deck: PitchDeck; run: { _id: string } }>(key, { audience }); setDeckId(r.deck._id); setRunId(r.run._id); setIndex(0); await mutate(); await refresh('/credits'); }
    catch (e) { setError(errorText(e)); }
  };
  const remove = async (id: string) => { try { await api.del(`/direction/pitch/${id}`); setDeckId(null); await mutate(); } catch (e) { setError(errorText(e)); } };

  return (
    <Glass>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H2>Pitch deck</H2>
        <div className="flex flex-wrap items-center gap-1.5">
          {PITCH_AUDIENCES.map((a) => <Pill key={a} on={audience === a} onClick={() => setAudience(a)}>{PITCH_AUDIENCE_LABELS[a]}</Pill>)}
          <Btn variant="primary" icon={Sparkles} onClick={() => void write()}>Write 14 slides</Btn>
        </div>
      </div>
      <Small className="mt-1">Written from the story, characters, look book and storyboard. Facts it does not have (budget, team) are left in [brackets] for you to fill. About 60 credits.</Small>
      {error && <div className="mt-3"><Note>{error}</Note></div>}
      {(runId || (deck?.runId && writing)) && <div className="mt-3"><RunChecklist runId={runId ?? deck!.runId!} onDone={() => { setRunId(null); void mutate(); }} /></div>}

      {!deck ? <div className="mt-4"><Empty title="No deck yet">Choose who you are pitching to and write the deck.</Empty></div> : (
        <>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex flex-wrap gap-1.5">
              {decks!.map((d) => <Pill key={d._id} on={d._id === deck._id} onClick={() => { setDeckId(d._id); setIndex(0); }}>{PITCH_AUDIENCE_LABELS[d.audience as PitchAudience] ?? d.audience} · {day(d.createdAt)}</Pill>)}
            </div>
            {deck.slides.length > 0 && (
              <div className="flex flex-wrap gap-2">
                <Btn icon={Download} onClick={() => { window.location.href = `/api/direction/pitch/${deck._id}/deck.pptx`; }}>PowerPoint</Btn>
                <Btn icon={FileText} onClick={() => window.open(`/print/pitch/${deck._id}`, '_blank', 'noopener')}>PDF</Btn>
                <IconBtn label="Delete deck" icon={Trash2} onClick={() => void remove(deck._id)} />
              </div>
            )}
          </div>
          {deck.slides.length === 0 ? <Small className="mt-4">{writing ? 'Writing the slides…' : 'This deck has no slides. Write it again.'}</Small> : (
            <div className="mt-4 flex flex-wrap items-start gap-4">
              <ol className="grid min-w-0 flex-[999_1_520px] gap-3 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                {deck.slides.map((s, i) => (
                  <li key={i}>
                    <button type="button" onClick={() => setIndex(i)} aria-current={i === index ? 'true' : undefined} className={clsx('block w-full rounded-xl text-left ring-offset-2 ring-offset-transparent', i === index && 'ring-2 ring-[var(--violet)]')} aria-label={`Slide ${i + 1}: ${s.title}`}>
                      <SlideCard slide={s} small />
                    </button>
                  </li>
                ))}
              </ol>
              {deck.slides[index] && <SlideEditor key={`${deck._id}-${index}`} deckId={deck._id} index={index} slide={deck.slides[index]} onSaved={() => void mutate()} />}
            </div>
          )}
        </>
      )}
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
    <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-3">
      <SlideCard slide={{ ...slide, ...form, bullets: form.bullets.split('\n').filter(Boolean) }} />
      <Input label={`Slide ${index + 1} title`} value={form.title} maxLength={120} onChange={(e) => setForm({ ...form, title: e.target.value })} />
      <Input label="Subtitle" value={form.subtitle} maxLength={200} onChange={(e) => setForm({ ...form, subtitle: e.target.value })} />
      <Area label="Body" rows={3} value={form.body} maxLength={1500} onChange={(e) => setForm({ ...form, body: e.target.value })} />
      <Area label="Bullets, one per line" rows={4} value={form.bullets} onChange={(e) => setForm({ ...form, bullets: e.target.value })} />
      <Area label="Speaker notes" rows={3} value={form.notes} maxLength={1500} onChange={(e) => setForm({ ...form, notes: e.target.value })} />
      <div className="flex items-center gap-3"><Btn variant="primary" onClick={() => void save()}>Save slide</Btn>{msg && <Small>{msg}</Small>}</div>
    </div>
  );
}
