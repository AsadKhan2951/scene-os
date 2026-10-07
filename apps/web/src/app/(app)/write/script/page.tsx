'use client';

import clsx from 'clsx';
import { Image as ImageIcon, Plus, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { label } from '@sceneos/shared';
import { WithStory, WriteTabs, useEpisodes, useStory } from '@/components/story';
import { Btn, Chip, Empty, Glass, H2, Note, Row, Small, Two } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import { day, tone } from '@/lib/format';
import type { Character, ScriptEpisode, Story } from '@/lib/types';

export default function ScriptPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Script key={story._id} story={story} />}</WithStory></>);
}

function Script({ story }: { story: Story }) {
  const { episodes, episode: listed, select, mutate } = useEpisodes(story._id);
  const { data: episode, mutate: mutateOne } = useApi<ScriptEpisode>(listed ? `/writers/episodes/${listed._id}` : null);
  const { data: characters } = useApi<Character[]>(`/characters?storyId=${story._id}`);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => setText(episode?.content ?? ''), [episode?._id, episode?.content]);

  async function run(fn: () => Promise<unknown>) {
    setBusy(true); setError('');
    try { await fn(); await Promise.all([mutate(), mutateOne()]); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const urdu = story.language === 'urdu';
  const dirty = episode !== undefined && text !== episode.content;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[1_1_280px] p-5">
        <div className="mb-3 flex items-center justify-between"><H2>Episodes</H2><span className="text-[13px] text-t3">{episodes?.filter((e) => e.status === 'written').length ?? 0} of {episodes?.length ?? 0} written</span></div>
        <div className="flex flex-col gap-2">
          {episodes?.map((e) => (
            <button key={e._id} type="button" onClick={() => select(e.number)} aria-pressed={listed?._id === e._id}
              className={clsx('flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-3 text-left', listed?._id === e._id ? 'border-violet/55 bg-violet/20' : e.status === 'planned' ? 'border-dashed border-white/20' : 'sub')}>
              <Two a={`Episode ${e.number}${e.number === 1 ? ', pilot' : ''}`} b={e.title || 'Untitled'} /><Chip tone={tone(e.status)}>{label(e.status)}</Chip>
            </button>
          ))}
        </div>
        <Btn icon={Plus} disabled={busy} className="mt-3.5 w-full" onClick={() => run(() => api.post(`/writers/stories/${story._id}/episodes/plan`, { upTo: (episodes?.length ?? 0) + 1 }))}>Plan another episode</Btn>
      </Glass>

      <Glass className="min-w-0 flex-[999_1_520px] p-7">
        {!listed ? <Empty title="No episodes yet">Plan the first episode, then write it from the one-liner.</Empty> : (
          <>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div><h1 className="text-[26px] font-semibold tracking-[-0.02em]">Episode {listed.number}{listed.number === 1 ? ', pilot' : ''}</h1><Small>{label(story.language)}{episode ? `. Saved ${day(episode.updatedAt)}` : ''}</Small></div>
              {dirty && <Chip tone="warn">Unsaved changes</Chip>}
            </div>
            <textarea aria-label="Screenplay" dir="auto" value={text} onChange={(e) => setText(e.target.value)} rows={24} placeholder="1. INT. LOCATION - TIME"
              className={clsx('field mt-4 resize-y text-base leading-[1.55]', urdu ? 'font-urdu leading-[2.2]' : 'font-script')} />
            {error && <div className="mt-4"><Note>{error}</Note></div>}
            <div className="mt-4 flex flex-wrap gap-2.5 border-t border-white/10 pt-[18px]">
              <Btn variant="primary" disabled={busy || !dirty} onClick={() => run(() => api.patch(`/writers/episodes/${listed._id}`, { content: text }))}>Save script</Btn>
              <Btn icon={Sparkles} disabled={busy || !story.oneLiner} onClick={() => run(() => api.post(`/writers/episodes/${listed._id}/generate`))}>{busy ? 'Working…' : episode?.content ? 'Rewrite episode with AI' : 'Write episode with AI'}</Btn>
              <Btn icon={ImageIcon} href="/write/storyboards">Storyboard this episode</Btn>
            </div>
            <Small className="mt-3">Rewriting replaces the script. The current draft is kept under Revisions first.</Small>
          </>
        )}
      </Glass>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <Glass className="p-[22px]">
          <H2>Characters</H2>
          {characters?.length === 0 && <Small className="mt-2">No characters yet.</Small>}
          <div className="mt-2">{characters?.map((c) => <Row key={c._id} left={<Two a={c.name} b={c.finalCast ?? `${c.actorOptions.length} actor option${c.actorOptions.length === 1 ? '' : 's'}`} />} right={c.finalCast ? <Chip tone="ok">Cast</Chip> : <Btn href="/write/characters" className="px-3.5">Choose actor</Btn>} />)}</div>
        </Glass>
        <Glass className="p-[22px]">
          <H2>Revisions</H2><Small className="mb-2 mt-1">Every replaced draft is kept</Small>
          {(episode?.revisions.length ?? 0) === 0 && <Small>No earlier drafts.</Small>}
          {[...(episode?.revisions ?? [])].reverse().map((r, i) => <Row key={i} className="py-2.5" left={<Two a={r.label} b={`${day(r.at)}, ${r.by}`} />} />)}
        </Glass>
      </div>
    </div>
  );
}
