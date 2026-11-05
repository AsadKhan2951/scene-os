'use client';

import { Plus, Save } from 'lucide-react';
import { useState, type FormEvent } from 'react';
import { label } from '@sceneos/shared';
import { SectionTabs, useApp } from '@/components/shell';
import { Async, Bar, Btn, Glass, H2, Input, Note, PageTitle, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { CreditSummary, UsageEvent } from '@/lib/types';

const n = (v: number | undefined, digits = 0) => (v ?? 0).toLocaleString('en-US', { maximumFractionDigits: digits });
const usd = (v: number) => `$${v < 1 ? v.toFixed(4) : v.toFixed(2)}`;
const when = (d: string) => new Date(d).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/** What a usage row used: tokens for Claude, units for media and search. */
function used(e: UsageEvent) {
  if (e.provider === 'anthropic') {
    const parts = [`${n(e.inputTokens)} in`, `${n(e.outputTokens)} out`];
    if (e.cacheReadTokens) parts.push(`${n(e.cacheReadTokens)} cached`);
    return `${parts.join(' · ')} tokens`;
  }
  return `${n(e.quantity, 2)} × ${(e.unit ?? '').split('.').pop()?.replace(/_/g, ' ')}`;
}

export default function CreditsPage() {
  const { me } = useApp();
  const admin = me?.role === 'admin';
  const { data, error } = useApi<CreditSummary>('/credits');
  const { data: usage, error: usageError } = useApi<UsageEvent[]>('/credits/usage?limit=100');
  const [note, setNote] = useState('');
  const [problem, setProblem] = useState('');

  async function run(fn: () => Promise<unknown>, done: string) {
    setProblem(''); setNote('');
    try { await fn(); await refresh('/credits'); setNote(done); } catch (e) { setProblem(errorText(e)); }
  }
  function grant(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget; const f = new FormData(form);
    void run(async () => { await api.post('/credits/grant', { credits: Number(f.get('credits')), note: String(f.get('note') || '') || undefined }); form.reset(); }, 'Credits added.');
  }
  function settings(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    void run(() => api.patch('/credits/settings', { monthlyCredits: Number(f.get('monthlyCredits')), markup: Number(f.get('markup')), hardLimit: f.get('hardLimit') === 'on' }), 'Settings saved.');
  }

  return (
    <>
      <SectionTabs items={TABS.home} scoped={false} />
      <Async data={data} error={error} what="Loading AI credits">
        {(c) => (
          <>
            <PageTitle title="AI credits" sub={`${n(c.available)} of ${n(c.monthlyCredits)} credits left this month. Every AI action is metered by the tokens or units it used.`} />
            <div className="grid gap-3 [grid-template-columns:repeat(auto-fit,minmax(200px,1fr))]">
              {[
                ['Available now', n(c.available), c.held > 0 ? `${n(c.held)} reserved for running jobs` : 'Nothing reserved'],
                ['Used this month', n(c.usedThisMonth, 1), `${usd(c.byFeature.reduce((s, f) => s + f.costUsd, 0))} provider cost`],
                ['Monthly allowance', n(c.monthlyCredits), 'Topped up on the 1st of each month'],
                ['1 credit', `$${c.creditUsd}`, `Provider cost × ${c.markup}`],
              ].map(([a, b, d]) => (
                <Glass key={a} className="rounded-[22px] p-[18px]"><Small>{a}</Small><div className="mt-1 text-3xl font-semibold">{b}</div><Small className="mt-1">{d}</Small></Glass>
              ))}
            </div>
            {note && <Note tone="ok">{note}</Note>}
            {problem && <Note>{problem}</Note>}
            <div className="flex flex-wrap items-start gap-4">
              <Glass className="min-w-0 flex-[1_1_420px]">
                <H2>This month by feature</H2>
                {c.byFeature.length === 0 ? <Small className="mt-2">No AI use yet this month.</Small> : (
                  <div className="mt-3 flex flex-col gap-3">
                    {c.byFeature.map((f) => (
                      <div key={f.feature}>
                        <div className="flex items-baseline justify-between gap-3 text-[15px]"><span>{f.label}</span><span className="font-medium">{n(f.credits, 1)} credits</span></div>
                        <Bar value={c.usedThisMonth ? (f.credits / c.usedThisMonth) * 100 : 0} className="mt-1.5" />
                        <Small className="mt-1">{f.calls} call{f.calls === 1 ? '' : 's'} · {usd(f.costUsd)} provider cost</Small>
                      </div>
                    ))}
                  </div>
                )}
              </Glass>
              <Glass className="min-w-0 flex-[1_1_420px]">
                <H2>This month by model</H2>
                {c.byModel.length === 0 ? <Small className="mt-2">No AI use yet this month.</Small> : (
                  <div className="mt-2 overflow-x-auto">
                    <table className="w-full min-w-[460px] border-collapse text-left">
                      <thead><tr className="text-[13px] text-t3">{['Model', 'Calls', 'Tokens in / out', 'Credits'].map((h) => <th key={h} scope="col" className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                      <tbody>
                        {c.byModel.map((m) => (
                          <tr key={`${m.provider}-${m.model}`} className="text-sm [&>td]:rule [&>td]:py-2.5 [&>td]:pr-3">
                            <td><div className="font-medium">{m.model ?? label(m.provider)}</div><Small>{label(m.provider)}</Small></td>
                            <td>{n(m.calls)}</td>
                            <td>{m.provider === 'anthropic' ? `${n(m.inputTokens)} / ${n(m.outputTokens)}` : '—'}</td>
                            <td className="font-medium">{n(m.credits, 1)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </Glass>
            </div>
            {admin && (
              <div className="flex flex-wrap items-start gap-4">
                <Glass className="min-w-0 flex-[1_1_360px]">
                  <H2>Add credits</H2>
                  <form onSubmit={grant} className="mt-3 flex flex-col gap-3">
                    <Input label="Credits" name="credits" type="number" min={1} step={1} required />
                    <Input label="Note" name="note" placeholder="For example, top-up for the teaser" />
                    <Btn variant="primary" icon={Plus} type="submit">Add credits</Btn>
                  </form>
                </Glass>
                <Glass className="min-w-0 flex-[1_1_360px]">
                  <H2>Settings</H2>
                  <form onSubmit={settings} className="mt-3 flex flex-col gap-3">
                    <div className="grid grid-cols-2 gap-3">
                      <Input label="Monthly credits" name="monthlyCredits" type="number" min={0} step={1} defaultValue={c.monthlyCredits} required />
                      <Input label="Markup over cost" name="markup" type="number" min={1} max={20} step={0.1} defaultValue={c.markup} required />
                    </div>
                    <label className="flex items-center gap-2.5 text-[15px]"><input type="checkbox" name="hardLimit" defaultChecked={c.hardLimit} className="h-5 w-5" />Stop AI actions when credits run out</label>
                    <Btn icon={Save} type="submit">Save settings</Btn>
                  </form>
                </Glass>
              </div>
            )}
          </>
        )}
      </Async>
      <Glass>
        <H2>Latest AI calls</H2>
        <Async data={usage} error={usageError} what="Loading usage">
          {(rows) => rows.length === 0 ? <Small className="mt-2">Nothing yet.</Small> : (
            <div className="mt-2 overflow-x-auto">
              <table className="w-full min-w-[760px] border-collapse text-left">
                <thead><tr className="text-[13px] text-t3">{['When', 'Who', 'Feature', 'Model', 'Used', 'Cost', 'Credits'].map((h) => <th key={h} scope="col" className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
                <tbody>
                  {rows.map((e) => (
                    <tr key={e._id} className="text-sm [&>td]:rule [&>td]:py-2 [&>td]:pr-3">
                      <td className="whitespace-nowrap text-t2">{when(e.createdAt)}</td>
                      <td>{e.userName ?? '—'}</td>
                      <td>{label(e.feature)}{e.action ? <Small>{label(e.action)}</Small> : null}</td>
                      <td>{e.model ?? label(e.provider)}</td>
                      <td className="text-t2">{used(e)}</td>
                      <td className="text-t2">{usd(e.costUsd)}</td>
                      <td className="font-medium">{n(e.credits, 2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Async>
      </Glass>
    </>
  );
}
