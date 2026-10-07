'use client';

import clsx from 'clsx';
import { Check, Plus } from 'lucide-react';
import { useEffect, useState, type FormEvent } from 'react';
import { WithStory, WriteTabs, useStory } from '@/components/story';
import { Area, Bar, Btn, Chip, Empty, Glass, H2, Input, Note, Row, Small, Two } from '@/components/ui';
import { api, errorText, useApi } from '@/lib/api';
import type { Character, Story } from '@/lib/types';

export default function CharactersPage() {
  const ctx = useStory();
  return (<><WriteTabs ctx={ctx} /><WithStory ctx={ctx}>{(story) => <Characters key={story._id} story={story} />}</WithStory></>);
}

function Characters({ story }: { story: Story }) {
  const { data: characters, mutate } = useApi<Character[]>(`/characters?storyId=${story._id}`);
  const [id, setId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const current = characters?.find((c) => c._id === id) ?? characters?.[0];
  const [form, setForm] = useState({ name: '', ageRange: '', familyGroup: '', description: '' });
  const [actor, setActor] = useState('');
  useEffect(() => { if (current) setForm({ name: current.name, ageRange: current.ageRange ?? '', familyGroup: current.familyGroup ?? '', description: current.description ?? '' }); }, [current?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  async function run(fn: () => Promise<unknown>) { setError(''); try { await fn(); await mutate(); } catch (e) { setError(errorText(e)); } }
  const save = (body: Partial<Character>) => current && run(() => api.patch(`/characters/${current._id}`, body));
  const add = () => run(async () => { const c = await api.post<Character>('/characters', { storyId: story._id, name: 'New character' }); setId(c._id); });
  const addActor = (e: FormEvent) => { e.preventDefault(); if (current && actor.trim()) { save({ actorOptions: [...current.actorOptions, { name: actor.trim() }] }); setActor(''); } };
  const groups = [...new Set((characters ?? []).map((c) => c.familyGroup || 'No group'))];
  const cast = characters?.filter((c) => c.finalCast).length ?? 0;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[1_1_280px] p-5">
        <div className="flex items-center justify-between"><H2>Characters</H2><Btn variant="text" icon={Plus} className="px-2.5" onClick={add}>Add</Btn></div>
        {characters?.length === 0 && <Small className="mt-3">No characters yet. Add the first one.</Small>}
        {groups.map((g) => (
          <div key={g}>
            <Small className="mb-2 ml-1 mt-4">{g}</Small>
            <div className="flex flex-col gap-2">
              {characters?.filter((c) => (c.familyGroup || 'No group') === g).map((c) => (
                <button key={c._id} type="button" aria-pressed={current?._id === c._id} onClick={() => setId(c._id)} className={clsx('flex min-h-[44px] w-full items-center justify-between gap-2.5 rounded-2xl border px-3.5 py-3 text-left', current?._id === c._id ? 'border-violet/55 bg-violet/20' : 'sub')}>
                  <Two a={c.name} b={c.ageRange} />{c.finalCast ? <Chip tone="ok">Cast</Chip> : <Chip tone={c.actorOptions.length ? 'warn' : 'idle'}>{c.actorOptions.length ? `${c.actorOptions.length} options` : 'No options yet'}</Chip>}
                </button>
              ))}
            </div>
          </div>
        ))}
      </Glass>

      <Glass className="min-w-0 flex-[999_1_560px] p-7">
        {!current ? <Empty title="No character selected">Add a character to start casting.</Empty> : (
          <>
            <div className="mb-[18px] flex flex-wrap items-center justify-between gap-3"><h1 className="text-[26px] font-semibold tracking-[-0.02em]">{current.name}</h1>{current.finalCast ? <Chip tone="ok">Cast: {current.finalCast}</Chip> : <Chip tone="warn">Final cast not chosen</Chip>}</div>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              <Input label="Character name" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
              <Input label="Age range" value={form.ageRange} onChange={(e) => setForm({ ...form, ageRange: e.target.value })} placeholder="55 to 60" />
              <Input label="Family group" value={form.familyGroup} onChange={(e) => setForm({ ...form, familyGroup: e.target.value })} />
            </div>
            <div className="mt-3"><Area label="Description and role" dir="auto" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} /></div>
            <div className="mt-3 flex flex-wrap justify-between gap-2.5"><Btn variant="danger" onClick={() => run(async () => { await api.del(`/characters/${current._id}`); setId(null); })}>Delete character</Btn><Btn variant="primary" disabled={!form.name.trim()} onClick={() => save(form)}>Save character</Btn></div>

            <div className="mb-3 mt-7 flex items-center justify-between"><H2>Actor options</H2><span className="text-[13px] text-t3">Pick one to lock the casting</span></div>
            <div className="flex flex-col gap-2.5">
              {current.actorOptions.length === 0 && <Small>No actor options yet.</Small>}
              {current.actorOptions.map((a) => {
                const final = current.finalCast === a.name;
                return (
                  <div key={a.name} className={clsx('flex flex-wrap items-center justify-between gap-3 rounded-[18px] border p-4', final ? 'border-ok/45 bg-ok/10' : 'sub')}>
                    <div className="min-w-0 flex-[1_1_260px]"><div className="text-base font-semibold">{a.name}</div>{a.note && <div className="mt-0.5 text-sm text-t2">{a.note}</div>}</div>
                    {final ? <Chip tone="ok">Final cast</Chip> : <Btn icon={Check} onClick={() => save({ finalCast: a.name })}>Choose as final cast</Btn>}
                  </div>
                );
              })}
            </div>
            <form onSubmit={addActor} className="mt-3.5 flex flex-wrap items-end gap-2.5"><div className="flex-[999_1_260px]"><Input label="Add an actor" value={actor} onChange={(e) => setActor(e.target.value)} placeholder="Actor’s name" /></div><Btn icon={Plus} type="submit" disabled={!actor.trim()}>Add option</Btn></form>
            {error && <div className="mt-4"><Note>{error}</Note></div>}
          </>
        )}
      </Glass>

      <Glass className="min-w-0 flex-[1_1_300px] p-[22px]">
        <H2>Casting progress</H2><Small className="mb-2.5 mt-1.5 text-t2">{cast} of {characters?.length ?? 0} characters cast</Small>
        <Bar value={characters?.length ? (cast / characters.length) * 100 : 0} />
        <div className="mt-3">{characters?.map((c) => <Row key={c._id} left={<Two a={c.name} b={c.finalCast ?? `${c.actorOptions.length} options`} />} right={<Chip tone={c.finalCast ? 'ok' : c.actorOptions.length ? 'warn' : 'idle'}>{c.finalCast ? 'Cast' : c.actorOptions.length ? 'Choose' : 'Open'}</Chip>} />)}</div>
      </Glass>
    </div>
  );
}
