'use client';

import clsx from 'clsx';
import { ArrowRight, Sparkles } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { LANGUAGES, WRITING_FORMATS, label } from '@sceneos/shared';
import { useApp } from '@/components/shell';
import { WriteTabs, useStory } from '@/components/story';
import { Area, Bar, Btn, Chip, Glass, H2, Input, Note, Pill, Select, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import type { Story } from '@/lib/types';

const FORMAT_HINT: Record<string, string> = { drama_serial: 'Starts with a one-liner', telefilm: 'Single long-form story', pilot: 'One episode to test the idea', web_series: 'Short season, scene-led' };
const LANGUAGE_LABEL: Record<string, string> = { english: 'English', roman_urdu: 'Roman Urdu', urdu: 'اردو' };

export default function NewStoryPage() {
  const router = useRouter();
  const ctx = useStory();
  const { productions } = useApp();
  const { data: questions } = useApi<string[]>('/writers/wizard-questions');
  const [title, setTitle] = useState('');
  const [productionId, setProductionId] = useState('');
  const [format, setFormat] = useState<string>('drama_serial');
  const [language, setLanguage] = useState<string>('roman_urdu');
  const [answers, setAnswers] = useState<string[]>([]);
  const [step, setStep] = useState(0);
  const [draft, setDraft] = useState('');
  const [story, setStory] = useState<Story | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const total = questions?.length ?? 6;
  const done = step >= total;
  const next = (skip = false) => { setAnswers((a) => { const copy = [...a]; copy[step] = skip ? '' : draft.trim(); return copy; }); setDraft(''); setStep(step + 1); };

  async function writeOneLiner() {
    if (!title.trim()) { setError('Give the story a working title first'); return; }
    setBusy(true); setError('');
    try {
      const payload = { title: title.trim(), format, language, productionId: productionId || undefined, answers: (questions ?? []).map((question, i) => ({ question, answer: answers[i] ?? '' })).filter((a) => a.answer) };
      const saved = story ? await api.patch<Story>(`/writers/stories/${story._id}`, payload) : await api.post<Story>('/writers/stories', payload);
      const written = await api.post<Story>(`/writers/stories/${saved._id}/one-liner`);
      setStory(written);
      ctx.choose(written._id);
      await refresh('/writers/stories');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }

  return (
    <>
      <WriteTabs ctx={ctx} />
      <h1 className="text-[32px] font-semibold tracking-[-0.02em]">Start a new story</h1>
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[1_1_270px] p-[22px]">
          <div className="flex flex-col gap-3">
            <Input label="Working title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={200} />
            <Select label="Link to a production (optional)" value={productionId} onChange={(e) => setProductionId(e.target.value)} options={[{ value: '', label: 'Not linked yet' }, ...(productions ?? []).map((p) => ({ value: p._id, label: p.title }))]} />
          </div>
          <H2 className="mt-6">Format</H2>
          <div className="mb-6 mt-3 flex flex-col gap-2">
            {WRITING_FORMATS.map((f) => (
              <button key={f} type="button" aria-pressed={format === f} onClick={() => setFormat(f)} className={clsx('min-h-[44px] rounded-2xl border px-3.5 py-3 text-left', format === f ? 'border-violet/60 bg-violet/20' : 'sub')}>
                <div className="text-[15px] font-medium">{label(f)}</div><Small className={format === f ? 'text-t2' : ''}>{FORMAT_HINT[f]}</Small>
              </button>
            ))}
          </div>
          <H2>Writing language</H2>
          <div className="mt-3 flex flex-wrap gap-1.5">{LANGUAGES.map((l) => <Pill key={l} on={language === l} onClick={() => setLanguage(l)}><span className={l === 'urdu' ? 'font-urdu' : ''}>{LANGUAGE_LABEL[l]}</span></Pill>)}</div>
          <Small className="mt-3">Urdu is written right to left.</Small>
        </Glass>

        <Glass className="min-w-0 flex-[999_1_480px] p-7">
          <div className="mb-2 flex items-center justify-between gap-3"><H2>Tell me the story</H2><span className="text-[13px] text-t3">{done ? 'All questions answered' : `Question ${step + 1} of ${total}`}</span></div>
          <Bar value={(Math.min(step, total) / total) * 100} />
          <div className="mt-6 flex flex-col gap-5">
            {questions?.slice(0, step).map((q, i) => (
              <div key={q}><div className="text-sm text-t3">{q}</div><div className="mt-1.5 text-base leading-relaxed text-t2" dir="auto">{answers[i] || 'Skipped'}</div></div>
            ))}
            {!done && questions && (
              <div className="flex flex-col gap-3 border-t border-white/10 pt-5">
                <Area label={questions[step]} value={draft} onChange={(e) => setDraft(e.target.value)} rows={4} dir="auto" placeholder="Write as much or as little as you like" className="text-base" />
                <div className="flex flex-wrap justify-between gap-2.5"><Btn variant="text" onClick={() => next(true)}>Skip this question</Btn><Btn variant="primary" icon={ArrowRight} disabled={!draft.trim()} onClick={() => next()}>Next question</Btn></div>
              </div>
            )}
            {done && <Btn onClick={() => { setStep(0); setDraft(answers[0] ?? ''); }}>Change my answers</Btn>}
          </div>
        </Glass>

        <Glass className="min-w-0 flex-[1_1_360px] p-[26px]">
          <div className="flex flex-wrap items-center justify-between gap-2.5"><H2>One-liner</H2>{story && <Chip tone="ai">Draft</Chip>}</div>
          {story ? <p dir="auto" className={clsx('mt-4 whitespace-pre-wrap text-[17px] leading-[1.7]', language === 'urdu' && 'font-urdu leading-[2.2]')}>{story.oneLiner}</p>
            : <p className="mt-4 text-[15px] leading-relaxed text-t3">Answer the questions, then write the one-liner. It is a flowing story treatment, not a scene list.</p>}
          {error && <div className="mt-4"><Note>{error}</Note></div>}
          <div className="mt-6 flex flex-col gap-2.5 border-t border-white/10 pt-5">
            <Btn variant={story ? 'ghost' : 'primary'} icon={Sparkles} disabled={busy || step === 0} onClick={writeOneLiner} className="w-full">{busy ? 'Writing…' : story ? 'Rewrite the one-liner' : 'Write the one-liner'}</Btn>
            {story && <Btn variant="primary" icon={ArrowRight} onClick={() => router.push('/write/one-liner')} className="w-full">Review and lock the one-liner</Btn>}
            <Small>The pilot is only written when you ask for it. Lock the story first, then move to scenes.</Small>
          </div>
        </Glass>
      </div>
    </>
  );
}
