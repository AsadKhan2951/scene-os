'use client';

import clsx from 'clsx';
import { Check, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { label } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Async, Btn, Chip, Empty, Glass, H2, Input, Note, Small, Sub } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { day, num, pkr } from '@/lib/format';
import { TABS } from '@/lib/nav';
import type { ExpenseSheet } from '@/lib/types';

const total = (s: ExpenseSheet) => s.items.reduce((a, i) => a + i.requested, 0);
const prod = (s: ExpenseSheet) => (typeof s.productionId === 'string' ? '' : s.productionId.title);

export default function ApprovalsPage() {
  const { me } = useApp();
  const { data, error: loadError, mutate } = useApi<ExpenseSheet[]>('/expenses?status=submitted');
  const [id, setId] = useState<string | null>(null);
  const sheet = data?.find((s) => s._id === id) ?? data?.[0];
  const [approved, setApproved] = useState<Record<string, string>>({});
  const [comment, setComment] = useState('');
  const [msg, setMsg] = useState<{ tone: 'ok' | 'risk'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  useEffect(() => { setApproved(Object.fromEntries((sheet?.items ?? []).map((i) => [i._id, String(i.requested)]))); setComment(''); }, [sheet?._id]); // eslint-disable-line react-hooks/exhaustive-deps

  const admin = me?.role === 'admin';
  const approvedTotal = Object.values(approved).reduce((a, v) => a + (Number(v) || 0), 0);
  async function decide(action: 'approve' | 'reject' | 'revise', done: string) {
    if (!sheet) return;
    setBusy(true); setMsg(null);
    try {
      await api.post(`/expenses/${sheet._id}/${action}`, { comment: comment.trim() || undefined, approved: action === 'approve' ? Object.fromEntries(Object.entries(approved).map(([k, v]) => [k, Number(v) || 0])) : undefined });
      setMsg({ tone: 'ok', text: done }); setId(null);
      await Promise.all([mutate(), refresh('/insights')]);
    } catch (e) { setMsg({ tone: 'risk', text: errorText(e) }); } finally { setBusy(false); }
  }

  return (
    <>
      <SectionTabs items={TABS.money} scoped={false} />
      <Async data={data} error={loadError}>
        {(sheets) => (
          <>
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(230px,1fr))]">
              <Glass className="rounded-3xl p-5"><div className="text-sm text-t2">Waiting for approval</div><div className="mt-1.5 text-3xl font-semibold tracking-[-0.02em]">{pkr(sheets.reduce((a, s) => a + total(s), 0))}</div></Glass>
              <Glass className="rounded-3xl p-5"><div className="text-sm text-t2">Expense sheets</div><div className="mt-1.5 text-3xl font-semibold tracking-[-0.02em]">{sheets.length}</div></Glass>
              <Glass className="rounded-3xl p-5"><div className="text-sm text-t2">Oldest submitted</div><div className="mt-1.5 text-3xl font-semibold tracking-[-0.02em]">{sheets[0] ? day(sheets[0].submittedAt) : 'None'}</div></Glass>
            </div>
            {msg && <Note tone={msg.tone}>{msg.text}</Note>}
            <div className="flex flex-wrap items-start gap-4">
              <Glass className="min-w-0 flex-[1_1_280px] p-5">
                <H2>Waiting for you</H2><Small className="mb-3 mt-1">Oldest first</Small>
                {sheets.length === 0 && <Small>Nothing is waiting.</Small>}
                <div className="flex flex-col gap-2">
                  {sheets.map((s) => (
                    <button key={s._id} type="button" aria-pressed={sheet?._id === s._id} onClick={() => setId(s._id)} className={clsx('min-h-[44px] w-full rounded-[18px] border p-3.5 text-left', sheet?._id === s._id ? 'border-violet/55 bg-violet/20' : 'sub')}>
                      <span className="flex justify-between gap-2 text-[15px] font-medium"><span>{s.shootDay ? `Day ${s.shootDay}, ` : ''}{day(s.shootDate)}</span><span>{pkr(total(s))}</span></span>
                      <Small className="mt-0.5">{prod(s)}{s.lineProducer ? `, ${s.lineProducer}` : ''}, {s.items.length} items</Small>
                    </button>
                  ))}
                </div>
              </Glass>
              <Glass className="min-w-0 flex-[999_1_560px]">
                {!sheet ? <Empty title="No expense sheets are waiting">New submissions from line producers appear here.</Empty> : (
                  <>
                    <div className="mb-4 flex flex-wrap items-center justify-between gap-3"><div><h1 className="text-[26px] font-semibold tracking-[-0.02em]">{sheet.shootDay ? `Day ${sheet.shootDay} expenses, ` : 'Expenses, '}{day(sheet.shootDate)}</h1><Small>{prod(sheet)}{sheet.lineProducer ? `. Submitted by ${sheet.lineProducer}` : ''}</Small></div><Chip tone="warn">Submitted</Chip></div>
                    <div className="overflow-x-auto">
                      <table className="w-full min-w-[600px] border-collapse text-left">
                        <thead><tr className="text-[13px] text-t3"><th scope="col" className="pb-2.5 pr-3.5 font-medium">Category</th><th scope="col" className="pb-2.5 pr-3.5 font-medium">Note</th><th scope="col" className="pb-2.5 pr-3.5 text-right font-medium">Requested, PKR</th><th scope="col" className="pb-2.5 text-right font-medium">Approved, PKR</th></tr></thead>
                        <tbody>
                          {sheet.items.map((i) => (
                            <tr key={i._id} className="[&>td]:rule [&>td]:py-2.5">
                              <td className="pr-3.5 text-[15px] font-medium">{label(i.category)}</td><td className="pr-3.5 text-sm text-t2">{i.note}</td><td className="pr-3.5 text-right text-[15px]">{num(i.requested)}</td>
                              <td className="text-right"><input aria-label={`Approved amount for ${label(i.category)}`} type="number" min={0} disabled={!admin} value={approved[i._id] ?? ''} onChange={(e) => setApproved({ ...approved, [i._id]: e.target.value })} className="field ml-auto min-h-[44px] w-[130px] text-right" /></td>
                            </tr>
                          ))}
                          <tr className="[&>td]:rule [&>td]:pt-3.5"><td className="text-[15px] font-semibold">Total</td><td /><td className="pr-3.5 text-right text-[15px] font-semibold">{num(total(sheet))}</td><td className="pr-3 text-right text-[15px] font-semibold">{num(approvedTotal)}</td></tr>
                        </tbody>
                      </table>
                    </div>
                    <div className="mt-5 border-t border-white/10 pt-[18px]">
                      <div className="mb-2.5 text-sm text-t2">Comments</div>
                      {sheet.notes && <Sub className="mb-2 p-3.5 text-[15px] text-t2">{sheet.notes}</Sub>}
                      {sheet.comments.filter((c) => c.text).map((c, i) => <Sub key={i} className="mb-2 p-3.5"><div className="text-sm font-medium">{c.by}<span className="ml-2 font-normal text-t3">{day(c.at)}, {c.action}</span></div><div className="mt-1 text-[15px] text-t2">{c.text}</div></Sub>)}
                      <Input label="Your comment (needed to send a sheet back)" value={comment} onChange={(e) => setComment(e.target.value)} disabled={!admin} />
                    </div>
                    {admin ? (
                      <div className="mt-5 flex flex-wrap justify-between gap-3">
                        <Btn variant="danger" icon={X} disabled={busy} onClick={() => decide('reject', 'Sheet rejected.')}>Reject sheet</Btn>
                        <div className="flex flex-wrap gap-2.5"><Btn disabled={busy || !comment.trim()} onClick={() => decide('revise', 'Sheet sent back for revision.')}>Send back for revision</Btn><Btn variant="primary" icon={Check} disabled={busy} onClick={() => decide('approve', `Approved ${pkr(approvedTotal)}.`)}>Approve {pkr(approvedTotal)}</Btn></div>
                      </div>
                    ) : <div className="mt-5"><Note tone="warn">Only admins can approve, reject or send back expense sheets.</Note></div>}
                  </>
                )}
              </Glass>
            </div>
          </>
        )}
      </Async>
    </>
  );
}
