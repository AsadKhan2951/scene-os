'use client';

import clsx from 'clsx';
import { ArrowRight, Lock, Plus, Sparkles, Unlock } from 'lucide-react';
import { useEffect, useState } from 'react';
import { label } from '@sceneos/shared';
import { useApp } from '@/components/shell';
import { WithStory, WriteTabs, useEpisodes, useStory } from '@/components/story';
import { Bar, Btn, Chip, Glass, H2, Note, Row, Small, Two } from '@/components/ui';
import { api, errorText, refresh } from '@/lib/api';
import { day, tone } from '@/lib/format';
import type { Story } from '@/lib/types';

export default function OneLinerPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <OneLiner key={story._id} story={story} />}</WithStory></>);
}

function OneLiner({ story }: { story: Story }) {
  const { me } = useApp();
  const { episodes, mutate } = useEpisodes(story._id);
  const [text, setText] = useState(story.oneLiner);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setText(story.oneLiner), [story.oneLiner]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); await refresh('/writers/stories'); await mutate(); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const patch = (body: Partial<Story>) => run(() => api.patch(`/writers/stories/${story._id}`, body));
  const written = episodes?.filter((e) => e.status === 'written').length ?? 0;
  const nextPlanned = episodes?.find((e) => e.status === 'planned');
  const urdu = story.language === 'urdu';

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[1_1_260px] p-[22px]">
        <H2>Story</H2>
        <div className="mt-2">
          {[['Format', label(story.format)], ['Language', label(story.language)], ['Answers given', String(story.answers.length)]].map(([a, b]) => <Row key={a} className="py-2.5" left={<span className="text-sm text-t3">{a}</span>} right={<span className="text-[15px]">{b}</span>} />)}
        </div>
      </Glass>

      <Glass className="min-w-0 flex-[999_1_560px] p-7">
        <div className="mb-5 flex flex-wrap items-center gap-2.5"><h1 className="text-[26px] font-semibold tracking-[-0.02em]">One-liner</h1>{story.locked ? <Chip tone="ok">Locked on {day(story.lockedAt)}</Chip> : <Chip tone="warn">Not locked</Chip>}</div>
        {story.locked
          ? <div dir="auto" className={clsx('max-w-[660px] whitespace-pre-wrap text-lg leading-[1.75]', urdu && 'font-urdu leading-[2.3]')}>{story.oneLiner}</div>
          : <textarea aria-label="One-liner" dir="auto" value={text} onChange={(e) => setText(e.target.value)} rows={14} className={clsx('field resize-y text-[17px] leading-[1.7]', urdu && 'font-urdu leading-[2.2]')} />}
        {error && <div className="mt-4"><Note>{error}</Note></div>}
        <div className="mt-5 flex flex-wrap justify-between gap-3 border-t border-white/10 pt-[18px]">
          <div className="flex flex-wrap gap-2.5">
            {story.locked
              ? <Btn icon={Unlock} disabled={busy || me?.role !== 'admin'} onClick={() => patch({ locked: false })}>Unlock to edit</Btn>
              : <>
                  <Btn disabled={busy || text === story.oneLiner} onClick={() => patch({ oneLiner: text })}>Save changes</Btn>
                  <Btn icon={Sparkles} disabled={busy} onClick={() => run(() => api.post(`/writers/stories/${story._id}/one-liner`))}>{busy ? 'Working…' : 'Rewrite with AI'}</Btn>
                  <Btn variant="primary" icon={Lock} disabled={busy || !story.oneLiner || text !== story.oneLiner} onClick={() => patch({ locked: true })}>Lock one-liner</Btn>
                </>}
          </div>
          <Btn variant={story.locked ? 'primary' : 'ghost'} icon={ArrowRight} href="/write/script">Open the script</Btn>
        </div>
        <Small className="mt-3">Lock the one-liner once the story direction is agreed. Only an admin can unlock it.</Small>
      </Glass>

      <Glass className="min-w-0 flex-[1_1_340px] p-[22px]">
        <div className="mb-1 flex items-center justify-between"><H2>Episode plan</H2><span className="text-[13px] text-t3">{written} of {episodes?.length ?? 0} written</span></div>
        <Bar value={episodes?.length ? (written / episodes.length) * 100 : 0} />
        <div className="mt-3.5 flex flex-col gap-2">
          {episodes?.length === 0 && <Small>No episodes planned yet.</Small>}
          {episodes?.map((e) => (
            <div key={e._id} className={clsx('flex items-center justify-between gap-2.5 rounded-2xl px-3.5 py-3', e.status === 'planned' ? 'border border-dashed border-white/20' : 'sub')}>
              <Two a={`Episode ${e.number}${e.number === 1 ? ', pilot' : ''}`} b={e.title || e.outline || 'Not outlined yet'} /><Chip tone={tone(e.status)}>{label(e.status)}</Chip>
            </div>
          ))}
        </div>
        <div className="mt-3.5 flex flex-col gap-2">
          {nextPlanned && <Btn variant="primary" icon={Sparkles} disabled={busy || !story.oneLiner} onClick={() => run(() => api.post(`/writers/episodes/${nextPlanned._id}/generate`))} className="w-full">{busy ? 'Writing…' : `Write episode ${nextPlanned.number}`}</Btn>}
          <Btn icon={Plus} disabled={busy} onClick={() => run(() => api.post(`/writers/stories/${story._id}/episodes/plan`, { upTo: (episodes?.length ?? 0) + 1 }))} className="w-full">Add an episode slot</Btn>
        </div>
      </Glass>
    </div>
  );
}
