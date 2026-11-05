'use client';

import { CalendarPlus, Check, FileText, Plus, Sparkles, Trash2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useState, type DragEvent } from 'react';
import { SectionTabs, WithProduction } from '@/components/shell';
import { Btn, Chip, Empty, Glass, H2, IconBtn, Input, Note, Pill, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import { TABS } from '@/lib/nav';
import type { Me, PlanScene, Production, ScheduleView } from '@/lib/types';

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const pages = (e: number) => `${Math.floor(e / 8) || ''}${e % 8 ? ` ${e % 8}/8` : ''}`.trim() || '0';
const short = (d: string) => new Date(d).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
const fmt = (d: string) => new Date(d).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' });

/** Strip colours used on paper stripboards: day white/yellow, night blue, dawn and dusk orange. */
function stripTone(time: string) {
  const t = time.toUpperCase();
  if (/NIGHT|RAAT/.test(t)) return 'border-l-[#7c97ff] bg-[#3b4fa8] text-white';
  if (/DAWN|DUSK|MORNING|EVENING|SUBAH|SHAAM/.test(t)) return 'border-l-[#ffbe85] bg-[#e8a56f] text-[#1d1208]';
  return 'border-l-[#fff3b0] bg-[#efe19a] text-[#1d1a08]';
}

export default function PlanPage() {
  return (<><SectionTabs items={TABS.produce} /><WithProduction>{(p, me) => <Plan key={p._id} production={p} me={me} />}</WithProduction></>);
}

function Plan({ production: p, me }: { production: Production; me: Me | undefined }) {
  const router = useRouter();
  const key = `/production/${p._id}/schedule`;
  const { data, mutate } = useApi<ScheduleView | null>(key);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const act = async (fn: () => Promise<ScheduleView | null>) => {
    setError(''); setBusy(true);
    try { await mutate(await fn(), { revalidate: false }); await refresh('/credits'); } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };

  if (data === undefined) return null;
  // "Tomorrow's call sheet": the first shoot day after today (or the first day before the shoot starts).
  const tomorrow = data?.schedule.days.find((d) => new Date(d.date).getTime() > Date.now());
  const makeSheet = async () => {
    if (!data || !tomorrow) return;
    setError(''); setBusy(true);
    try { await api.post(`/production/schedules/${data.schedule._id}/days/${tomorrow.number}/callsheet`); await refresh('/call-sheets'); router.push('/produce/schedule'); }
    catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[34px] font-semibold leading-tight tracking-[-0.02em]">{data ? `Shoot plan: ${data.schedule.days.length} days${data.today ? `, day ${data.today} today` : ''}.` : 'Shoot plan'}</h1>
          <p className="mt-1.5 text-base text-t2">Made from the scene breakdown and the actors&apos; dates in your database. Drag strips to change it; dates and clashes are checked again.</p>
        </div>
        {data && (
          <div className="flex flex-wrap gap-2.5">
            <Btn href="#day-out-of-days">Day-out-of-days</Btn>
            <Btn variant="primary" icon={CalendarPlus} disabled={busy || !tomorrow} onClick={() => void makeSheet()}>{tomorrow ? `Call sheet for day ${tomorrow.number}` : 'Shoot finished'}</Btn>
          </div>
        )}
      </div>
      {error && <Note>{error}</Note>}
      {data && <Timeline view={data} />}
      <PlanForm busy={busy} onPlan={(body) => act(() => api.post(key, body))} existing={data?.schedule} />
      {!data ? <Glass><Empty title="No shoot plan yet">Break the script down, group its locations, then build the plan above.</Empty></Glass> : (
        <>
          <Summary view={data} admin={me?.role === 'admin'} busy={busy} onApprove={() => act(() => api.post(`/production/schedules/${data.schedule._id}/approve`))} />
          <Stripboard view={data} onChange={(days) => act(() => api.patch(`/production/schedules/${data.schedule._id}/days`, { days }))} />
          <div className="flex flex-wrap items-start gap-4">
            <ActorDates view={data} />
            <Itinerary view={data} onSave={(items) => act(() => api.put(`/production/schedules/${data.schedule._id}/itinerary`, { items }))} />
          </div>
          <Dood view={data} />
        </>
      )}
    </>
  );
}

function PlanForm({ busy, onPlan, existing }: { busy: boolean; existing?: ScheduleView['schedule']; onPlan: (body: object) => void }) {
  const [startDate, setStart] = useState(existing?.startDate?.slice(0, 10) ?? new Date(Date.now() + 14 * 864e5).toISOString().slice(0, 10));
  const [daysOff, setOff] = useState<number[]>(existing?.daysOff ?? [5]);
  const [perDay, setPerDay] = useState(String((existing?.maxEighthsPerDay ?? 40) / 8));
  return (
    <Glass>
      <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); onPlan({ startDate, daysOff, maxEighthsPerDay: Math.round(Number(perDay) * 8) || 40, explain: true }); }}>
        <Input label="First shoot day" type="date" value={startDate} onChange={(e) => setStart(e.target.value)} required className="w-44" />
        <Input label="Pages per day" type="number" min={1} max={15} step={0.125} value={perDay} onChange={(e) => setPerDay(e.target.value)} className="w-28" />
        <fieldset>
          <legend className="mb-1.5 text-[13px] text-t3">Days off</legend>
          <div className="flex flex-wrap gap-1.5">{WEEKDAYS.map((d, i) => <Pill key={d} type="button" on={daysOff.includes(i)} aria-pressed={daysOff.includes(i)} onClick={() => setOff(daysOff.includes(i) ? daysOff.filter((x) => x !== i) : [...daysOff, i])}>{d}</Pill>)}</div>
        </fieldset>
        <Btn variant="primary" icon={Sparkles} type="submit" disabled={busy}>{existing ? 'Plan again' : 'Build the shoot plan'}</Btn>
      </form>
      {existing && <Small className="mt-2">Planning again replaces the draft. An approved plan stays until a new one is approved.</Small>}
    </Glass>
  );
}

function Summary({ view, admin, busy, onApprove }: { view: ScheduleView; admin: boolean; busy: boolean; onApprove: () => void }) {
  const s = view.schedule;
  const real = s.conflicts.filter((c) => c.kind !== 'hold');
  return (
    <div className="flex flex-wrap items-start gap-4">
      <Glass className="min-w-0 flex-[2_1_480px]">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <H2>{s.stats.days} shoot days · {s.stats.companyMoves} company moves · {s.stats.holdingDays} holding days</H2>
          {s.status === 'approved' ? <Chip tone="ok">Approved{s.approvedBy ? ` by ${s.approvedBy}` : ''}</Chip>
            : admin ? <Btn variant="primary" icon={Check} disabled={busy || real.length > 0} onClick={onApprove} title={real.length ? 'Fix the date conflicts first' : undefined}>Approve plan</Btn>
              : <Chip tone="warn">Draft, waiting for an admin</Chip>}
        </div>
        {s.explanation && <p className="mt-3 whitespace-pre-line text-[15px] leading-relaxed text-t2">{s.explanation}</p>}
      </Glass>
      <Glass className="min-w-0 flex-[1_1_300px]">
        <H2>Actor dates</H2>
        {s.conflicts.length === 0 ? <Small className="mt-2">No clashes with booked dates.</Small> : (
          <ul className="mt-2">
            {s.conflicts.map((c, i) => (
              <li key={i} className="rule flex items-start justify-between gap-3 py-2">
                <div><div className="text-[14px] font-medium">Day {c.day}: {c.character}{c.actor ? ` (${c.actor})` : ''}</div><Small>Sc {c.scene}{c.note ? ` · ${c.note}` : ''}</Small></div>
                <Chip tone={c.kind === 'hold' ? 'warn' : 'risk'}>{c.kind}</Chip>
              </li>
            ))}
          </ul>
        )}
      </Glass>
    </div>
  );
}

type DayEdit = { locationName: string; sceneIds: string[] };

function Stripboard({ view, onChange }: { view: ScheduleView; onChange: (days: DayEdit[]) => void }) {
  const byId = new Map(view.scenes.map((s) => [s.id, s]));
  const [over, setOver] = useState<number | null>(null);
  const [sheet, setSheet] = useState<Record<number, string>>({});
  const conflictDays = new Set(view.schedule.conflicts.filter((c) => c.kind !== 'hold').map((c) => c.day));
  const days: DayEdit[] = view.schedule.days.map((d) => ({ locationName: d.locationName, sceneIds: d.sceneIds.map(String) }));

  const move = (sceneId: string, to: number) => {
    const next = days.map((d) => ({ ...d, sceneIds: d.sceneIds.filter((id) => id !== sceneId) }));
    if (to === next.length) next.push({ locationName: byId.get(sceneId)?.location ?? '', sceneIds: [sceneId] });
    else next[to].sceneIds.push(sceneId);
    onChange(next.filter((d) => d.sceneIds.length));
  };
  const drop = (to: number) => (e: DragEvent) => { e.preventDefault(); setOver(null); const id = e.dataTransfer.getData('text/plain'); if (id) move(id, to); };
  const target = (i: number) => ({ onDragOver: (e: DragEvent) => { e.preventDefault(); setOver(i); }, onDragLeave: () => setOver(null), onDrop: drop(i) });
  const callSheet = async (n: number) => {
    try { await api.post(`/production/schedules/${view.schedule._id}/days/${n}/callsheet`); setSheet({ ...sheet, [n]: 'Draft call sheet made' }); await refresh("/call-sheets"); }
    catch (e) { setSheet({ ...sheet, [n]: errorText(e) }); }
  };

  return (
    <Glass>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H2>Stripboard</H2>
        <div className="flex flex-wrap gap-3 text-[13px] text-t3">
          <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#f5d742]" />Day</span>
          <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#ff9f43]" />Dawn / dusk</span>
          <span><i aria-hidden className="mr-1.5 inline-block h-2 w-2 rounded-full bg-[#4f7cff]" />Night</span>
        </div>
      </div>
      <div className="mt-4 flex gap-3 overflow-x-auto pb-2">
        {view.schedule.days.map((d, i) => (
          <div key={d.number} {...target(i)} className={`sub flex w-60 shrink-0 flex-col rounded-2xl p-3 ${over === i ? 'ring-2 ring-[var(--violet)]' : ''}`}>
            <div className="flex items-start justify-between gap-2">
              <div>
                <div className="text-[14px] font-semibold">Day {d.number} · {fmt(d.date)}</div>
                <Small>{d.locationName}{d.companyMove ? ' · company move' : ''}</Small>
              </div>
              {conflictDays.has(d.number) && <Chip tone="risk">clash</Chip>}
            </div>
            <ul className="mt-2.5 flex flex-1 flex-col gap-1.5" aria-label={`Scenes on day ${d.number}`}>
              {d.sceneIds.map((id) => byId.get(String(id))).filter((s): s is PlanScene => !!s).map((s) => (
                <li key={s.id} draggable onDragStart={(e) => e.dataTransfer.setData('text/plain', s.id)}
                  className={`cursor-grab rounded-lg border-l-4 px-2.5 py-1.5 active:cursor-grabbing ${stripTone(s.time)}`}>
                  <div className="flex items-center justify-between gap-2 text-[13px] font-medium"><span>Sc {s.number} · {(s.time || '—').toLowerCase()}</span><span className="opacity-75">{pages(s.eighths)}</span></div>
                  <div className="truncate text-[12px] opacity-75">{s.cast.join(', ') || 'No cast'}</div>
                  <label className="sr-only">Move scene {s.number} to day
                    <select value={i} onChange={(e) => move(s.id, Number(e.target.value))}>
                      {view.schedule.days.map((x, j) => <option key={x.number} value={j}>Day {x.number}</option>)}
                      <option value={view.schedule.days.length}>A new day</option>
                    </select>
                  </label>
                </li>
              ))}
            </ul>
            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Small>{pages(d.eighths)} pages</Small>
              <Btn icon={FileText} onClick={() => void callSheet(d.number)}>Call sheet</Btn>
            </div>
            {sheet[d.number] && <Small className="mt-1">{sheet[d.number]}</Small>}
          </div>
        ))}
        <div {...target(view.schedule.days.length)} className={`flex w-40 shrink-0 flex-col items-center justify-center rounded-2xl border border-dashed border-white/20 p-3 text-center text-[13px] text-t3 ${over === view.schedule.days.length ? 'ring-2 ring-[var(--violet)]' : ''}`}>
          <CalendarPlus className="mb-1.5 h-5 w-5" aria-hidden />Drop a strip here for a new day
        </div>
      </div>
    </Glass>
  );
}

function Timeline({ view }: { view: ScheduleView }) {
  if (!view.timeline.length) return null;
  const range = (a: string | null, b: string | null) => (a && b ? `${short(a)} – ${short(b)}` : a ? `From ${short(a)}` : b ? `Until ${short(b)}` : 'Dates not set');
  return (
    <Glass>
      <H2>Production timeline</H2>
      <ol className="mt-3 grid gap-2.5 [grid-template-columns:repeat(auto-fit,minmax(170px,1fr))]">
        {view.timeline.map((t) => (
          <li key={t.name} aria-current={t.current ? 'step' : undefined} className={`sub rounded-2xl p-3 ${t.current ? 'ring-1 ring-[var(--violet)]' : ''}`}>
            <Small>{range(t.from, t.to)}{t.shootDays ? `, ${t.shootDays} days` : ''}</Small>
            <div className="text-[15px] font-semibold">{t.name}</div>
            <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-label={`${t.name} progress`} aria-valuenow={Math.round(t.progress * 100)} aria-valuemin={0} aria-valuemax={100}>
              <div className="h-full rounded-full bg-[var(--violet)]" style={{ width: `${Math.round(t.progress * 100)}%` }} />
            </div>
            {t.shootDays !== undefined && <Small className="mt-1">{t.shotDays} of {t.shootDays} days shot</Small>}
          </li>
        ))}
      </ol>
    </Glass>
  );
}

const STATUS_CHIP = { clear: { tone: 'ok' as const, label: 'Clear' }, hold: { tone: 'warn' as const, label: 'Hold' }, conflict: { tone: 'risk' as const, label: 'Conflict' } };
function availability(blocks: ScheduleView['dood'][number]['blocks']) {
  if (!blocks.length) return 'No dates entered: free';
  return blocks.slice(0, 3).map((b) => `${b.kind === 'hold' ? 'Hold' : b.kind === 'booked' ? 'Booked' : 'Away'} ${short(b.start)}–${short(b.end)}${b.note ? ` (${b.note})` : ''}`).join('; ');
}

function ActorDates({ view }: { view: ScheduleView }) {
  return (
    <Glass className="min-w-0 flex-[3_1_520px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <H2>Actor dates, from your database</H2>
        <Btn href="/produce/actors">Open actor database</Btn>
      </div>
      {view.dood.length === 0 ? <Small className="mt-3">No speaking parts in this plan yet.</Small> : (
        <div className="mt-3 overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left text-[14px]">
            <thead><tr className="text-[13px] text-t3">{['Actor', 'Availability', 'Status'].map((h) => <th key={h} scope="col" className="pb-2 pr-3 font-medium">{h}</th>)}</tr></thead>
            <tbody>
              {view.dood.map((r) => {
                const st = STATUS_CHIP[r.dateStatus];
                return (
                  <tr key={r.character} className="align-top [&>td]:rule [&>td]:py-2.5 [&>td]:pr-3">
                    <td><div className="font-medium">{r.actor || 'Not cast'}</div><Small>{r.character}{r.role ? ` · ${r.role}` : ''}</Small></td>
                    <td className="text-t2">{availability(r.blocks)}</td>
                    <td><Chip tone={st.tone}>{st.label}</Chip></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </Glass>
  );
}

function Dood({ view }: { view: ScheduleView }) {
  const days = view.schedule.days;
  if (!view.dood.length) return null;
  const tone: Record<string, string> = { SW: 'bg-[#2fbf71] text-black', W: 'bg-[#2fbf7166]', WF: 'bg-[#2fbf71] text-black', SWF: 'bg-[#2fbf71] text-black', H: 'bg-[#ff9f4366]', T: 'bg-[#4f7cff55]' };
  return (
    <Glass>
      <H2><span id="day-out-of-days" className="scroll-mt-24">Day out of days</span></H2>
      <Small className="mt-1">SW start work · W work · H hold · WF work finish · SWF start, work and finish.</Small>
      <div className="mt-3 overflow-x-auto">
        <table className="border-collapse text-left text-[13px]">
          <thead><tr className="text-t3"><th scope="col" className="pb-2 pr-4 font-medium">Character</th>{days.map((d) => <th key={d.number} scope="col" className="w-11 pb-2 text-center font-medium">{d.number}</th>)}<th scope="col" className="pb-2 pl-3 font-medium">Work</th><th scope="col" className="pb-2 pl-3 font-medium">Hold</th></tr></thead>
          <tbody>
            {view.dood.map((r) => (
              <tr key={r.character} className="[&>td]:rule [&>td]:py-1.5">
                <th scope="row" className="rule whitespace-nowrap py-1.5 pr-4 text-left font-medium">{r.character}<span className="block text-[12px] font-normal text-t3">{r.actor || 'not cast'}</span></th>
                {r.codes.map((c, i) => <td key={i} className="px-0.5 text-center">{c && <span className={`inline-block w-10 rounded-md py-0.5 text-[12px] font-semibold ${tone[c] ?? ''}`}>{c}</span>}</td>)}
                <td className="pl-3">{r.workDays}</td><td className="pl-3">{r.holdDays}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Glass>
  );
}

type Item = ScheduleView['schedule']['itinerary'][number];

function Itinerary({ view, onSave }: { view: ScheduleView; onSave: (items: Item[]) => void }) {
  const [items, setItems] = useState<Item[]>(view.schedule.itinerary);
  const [dirty, setDirty] = useState(false);
  const set = (next: Item[]) => { setItems(next); setDirty(true); };
  const patch = (i: number, v: Partial<Item>) => set(items.map((x, j) => (j === i ? { ...x, ...v } : x)));
  return (
    <Glass className="min-w-0 flex-[2_1_360px]">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><H2>Shoot itinerary</H2><Small>Travel, recce, rehearsals and anything else around the shoot days.</Small></div>
        <div className="flex gap-2">
          <Btn icon={Plus} onClick={() => set([...items, { day: 1, time: '', title: '', detail: '' }])}>Add</Btn>
          <Btn variant="primary" disabled={!dirty || items.some((x) => !x.title.trim())} onClick={() => { onSave(items); setDirty(false); }}>Save</Btn>
        </div>
      </div>
      {items.length === 0 ? <Small className="mt-3">Nothing added yet.</Small> : (
        <ul className="mt-3 flex flex-col gap-2">
          {items.map((x, i) => (
            <li key={i} className="flex flex-wrap items-end gap-2">
              <Input label="Day" type="number" min={1} value={x.day} onChange={(e) => patch(i, { day: Number(e.target.value) || 1 })} className="w-20" />
              <Input label="Time" value={x.time} placeholder="07:00" onChange={(e) => patch(i, { time: e.target.value })} className="w-24" />
              <Input label="What" value={x.title} onChange={(e) => patch(i, { title: e.target.value })} className="w-56" />
              <Input label="Detail" value={x.detail} onChange={(e) => patch(i, { detail: e.target.value })} className="w-72" />
              <IconBtn label="Remove" icon={Trash2} onClick={() => set(items.filter((_, j) => j !== i))} />
            </li>
          ))}
        </ul>
      )}
    </Glass>
  );
}
