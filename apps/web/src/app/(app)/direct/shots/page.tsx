'use client';

import { Download, Star } from 'lucide-react';
import Link from 'next/link';
import { useState } from 'react';
import { SHOT_SIZES } from '@sceneos/shared';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Btn, Empty, Glass, Pill, Small } from '@/components/ui';
import { useApi } from '@/lib/api';
import type { ShotListView, Story } from '@/lib/types';

export default function ShotListPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Shots key={story._id} story={story} />}</WithStory></>);
}

const hours = (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60 ? `${m % 60} min` : ''}`.trim() : `${m} min`);

function Shots({ story }: { story: Story }) {
  const { data } = useApi<ShotListView>(`/direction/stories/${story._id}/shot-list`);
  const [size, setSize] = useState('');
  if (!data) return null;
  const sizes = SHOT_SIZES.filter((s) => data.scenes.some((sc) => sc.shots.some((sh) => sh.size === s)));
  const scenes = data.scenes.map((s) => ({ ...s, shots: s.shots.filter((sh) => !size || sh.size === size) })).filter((s) => s.shots.length);

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{data.totals.shots} shots, {data.totals.setups} setups.</h1>
          <p className="mt-1.5 text-base text-t2">About {hours(data.totals.minutes)} on set, from the storyboard frames. Shots with the same size and lens in a scene share a setup.</p>
        </div>
        <Btn icon={Download} onClick={() => { window.location.href = `/api/direction/stories/${story._id}/shot-list.xlsx`; }}>Export shot list</Btn>
      </div>
      {sizes.length > 1 && <div className="flex flex-wrap gap-1.5"><Pill on={!size} onClick={() => setSize('')}>All sizes</Pill>{sizes.map((s) => <Pill key={s} on={size === s} onClick={() => setSize(s)}>{s}</Pill>)}</div>}
      {scenes.length === 0 ? <Glass><Empty title="No shots yet">The shot list is made from the storyboard. Draw scenes first.<div className="mt-4"><Btn variant="primary" href="/write/storyboards">Draw scenes</Btn></div></Empty></Glass> : scenes.map((s) => (
        <Glass key={`${s.episodeNumber}:${s.sceneNumber}`}>
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <div><span className="text-[15px] font-semibold">Ep {s.episodeNumber} · Sc {s.sceneNumber}</span> <span className="text-[15px] text-t2">{s.heading}</span></div>
            <Small>{s.setups} setup{s.setups === 1 ? '' : 's'} · about {hours(s.minutes)}</Small>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[820px] border-collapse text-left text-[14px]">
              <thead><tr className="text-[13px] text-t3">{['Shot', '', 'Size', 'Lens and move', 'Who', 'Action', 'Setup'].map((h, i) => <th key={i} scope="col" className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
              <tbody>
                {s.shots.map((sh) => (
                  <tr key={sh.frameId} className="align-top [&>td]:rule [&>td]:py-2.5 [&>td]:pr-3">
                    <td className="whitespace-nowrap font-semibold">{sh.shot}{sh.keyFrame && <Star size={12} className="ml-1 inline text-[#f5d742]" fill="currentColor" aria-label="Key frame" />}</td>
                    <td className="w-28">
                      <Link href={`/direct/director?frame=${sh.frameId}`} aria-label={`Open shot ${sh.shot} in the AI Director`}>
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        {sh.imageUrl ? <img src={sh.imageUrl} alt="" className="aspect-video w-28 rounded-md object-cover" loading="lazy" /> : <span className="block aspect-video w-28 rounded-md bg-white/[0.06]" />}
                      </Link>
                    </td>
                    <td>{sh.size || '—'}<Small>{sh.label}</Small></td>
                    <td>{[sh.lens, sh.camera].filter(Boolean).join(' · ') || '—'}<Small>{sh.light}</Small></td>
                    <td>{sh.cast.join(', ') || '—'}</td>
                    <td className="max-w-[340px]">{sh.action}{sh.props && <Small>Props: {sh.props}</Small>}</td>
                    <td className="text-center">{sh.setup}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Glass>
      ))}
    </>
  );
}
