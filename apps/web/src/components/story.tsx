'use client';

import { ChevronDown } from 'lucide-react';
import { useEffect, useState, type ReactNode } from 'react';
import { sceneMarks } from '@sceneos/shared';
import { useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { ScriptEpisode, Story } from '@/lib/types';
import { Btn, Empty, Loading, Note, Tabs } from './ui';

const KEY = 'sceneos.story';

/** The story the Write section is working on, remembered per device. */
export function useStory() {
  const { data: stories, error } = useApi<Story[]>('/writers/stories');
  const [id, setId] = useState<string | null>(null);
  useEffect(() => { try { setId(localStorage.getItem(KEY)); } catch { /* storage unavailable */ } }, []);
  const choose = (next: string) => { setId(next); try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ } };
  return { stories, error, story: stories?.find((s) => s._id === id) ?? stories?.[0], choose };
}

export function WriteTabs({ ctx }: { ctx: ReturnType<typeof useStory> }) {
  const { stories, story, choose } = ctx;
  const switcher = stories && stories.length > 0 && (
    <label className="sub relative inline-flex min-h-[44px] items-center rounded-full pl-4 pr-9 text-[15px] font-semibold">
      <span className="sr-only">Story</span>
      <select value={story?._id ?? ''} onChange={(e) => choose(e.target.value)} className="max-w-[220px] cursor-pointer appearance-none truncate bg-transparent outline-none">
        {stories.map((s) => <option key={s._id} value={s._id}>{s.title}</option>)}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3.5" aria-hidden />
    </label>
  );
  return <Tabs items={TABS.write} left={switcher || undefined} />;
}

export function WithStory({ ctx, children }: { ctx: ReturnType<typeof useStory>; children: (story: Story) => ReactNode }) {
  if (ctx.error) return <Note>{ctx.error.message}</Note>;
  if (!ctx.stories) return <Loading what="Loading stories" />;
  if (!ctx.story) return <Empty title="No story yet">Start one in the wizard. It takes six short questions.<div className="mt-4"><Btn variant="primary" href="/write/new">Start a new story</Btn></div></Empty>;
  return <>{children(ctx.story)}</>;
}

/** Episodes of a story plus which one is selected. */
export function useEpisodes(storyId: string | undefined) {
  const { data: episodes, mutate } = useApi<ScriptEpisode[]>(storyId ? `/writers/stories/${storyId}/episodes` : null);
  const [number, setNumber] = useState<number | null>(null);
  const episode = episodes?.find((e) => e.number === number) ?? episodes?.find((e) => e.status !== 'planned') ?? episodes?.[0];
  return { episodes, episode, select: setNumber, mutate };
}

/** Splits a screenplay into numbered scenes by its INT./EXT. headings. */
export function scenes(content: string): { number: number; heading: string }[] {
  return sceneMarks(content).map(({ number, heading }) => ({ number, heading }));
}
