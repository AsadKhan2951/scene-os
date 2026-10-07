'use client';

import clsx from 'clsx';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { AlertTriangle, Check, Circle, Clock, Sparkles, type LucideIcon } from 'lucide-react';
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from 'react';
import { label as humanise } from '@sceneos/shared';
import type { NavItem } from '@/lib/nav';

export type Tone = 'ok' | 'warn' | 'risk' | 'info' | 'idle' | 'ai';

const TONES: Record<Tone, { text: string; bg: string; icon: LucideIcon }> = {
  ok: { text: 'text-ok', bg: 'bg-ok/[0.13]', icon: Check },
  warn: { text: 'text-warn', bg: 'bg-warn/[0.13]', icon: Clock },
  risk: { text: 'text-risk', bg: 'bg-red-400/[0.16]', icon: AlertTriangle },
  info: { text: 'text-info', bg: 'bg-sky-400/[0.13]', icon: Circle },
  idle: { text: 'text-t3', bg: 'bg-white/[0.06]', icon: Circle },
  ai: { text: 'text-violet', bg: 'bg-violet/[0.18]', icon: Sparkles },
};

/** Status is always an icon plus words, never colour alone. */
export function Chip({ tone = 'idle', children }: { tone?: Tone; children: ReactNode }) {
  const t = TONES[tone];
  return (
    <span className={clsx('inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[13px] font-medium', t.text, t.bg)}>
      <t.icon size={13} aria-hidden />
      {children}
    </span>
  );
}
export const StatusChip = ({ status, toneOf }: { status: string; toneOf: (s: string) => Tone }) => <Chip tone={toneOf(status)}>{humanise(status)}</Chip>;

export function Glass({ className, children, as: Tag = 'section' }: { className?: string; children: ReactNode; as?: 'section' | 'div' | 'article' }) {
  return <Tag className={clsx('glass rounded-[28px] p-6', className)}>{children}</Tag>;
}
export const Sub = ({ className, children }: { className?: string; children: ReactNode }) => <div className={clsx('sub rounded-2xl p-4', className)}>{children}</div>;

type Variant = 'primary' | 'ghost' | 'danger' | 'text';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-brand text-white border border-white/20 shadow-[inset_0_1px_0_rgba(255,255,255,.3),0_8px_24px_rgba(109,77,242,.4)] hover:brightness-110',
  ghost: 'bg-white/[0.07] text-t1 border border-white/[0.14] hover:bg-white/[0.12]',
  danger: 'bg-red-400/10 text-risk border border-red-400/35 hover:bg-red-400/20',
  text: 'bg-transparent text-violet border border-transparent hover:text-white',
};
const BTN = 'inline-flex min-h-[44px] items-center justify-center gap-2 whitespace-nowrap rounded-full px-[18px] text-sm font-medium transition disabled:cursor-not-allowed disabled:opacity-50';

interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> { variant?: Variant; icon?: LucideIcon; href?: string }
export function Btn({ variant = 'ghost', icon: Icon, href, className, children, ...rest }: BtnProps) {
  const cls = clsx(BTN, VARIANTS[variant], className);
  const inner = <>{Icon && <Icon size={16} aria-hidden />}{children}</>;
  if (href) return <Link href={href} className={cls}>{inner}</Link>;
  return <button type="button" className={cls} {...rest}>{inner}</button>;
}

export function IconBtn({ label, icon: Icon, ...rest }: { label: string; icon: LucideIcon } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-label={label} title={label} className="inline-flex h-11 w-11 items-center justify-center rounded-full text-t1 hover:bg-white/10 disabled:opacity-50" {...rest}>
      <Icon size={18} aria-hidden />
    </button>
  );
}

export function Bar({ value, tone = 'violet', className }: { value: number | null | undefined; tone?: 'violet' | 'ok' | 'warn'; className?: string }) {
  const v = Math.max(0, Math.min(100, value ?? 0));
  return (
    <div className={clsx('h-1.5 w-full overflow-hidden rounded-full bg-white/10', className)} role="progressbar" aria-valuenow={Math.round(v)} aria-valuemin={0} aria-valuemax={100}>
      <div className={clsx('h-full rounded-full', { violet: 'bg-violet', ok: 'bg-ok', warn: 'bg-warn' }[tone])} style={{ width: `${v}%` }} />
    </div>
  );
}

/** The 15 pipeline stages as a compact strip. */
export function StageStrip({ current }: { current: number }) {
  return (
    <div className="flex w-full max-w-[190px] gap-[3px]" aria-hidden>
      {Array.from({ length: 15 }, (_, i) => (
        <div key={i} className={clsx('h-1.5 flex-1 rounded-[3px]', i + 1 < current ? 'bg-violet' : i + 1 === current ? 'bg-white' : 'bg-white/[0.14]')} />
      ))}
    </div>
  );
}

export function Tabs({ items, left }: { items: NavItem[]; left?: ReactNode }) {
  const path = usePathname();
  return (
    <div className="flex flex-wrap items-center gap-x-7 gap-y-3 border-b border-white/10">
      {left}
      <nav aria-label="Section" className="flex flex-wrap gap-x-6 gap-y-1">
        {items.map((t) => {
          const on = path === t.href;
          return (
            <Link key={t.href} href={t.href} aria-current={on ? 'page' : undefined}
              className={clsx('inline-flex min-h-[44px] items-center border-b-2 text-[15px] font-medium', on ? 'border-violet text-white' : 'border-transparent text-t3 hover:text-white')}>
              {t.label}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}

export function PageTitle({ title, sub, children }: { title: string; sub?: ReactNode; children?: ReactNode }) {
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="text-[32px] font-semibold leading-tight tracking-[-0.02em]">{title}</h1>
        {sub && <p className="mt-1.5 text-base text-t2">{sub}</p>}
      </div>
      {children && <div className="flex flex-wrap gap-2.5">{children}</div>}
    </div>
  );
}
export const H2 = ({ children, className }: { children: ReactNode; className?: string }) => <h2 className={clsx('text-lg font-semibold tracking-[-0.01em]', className)}>{children}</h2>;
export const Small = ({ children, className }: { children: ReactNode; className?: string }) => <div className={clsx('text-[13px] leading-snug text-t3', className)}>{children}</div>;

export function Row({ left, right, className }: { left: ReactNode; right?: ReactNode; className?: string }) {
  return <div className={clsx('rule flex items-center justify-between gap-3 py-3', className)}><div className="min-w-0">{left}</div>{right}</div>;
}
export const Two = ({ a, b }: { a: ReactNode; b?: ReactNode }) => <div><div className="text-[15px] font-medium">{a}</div>{b && <Small>{b}</Small>}</div>;

export function Pill({ on, children, ...rest }: { on?: boolean } & ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button type="button" aria-pressed={!!on} {...rest}
      className={clsx('min-h-[44px] whitespace-nowrap rounded-full border px-4 text-sm font-medium', on ? 'border-white/20 bg-white/[0.16] text-white' : 'border-white/10 bg-white/[0.04] text-t2 hover:text-white')}>
      {children}
    </button>
  );
}

// ---- Form fields: every control has a visible label ----
function Labelled({ label, children }: { label: string; children: ReactNode }) {
  return <label className="flex min-w-0 flex-col gap-1.5"><span className="text-[13px] text-t2">{label}</span>{children}</label>;
}
export const Input = ({ label, className, ...rest }: { label: string } & InputHTMLAttributes<HTMLInputElement>) => <Labelled label={label}><input className={clsx('field', className)} {...rest} /></Labelled>;
export const Area = ({ label, className, ...rest }: { label: string } & TextareaHTMLAttributes<HTMLTextAreaElement>) => <Labelled label={label}><textarea rows={3} className={clsx('field resize-y', className)} {...rest} /></Labelled>;
export function Select({ label, options, className, ...rest }: { label: string; options: readonly string[] | { value: string; label: string }[] } & SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <Labelled label={label}>
      <select className={clsx('field', className)} {...rest}>
        {options.map((o) => (typeof o === 'string' ? <option key={o} value={o}>{humanise(o)}</option> : <option key={o.value} value={o.value}>{o.label}</option>))}
      </select>
    </Labelled>
  );
}

// ---- States ----
export const Loading = ({ what = 'Loading' }: { what?: string }) => <div role="status" className="py-10 text-center text-sm text-t3">{what}…</div>;
export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return <div className="rule py-10 text-center"><div className="text-[17px] font-semibold">{title}</div>{children && <div className="mx-auto mt-1 max-w-md text-sm text-t2">{children}</div>}</div>;
}
export function Note({ tone = 'risk', children }: { tone?: 'risk' | 'ok' | 'warn'; children: ReactNode }) {
  const cls = { risk: 'border-red-400/40 bg-red-400/10 text-risk', ok: 'border-ok/35 bg-ok/10 text-ok', warn: 'border-warn/35 bg-warn/[0.08] text-warn' }[tone];
  return <div role={tone === 'risk' ? 'alert' : 'status'} className={clsx('rounded-2xl border px-4 py-3 text-[15px]', cls)}>{children}</div>;
}
/** Renders loading, error, or the children once data is there. */
export function Async<T>({ data, error, children, what }: { data: T | undefined; error?: Error; what?: string; children: (data: T) => ReactNode }) {
  if (error) return <Note>{error.message}</Note>;
  if (data === undefined) return <Loading what={what} />;
  return <>{children(data)}</>;
}
