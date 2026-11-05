'use client';

import { FileUp } from 'lucide-react';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Bar, Btn, Chip, Empty, Glass, H2, Small, type Tone } from '@/components/ui';
import { useApi } from '@/lib/api';
import { day } from '@/lib/format';
import type { Story, StoryOverview } from '@/lib/types';

const VERDICT: Record<string, { label: string; tone: Tone }> = {
  recommend: { label: 'Verdict: Recommend', tone: 'ok' },
  consider: { label: 'Verdict: Consider', tone: 'ai' },
  pass: { label: 'Verdict: Pass', tone: 'risk' },
};

export default function CoveragePage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Coverage key={story._id} story={story} />}</WithStory></>);
}

function Coverage({ story }: { story: Story }) {
  const { data } = useApi<StoryOverview>(`/script-director/stories/${story._id}/overview`);
  const cov = data?.story.coverage;
  if (data && !cov) return <Glass><Empty title="No coverage yet">Scene AI writes coverage when it reads an imported script.<div className="mt-4"><Btn variant="primary" icon={FileUp} href="/write/intake">Import the script</Btn></div></Empty></Glass>;
  if (!cov) return null;
  const scores: [string, number][] = [['Structure', cov.structure], ['Characters', cov.characters], ['Pacing', cov.pacing], ['Dialogue', cov.dialogue]];
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h1 className="text-[32px] font-semibold tracking-[-0.02em]">Script coverage</h1><Small>{data?.story.sourceFile?.name ?? story.title} · written {day(cov.at)}</Small></div>
        <Chip tone={VERDICT[cov.verdict]?.tone ?? 'ai'}>{VERDICT[cov.verdict]?.label ?? cov.verdict}</Chip>
      </div>
      <div className="flex flex-wrap items-start gap-4">
        <Glass className="min-w-0 flex-[1_1_300px]">
          <H2>Scores</H2>
          <div className="mt-3 flex flex-col gap-4">
            {scores.map(([k, v]) => (
              <div key={k}><div className="flex justify-between text-[15px]"><span>{k}</span><span className="font-semibold">{v}/10</span></div><Bar value={v * 10} tone={v >= 8 ? 'ok' : v >= 6 ? 'violet' : 'warn'} className="mt-1.5" /></div>
            ))}
          </div>
        </Glass>
        <Glass className="min-w-0 flex-[999_1_560px]">
          <H2>Summary</H2>
          <p dir="auto" className="mt-2 text-[15px] leading-relaxed">{cov.summary}</p>
          <H2 className="mt-6">Notes</H2>
          <ol className="mt-1">
            {cov.notes.map((n, i) => (
              <li key={i} className="rule flex gap-3 py-3"><span className="text-t3">{i + 1}.</span><div><p dir="auto" className="text-[15px] leading-relaxed">{n.text}</p>{n.scenes.length > 0 && <Small className="mt-1">Scenes {n.scenes.join(', ')}</Small>}</div></li>
            ))}
          </ol>
        </Glass>
      </div>
    </>
  );
}
