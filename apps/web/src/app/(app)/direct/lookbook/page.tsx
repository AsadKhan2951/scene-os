'use client';

import { Printer, Sparkles } from 'lucide-react';
import { useEffect, useState } from 'react';
import { RunChecklist } from '@/components/run';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Area, Btn, Empty, Glass, H2, Note, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { picture } from '@/lib/direction';
import type { LookBookView, Story } from '@/lib/types';

export default function LookBookPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Book key={story._id} story={story} />}</WithStory></>);
}

function Book({ story }: { story: Story }) {
  const key = `/direction/stories/${story._id}/lookbook`;
  const { data, mutate } = useApi<LookBookView>(key);
  const [runId, setRunId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [vision, setVision] = useState('');
  const [editing, setEditing] = useState(false);
  useEffect(() => { setVision(data?.book?.vision ?? ''); }, [data?.book?.vision]);

  if (!data) return null;
  const { book } = data;
  const active = runId ?? (data.run && ['queued', 'running'].includes(data.run.status) ? data.run._id : null);
  const make = async () => { setError(''); try { setRunId((await api.post<{ _id: string }>(key))._id); await refresh('/credits'); } catch (e) { setError(errorText(e)); } };
  const saveVision = async () => { setError(''); try { await api.patch(key, { vision }); setEditing(false); await mutate(); } catch (e) { setError(errorText(e)); } };

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4 print:hidden">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">Look book</h1>
          <p className="mt-1.5 text-base text-t2">How {story.title} looks and feels, written from the characters, costume looks, location boards and storyboard.</p>
        </div>
        <div className="flex flex-wrap gap-2.5">
          {book && <Btn icon={Printer} onClick={() => window.print()}>Print or save PDF</Btn>}
          <Btn variant="primary" icon={Sparkles} disabled={!!active} onClick={() => void make()}>{book ? 'Write it again' : 'Make the look book'}</Btn>
        </div>
      </div>
      {error && <Note>{error}</Note>}
      {active && <Glass><RunChecklist runId={active} onDone={() => { setRunId(null); void mutate(); }} /></Glass>}

      {!book ? <Glass><Empty title="No look book yet">It works best after the characters have looks, the locations have art boards and a few scenes are drawn. It costs about 40 credits.</Empty></Glass> : (
        <>
          <Glass>
            <Small>{book.logline}</Small>
            <h2 className="mt-1 text-[28px] font-semibold tracking-[-0.02em]">{book.title}</h2>
            {editing ? (
              <div className="mt-3"><Area label="Vision" rows={8} value={vision} onChange={(e) => setVision(e.target.value)} /><div className="mt-2 flex gap-2"><Btn variant="primary" onClick={() => void saveVision()}>Save</Btn><Btn onClick={() => { setEditing(false); setVision(book.vision ?? ''); }}>Cancel</Btn></div></div>
            ) : (
              <>
                <p className="mt-3 whitespace-pre-line text-[16px] leading-relaxed text-t2">{book.vision}</p>
                <div className="mt-2 print:hidden"><Btn variant="text" onClick={() => setEditing(true)}>Edit vision</Btn></div>
              </>
            )}
            <div className="mt-5 flex flex-wrap gap-3" aria-label="Palette">
              {book.palette.map((c) => (
                <div key={c.hex} className="w-36">
                  <div className="h-16 rounded-xl border border-white/10" style={{ background: c.hex }} />
                  <div className="mt-1.5 text-[13px] font-medium">{c.name} <span className="text-t3">{c.hex}</span></div>
                  <Small>{c.use}</Small>
                </div>
              ))}
            </div>
          </Glass>

          {data.keyFrames.length > 0 && (
            <Glass>
              <H2>Key frames</H2>
              <div className="mt-3 grid gap-2 [grid-template-columns:repeat(auto-fill,minmax(220px,1fr))]">
                {data.keyFrames.map((f) => {
                  const src = picture(f);
                  // eslint-disable-next-line @next/next/no-img-element
                  return <figure key={f._id}>{src && <img src={src} alt={f.action ?? ''} className="aspect-video w-full rounded-lg object-cover" loading="lazy" />}<figcaption className="mt-1 text-[12px] text-t3">Sc {f.sceneNumber} · {f.shot}</figcaption></figure>;
                })}
              </div>
            </Glass>
          )}

          <div className="grid gap-4 [grid-template-columns:repeat(auto-fit,minmax(320px,1fr))]">
            {book.sections.map((s) => (
              <Glass key={s.key}>
                <H2>{s.title}</H2>
                <p className="mt-2 text-[15px] leading-relaxed text-t2">{s.body}</p>
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {s.imageUrls.length > 0 && <div className="mt-3 grid grid-cols-2 gap-2">{s.imageUrls.map((u) => <img key={u} src={u} alt="" className="aspect-video w-full rounded-lg object-cover" loading="lazy" />)}</div>}
              </Glass>
            ))}
          </div>

          {book.characters.length > 0 && (
            <Glass>
              <H2>Characters</H2>
              <ul className="mt-3 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {book.characters.map((c) => (
                  <li key={c.name} className="flex gap-3">
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {c.imageUrl ? <img src={c.imageUrl} alt={c.name} className="h-24 w-20 shrink-0 rounded-lg object-cover" /> : <span className="h-24 w-20 shrink-0 rounded-lg bg-white/[0.06]" />}
                    <div><div className="text-[15px] font-semibold">{c.name}</div><Small className="mt-1">{c.look}</Small></div>
                  </li>
                ))}
              </ul>
            </Glass>
          )}

          {book.locations.length > 0 && (
            <Glass>
              <H2>Places</H2>
              <ul className="mt-3 grid gap-4 [grid-template-columns:repeat(auto-fill,minmax(260px,1fr))]">
                {book.locations.map((l) => (
                  <li key={l.name}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    {l.imageUrl ? <img src={l.imageUrl} alt={l.name} className="aspect-video w-full rounded-lg object-cover" loading="lazy" /> : <span className="block aspect-video rounded-lg bg-white/[0.06]" />}
                    <div className="mt-2 text-[15px] font-semibold">{l.name}</div>
                    <Small>{l.mood}</Small>
                    {l.palette.length > 0 && <div className="mt-1.5 flex gap-1">{l.palette.map((c) => <span key={c} className="h-4 flex-1 rounded" style={{ background: c }} />)}</div>}
                  </li>
                ))}
              </ul>
            </Glass>
          )}
        </>
      )}
    </>
  );
}
