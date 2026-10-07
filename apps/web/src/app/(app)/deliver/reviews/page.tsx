'use client';

import clsx from 'clsx';
import { Check } from 'lucide-react';
import { useEffect, useState } from 'react';
import { REVIEW_FIELDS, REVIEW_FIELD_LABELS, SIGN_OFF_ROLES } from '@sceneos/shared';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Area, Btn, Chip, Glass, H2, Input, Note, Row, Small, Two } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { Evaluation, Me, Production, Review } from '@/lib/types';

export default function ReviewsPage() {
  return (<><SectionTabs items={TABS.deliver} /><WithProduction>{(p, me) => <Reviews key={p._id} production={p} me={me} />}</WithProduction></>);
}
const SIGN_LABEL: Record<string, string> = { producer: 'Producer', channelHead: 'Channel head', ceo: 'CEO' };
const EVAL_FIELDS: [keyof Evaluation & string, string][] = [['usp', 'Unique selling proposition'], ['promotionalApproach', 'Promotional approach'], ['relatability', 'Story and character relatability'], ['fearFantasy', 'Fear and fantasy factors']];

function Reviews({ production: p, me }: { production: Production; me: Me | undefined }) {
  const { data: reviews, mutate } = useApi<Review[]>(`/reviews?productionId=${p._id}`);
  const { data: evaluation, mutate: mutateEval } = useApi<Evaluation>(`/evaluations/${p._id}`);
  const [episode, setEpisode] = useState(1);
  const existing = reviews?.find((r) => r.episodeNumber === episode);
  const [scores, setScores] = useState<Record<string, number>>({});
  const [reviewer, setReviewer] = useState('');
  const [suggestions, setSuggestions] = useState('');
  const [ev, setEv] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);

  useEffect(() => { setScores(existing?.scores ?? {}); setReviewer(existing?.reviewer ?? me?.name ?? ''); setSuggestions(existing?.suggestions ?? ''); }, [existing?._id, episode]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (evaluation) setEv(Object.fromEntries(EVAL_FIELDS.map(([k]) => [k, (evaluation[k] as string) ?? '']))); }, [evaluation]);

  async function run(fn: () => Promise<unknown>, ok: string) { setMsg(null); try { await fn(); await Promise.all([mutate(), mutateEval()]); setMsg({ tone: 'ok', text: ok }); } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } }
  const complete = REVIEW_FIELDS.every((f) => scores[f]);
  const average = complete ? (REVIEW_FIELDS.reduce((a, f) => a + scores[f], 0) / REVIEW_FIELDS.length).toFixed(1) : null;
  const saveReview = () => run(() => { const body = { productionId: p._id, episodeNumber: episode, reviewer, scores, suggestions: suggestions || undefined }; return existing ? api.patch(`/reviews/${existing._id}`, body) : api.post('/reviews', body); }, 'Review saved.');

  return (
    <>
      {msg && <Note tone={msg.tone}>{msg.text}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[999_1_560px]">
          <div className="mb-3.5 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[26px] font-semibold tracking-[-0.02em]">Episode {episode} review</h1><Small>1 is weak, 5 is excellent</Small></div>{existing && <Chip tone="ok">Reviewed</Chip>}</div>
          <div className="mb-3.5 grid max-w-[520px] grid-cols-2 gap-3"><Input label="Episode" type="number" min={1} max={p.totalEpisodes} value={episode} onChange={(e) => setEpisode(Math.max(1, Number(e.target.value) || 1))} /><Input label="Reviewer" value={reviewer} onChange={(e) => setReviewer(e.target.value)} /></div>
          {REVIEW_FIELDS.map((f) => (
            <div key={f} role="radiogroup" aria-label={REVIEW_FIELD_LABELS[f]} className="rule flex flex-wrap items-center justify-between gap-x-4 gap-y-2 py-2">
              <span className="text-[15px]">{REVIEW_FIELD_LABELS[f]}</span>
              <div className="flex gap-1.5">{[1, 2, 3, 4, 5].map((n) => <button key={n} type="button" role="radio" aria-checked={scores[f] === n} aria-label={`${n} of 5`} onClick={() => setScores({ ...scores, [f]: n })} className={clsx('h-11 w-11 rounded-[14px] border text-[15px] font-medium', scores[f] === n ? 'border-violet/70 bg-violet/40 text-white' : 'border-white/10 bg-white/[0.04] text-t2')}>{n}</button>)}</div>
            </div>
          ))}
          <div className="mt-4"><Area label="Suggested improvements" value={suggestions} onChange={(e) => setSuggestions(e.target.value)} placeholder="What should change before delivery" /></div>
          <div className="mt-4 flex flex-wrap items-center justify-between gap-2.5"><Small className="text-t2">{average ? `Average ${average} of 5 across ${REVIEW_FIELDS.length} scores` : 'Score every line to save the review'}</Small><Btn variant="primary" icon={Check} disabled={!complete || !reviewer.trim()} onClick={saveReview}>Save review</Btn></div>
        </Glass>

        <Glass className="min-w-0 flex-[1_1_400px]">
          <H2>Project evaluation</H2><Small className="mb-3.5 mt-1">{p.title}, filled in once per production</Small>
          <div className="flex flex-col gap-3">{EVAL_FIELDS.map(([k, name]) => <Area key={k} label={name} rows={2} value={ev[k] ?? ''} onChange={(e) => setEv({ ...ev, [k]: e.target.value })} />)}</div>
          <Btn className="mt-3 w-full" onClick={() => run(() => api.put(`/evaluations/${p._id}`, Object.fromEntries(Object.entries(ev).filter(([, v]) => v))), 'Evaluation saved.')}>Save evaluation</Btn>
          <H2 className="mt-5">Sign-off</H2>
          <div className="mt-2">
            {SIGN_OFF_ROLES.map((role) => {
              const s = evaluation?.signOffs?.[role];
              return <Row key={role} left={<Two a={SIGN_LABEL[role]} b={s?.at ? `${s.by}, ${day(s.at)}` : 'Not signed'} />} right={s?.at ? <Chip tone="ok">Signed</Chip> : <Btn icon={Check} disabled={me?.role !== 'admin'} onClick={() => run(() => api.post(`/evaluations/${p._id}/sign-off`, { role }), `Signed off as ${SIGN_LABEL[role]}.`)}>Sign off</Btn>} />;
            })}
          </div>
          <Small className="mt-2.5">Signing is recorded with your name and the time. It cannot be undone here. Admins only.</Small>
        </Glass>
      </div>
    </>
  );
}
