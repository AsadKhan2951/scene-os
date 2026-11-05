'use client';

import { ArrowRight, FileUp, Mic, Plus, Square } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { LANGUAGES, SCRIPT_FILE_TYPES, WRITING_FORMATS, label } from '@sceneos/shared';
import { RunChecklist } from '@/components/run';
import { useApp } from '@/components/shell';
import { WriteTabs, useStory } from '@/components/story';
import { Area, Btn, Chip, Glass, H2, Input, Note, Select, Small } from '@/components/ui';
import { api, errorText, refresh, upload, useApi } from '@/lib/api';
import type { AiRun, Story, StoryOverview } from '@/lib/types';

export default function IntakePage() {
  const ctx = useStory();
  return (
    <>
      <WriteTabs ctx={ctx} />
      <Intake key={ctx.story?._id ?? 'none'} story={ctx.story} onCreated={(s) => ctx.choose(s._id)} />
    </>
  );
}

/** Start a story to import into, when there is none yet or the person wants a new one. */
function NewStory({ onCreated }: { onCreated: (s: Story) => void }) {
  const { productions } = useApp();
  const [error, setError] = useState('');
  async function create(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    setError('');
    try {
      const s = await api.post<Story>('/writers/stories', { title: f.get('title'), format: f.get('format'), language: f.get('language'), productionId: f.get('productionId') || undefined, answers: [] });
      await refresh('/writers/stories');
      onCreated(s);
    } catch (err) { setError(errorText(err)); }
  }
  return (
    <form onSubmit={create} className="flex flex-col gap-3">
      <Input label="Title" name="title" required maxLength={200} />
      <div className="grid grid-cols-2 gap-3">
        <Select label="Format" name="format" options={WRITING_FORMATS} defaultValue="feature_film" />
        <Select label="Language" name="language" options={LANGUAGES.map((l) => ({ value: l, label: l === 'urdu' ? 'Urdu (اردو)' : label(l) }))} />
      </div>
      <Select label="Project" name="productionId" options={[{ value: '', label: 'Not linked yet' }, ...(productions ?? []).map((p) => ({ value: p._id, label: p.title }))]} />
      {error && <Note>{error}</Note>}
      <Btn variant="primary" icon={Plus} type="submit">Create story</Btn>
    </form>
  );
}

function Intake({ story, onCreated }: { story: Story | undefined; onCreated: (s: Story) => void }) {
  const router = useRouter();
  const { data, mutate } = useApi<StoryOverview>(story ? `/script-director/stories/${story._id}/overview` : null);
  const [runId, setRunId] = useState<string | null>(null);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [pasted, setPasted] = useState('');
  const [heard, setHeard] = useState('');
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const activeRun = runId ?? data?.run?._id ?? null;

  async function send(file: Blob, name: string) {
    if (!story) return;
    setError(''); setBusy('upload');
    try {
      const run = await upload<AiRun>(`/script-director/stories/${story._id}/import?name=${encodeURIComponent(name)}`, file);
      setRunId(run._id);
      await refresh('/credits');
    } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
  }
  const pick = (e: ChangeEvent<HTMLInputElement>) => { const f = e.target.files?.[0]; if (f) void send(f, f.name); e.target.value = ''; };

  async function record() {
    if (recorder.current) { recorder.current.stop(); return; }
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      const chunks: Blob[] = [];
      rec.ondataavailable = (e) => chunks.push(e.data);
      rec.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        recorder.current = null;
        const seconds = Math.max(1, Math.round((Date.now() - started.current) / 1000));
        setBusy('dictate');
        try {
          const r = await upload<{ text: string }>(`/script-director/dictate?seconds=${seconds}`, new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
          setHeard((h) => (h ? `${h}\n\n${r.text}` : r.text));
          await refresh('/credits');
        } catch (e) { setError(errorText(e)); } finally { setBusy(''); }
      };
      started.current = Date.now();
      rec.start();
      recorder.current = rec;
      setBusy('recording');
    } catch { setError('The microphone could not be opened. Allow microphone access for this site and try again.'); }
  }

  const stats = data?.story.stats;
  return (
    <>
      <div>
        <Chip tone="ai">Scene AI reads your story</Chip>
        <h1 className="mt-3 text-[34px] font-semibold leading-tight tracking-[-0.02em]">{story ? `${story.title} is taking shape.` : 'Bring in a script.'}</h1>
        <p className="mt-1.5 text-base text-t2">Upload a script and Scene AI finds the characters, writes their characterisation, plans the costume looks and writes coverage.</p>
      </div>
      {error && <Note>{error}</Note>}
      <div className="flex flex-wrap items-start gap-4">
        <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4">
          {!story || creating ? (
            <Glass><H2>New story</H2><div className="mt-3"><NewStory onCreated={(s) => { setCreating(false); onCreated(s); }} /></div>{story && <Btn variant="text" className="mt-2" onClick={() => setCreating(false)}>Cancel</Btn>}</Glass>
          ) : (
            <Glass>
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div><H2>{data?.story.sourceFile?.name ?? 'Upload the script'}</H2><Small>{data?.story.sourceFile ? `${label(data.story.sourceFile.format)} · ${data.story.genre ?? label(story.format)}` : `Reads ${SCRIPT_FILE_TYPES.join(' ')}. InPage and Celtx: export as PDF.`}</Small></div>
                <div className="flex flex-wrap gap-2">
                  <input ref={fileInput} type="file" accept={SCRIPT_FILE_TYPES.join(',')} className="sr-only" onChange={pick} aria-label="Script file" />
                  <Btn variant="primary" icon={FileUp} disabled={!!busy} onClick={() => fileInput.current?.click()}>{busy === 'upload' ? 'Uploading…' : data?.story.sourceFile ? 'Upload a new draft' : 'Upload script'}</Btn>
                  <Btn icon={Plus} onClick={() => setCreating(true)}>New story</Btn>
                </div>
              </div>
              {stats && (
                <div className="mt-5 grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(130px,1fr))]">
                  {[[stats.scenes, 'scenes'], [stats.characters, 'characters'], [stats.mainCharacters, 'main characters'], [stats.locations, 'locations in the script'], [stats.pages, `pages, about ${stats.runtimeMinutes} min`]].map(([n, l]) => (
                    <div key={String(l)} className="sub rounded-[18px] p-4"><div className="text-3xl font-semibold">{n}</div><Small className="mt-1">{l}</Small></div>
                  ))}
                </div>
              )}
              {data?.story.logline && <p dir="auto" className="mt-4 text-[15px] italic text-t2">{data.story.logline}</p>}
              <H2 className="mt-6">What Scene AI is building</H2>
              {activeRun ? <div className="mt-1"><RunChecklist runId={activeRun} onDone={() => void mutate()} /></div> : <Small className="mt-2">Upload a script to start.</Small>}
            </Glass>
          )}
          {story && !creating && (
            <Glass>
              <H2>No file? Paste the script</H2>
              <Small className="mt-1">Scene headings must start with INT. or EXT.</Small>
              <div className="mt-3"><Area label="Screenplay text" rows={6} dir="auto" value={pasted} onChange={(e) => setPasted(e.target.value)} placeholder={'1. EXT. GWADAR HARBOUR - NIGHT\n\nRain. IDRIS hauls salt sacks onto the ferry.\n\nIDRIS\nNot tonight.'} /></div>
              <div className="mt-3"><Btn disabled={!pasted.trim() || !!busy} onClick={() => send(new Blob([pasted], { type: 'text/plain' }), 'pasted-script.txt')}>Read this text</Btn></div>
            </Glass>
          )}
        </div>
        <div className="flex min-w-0 flex-[1_1_320px] flex-col gap-4">
          <Glass>
            <H2>Or tell it out loud</H2>
            <Small className="mt-1">Speak the synopsis in any language; Scene AI writes it down. Then turn it into a story in the wizard.</Small>
            <div className="mt-4"><Btn variant={busy === 'recording' ? 'danger' : 'primary'} icon={busy === 'recording' ? Square : Mic} disabled={busy === 'dictate' || busy === 'upload'} onClick={record}>{busy === 'recording' ? 'Stop and write it down' : busy === 'dictate' ? 'Writing it down…' : 'Start speaking'}</Btn></div>
            {heard && (
              <>
                <div className="mt-4"><Area label="What Scene AI heard" rows={5} dir="auto" value={heard} onChange={(e) => setHeard(e.target.value)} /></div>
                <div className="mt-3"><Btn icon={ArrowRight} onClick={() => router.push(`/write/new?idea=${encodeURIComponent(heard)}`)}>Build a story from this</Btn></div>
              </>
            )}
          </Glass>
          {data && data.characters.length > 0 && (
            <Glass>
              <H2>Characters found</H2>
              <ul className="mt-2">
                {data.characters.slice(0, 8).map((c) => (
                  <li key={c._id} className="rule flex items-center justify-between gap-3 py-2.5"><div><div className="text-[15px] font-medium">{c.name}</div><Small>{[c.role && label(c.role), c.sceneCount && `${c.sceneCount} scenes`].filter(Boolean).join(' · ')}</Small></div>{c.locked && <Chip tone="ai">Locked</Chip>}</li>
                ))}
              </ul>
              <div className="mt-3"><Btn variant="primary" icon={ArrowRight} href="/write/characters">Review characters</Btn></div>
            </Glass>
          )}
        </div>
      </div>
    </>
  );
}
