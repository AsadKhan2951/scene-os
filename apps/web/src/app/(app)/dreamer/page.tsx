'use client';

import clsx from 'clsx';
import { Check, Download, Plus, Send, Sparkles } from 'lucide-react';
import { useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useRef, useState, type FormEvent } from 'react';
import { Btn, Chip, Glass, H2, Note, Row, Small, Two } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day } from '@/lib/format';
import type { DreamerChat, DreamerItem } from '@/lib/types';

const EXPORTS = [['productions', 'Productions summary'], ['pipeline', 'Pipeline status'], ['episodes', 'Episode tracker'], ['budget', 'Budget and expenses'], ['full', 'Full report']];
interface Report { _id: string; type: string; content: string; createdAt: string }

function Dreamer() {
  const asked = useSearchParams().get('q');
  const [chat, setChat] = useState<DreamerChat | null>(null);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [report, setReport] = useState<Report | null>(null);
  const { data: chats } = useApi<{ _id: string; title?: string; updatedAt: string }[]>('/dreamer/chats');
  const { data: reports } = useApi<Report[]>('/dreamer/reports');
  const sentInitial = useRef(false);

  async function run<T>(fn: () => Promise<T>, done: (r: T) => void) {
    setBusy(true); setError('');
    try { done(await fn()); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  }
  const send = (message: string) => run(() => api.post<DreamerChat>('/dreamer/messages', { chatId: chat?.id, message }), (c) => { setChat(c); setText(''); refresh('/dreamer/chats'); });
  const resolve = (accept: boolean) => chat && run(() => api.post<DreamerChat>(`/dreamer/chats/${chat.id}/confirm`, { accept }), (c) => { setChat(c); refresh('/'); });
  const openChat = (id: string) => run(() => api.get<DreamerChat>(`/dreamer/chats/${id}`), setChat);
  const write = (type: string) => run(() => api.post<Report>('/dreamer/reports', { type }), (r) => { setReport(r); refresh('/dreamer/reports'); });

  // A question typed on the command centre arrives as ?q= and is asked once.
  useEffect(() => { if (asked && !sentInitial.current) { sentInitial.current = true; send(asked); } }, [asked]); // eslint-disable-line react-hooks/exhaustive-deps
  const submit = (e: FormEvent) => { e.preventDefault(); if (text.trim() && !busy) send(text.trim()); };
  const lastConfirm = chat ? chat.display.map((d) => d.kind).lastIndexOf('confirm') : -1;

  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[1_1_250px] p-4">
        <Btn icon={Plus} className="w-full" onClick={() => { setChat(null); setReport(null); }}>New conversation</Btn>
        <Small className="mb-2 ml-3 mt-5">Recent</Small>
        <div className="flex flex-col gap-0.5">
          {chats?.length === 0 && <Small className="ml-3">No conversations yet.</Small>}
          {chats?.map((c) => (
            <button key={c._id} type="button" onClick={() => openChat(c._id)} className={clsx('min-h-[44px] w-full rounded-[14px] border px-3 py-2.5 text-left', chat?.id === c._id ? 'border-white/[0.14] bg-white/10' : 'border-transparent hover:bg-white/5')}>
              <div className="truncate text-sm font-medium">{c.title || 'Conversation'}</div><Small>{day(c.updatedAt)}</Small>
            </button>
          ))}
        </div>
      </Glass>

      <Glass className="min-w-0 flex-[999_1_560px] p-7">
        <div className="mb-5 flex flex-wrap items-center justify-between gap-2.5"><h1 className="text-[26px] font-semibold tracking-[-0.02em]">Dreamer</h1><Chip tone="ai">Answers from live production data</Chip></div>
        {report ? (
          <article><H2>{report.type[0].toUpperCase() + report.type.slice(1)} report, {day(report.createdAt)}</H2><div className="mt-3 whitespace-pre-wrap text-[15px] leading-relaxed text-t2">{report.content}</div></article>
        ) : (
          <div className="flex flex-col gap-5" aria-live="polite">
            {!chat && !busy && <p className="text-[15px] text-t2">Ask about status, scenes, budget or risk, or tell Dreamer to create a milestone, a call sheet or add someone to a production.</p>}
            {chat?.display.map((item, i) => <Bubble key={i} item={item} live={!!chat.pendingAction && i === lastConfirm} busy={busy} onResolve={resolve} />)}
            {busy && <div role="status" className="text-[13px] text-t3">Dreamer is working…</div>}
          </div>
        )}
        {error && <div className="mt-4"><Note>{error}</Note></div>}
        {!report && (
          <form onSubmit={submit} className="sub mt-6 flex items-center gap-2.5 rounded-[26px] py-2 pl-[18px] pr-2">
            <input value={text} onChange={(e) => setText(e.target.value)} aria-label="Message Dreamer" placeholder="Ask a question or tell Dreamer what to do" disabled={!!chat?.pendingAction}
              className="min-h-[48px] min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-t3" />
            <Btn variant="primary" icon={Send} type="submit" disabled={busy || !!chat?.pendingAction}>Send</Btn>
          </form>
        )}
        <Small className="mt-2.5">Money, stage changes and status changes always ask you first.</Small>
      </Glass>

      <div className="flex min-w-0 flex-[1_1_300px] flex-col gap-4">
        <Glass className="p-[22px]">
          <H2>Reports</H2><Small className="mb-2 mt-1">Written by Dreamer from current data</Small>
          {['daily', 'weekly', 'monthly'].map((t) => {
            const last = reports?.find((r) => r.type === t);
            return <Row key={t} left={<button type="button" className="text-left" onClick={() => last && setReport(last)} disabled={!last}><Two a={`${t[0].toUpperCase()}${t.slice(1)} report`} b={last ? `Last written ${day(last.createdAt)}` : 'Not written yet'} /></button>} right={<Btn icon={Sparkles} className="px-3.5" disabled={busy} onClick={() => write(t)}>Write</Btn>} />;
          })}
        </Glass>
        <Glass className="p-[22px]">
          <H2>Excel exports</H2><Small className="mb-2 mt-1">Current data, ready for finance and channel packs</Small>
          {EXPORTS.map(([type, name]) => (
            <Row key={type} className="py-1.5" left={<span className="text-[15px]">{name}</span>} right={<a href={`/api/exports/${type}`} aria-label={`Download ${name} as Excel`} className="inline-flex h-11 w-11 items-center justify-center rounded-full hover:bg-white/10"><Download size={18} aria-hidden /></a>} />
          ))}
        </Glass>
      </div>
    </div>
  );
}

function Bubble({ item, live, busy, onResolve }: { item: DreamerItem; live: boolean; busy: boolean; onResolve: (accept: boolean) => void }) {
  if (item.kind === 'user') return <div className="max-w-[78%] self-end whitespace-pre-wrap rounded-[22px_22px_6px_22px] border border-violet/30 bg-violet/25 px-[18px] py-3.5 text-[15px] leading-normal">{item.text}</div>;
  if (item.kind === 'assistant') return <div className="max-w-[88%] self-start whitespace-pre-wrap text-[15px] leading-relaxed">{item.text}</div>;
  if (item.kind === 'action') return <div className="sub max-w-[88%] self-start rounded-[18px] p-4"><div className="flex flex-wrap items-center justify-between gap-2"><span className="text-[15px]">{item.summary}</span><Chip tone={item.ok ? 'ok' : 'idle'}>{item.ok ? 'Done' : 'Not done'}</Chip></div></div>;
  return (
    <div className="max-w-[88%] self-start rounded-[18px] border border-warn/35 bg-warn/[0.07] p-4">
      <div className="flex flex-wrap items-center justify-between gap-2"><span className="font-semibold">{item.summary}</span>{live && <Chip tone="warn">Waiting for you</Chip>}</div>
      {live && (
        <>
          <p className="mb-3 mt-1.5 text-sm text-t2">Nothing changes until you confirm.</p>
          <div className="flex flex-wrap gap-2.5"><Btn variant="primary" icon={Check} disabled={busy} onClick={() => onResolve(true)}>Confirm</Btn><Btn disabled={busy} onClick={() => onResolve(false)}>Cancel</Btn></div>
        </>
      )}
    </div>
  );
}

export default function DreamerPage() {
  return <Suspense><Dreamer /></Suspense>;
}
