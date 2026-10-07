'use client';

import clsx from 'clsx';
import Image from 'next/image';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { ChevronDown, LogOut, Sparkles } from 'lucide-react';
import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import { api, useApi } from '@/lib/api';
import { MAIN_NAV, type NavItem } from '@/lib/nav';
import type { Me, Production } from '@/lib/types';
import { Empty, IconBtn, Loading, Note, Tabs } from './ui';

interface Ctx { me: Me | undefined; productions: Production[] | undefined; production: Production | undefined; choose: (id: string) => void }
const AppContext = createContext<Ctx>({ me: undefined, productions: undefined, production: undefined, choose: () => {} });
export const useApp = () => useContext(AppContext);

const KEY = 'sceneos.production';

export function AppShell({ children }: { children: ReactNode }) {
  const path = usePathname();
  const router = useRouter();
  const { data: me } = useApi<Me>('/auth/me');
  const { data: productions } = useApi<Production[]>('/productions');
  const [id, setId] = useState<string | null>(null);

  // Remember the last production the person worked in on this device.
  useEffect(() => { try { setId(localStorage.getItem(KEY)); } catch { /* storage unavailable */ } }, []);
  const choose = (next: string) => { setId(next); try { localStorage.setItem(KEY, next); } catch { /* storage unavailable */ } };

  const production = useMemo(() => productions?.find((p) => p._id === id) ?? productions?.find((p) => p.status === 'active') ?? productions?.[0], [productions, id]);
  const signOut = async () => { await api.post('/auth/logout'); router.push('/login'); };
  const active = (item: { match: string[] }) => item.match.some((m) => (m === '/' ? path === '/' : path.startsWith(m)));

  return (
    <AppContext.Provider value={{ me, productions, production, choose }}>
      <div className="mx-auto flex max-w-[1520px] flex-col gap-6 px-4 pb-14 pt-5 sm:px-7">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <Link href="/" aria-label="Scene OS home"><Image src="/logo-white.png" alt="Scene OS" width={68} height={50} priority unoptimized /></Link>
          <nav aria-label="Main" className="glass flex flex-wrap gap-1 rounded-full p-1.5">
            {MAIN_NAV.map((n) => (
              <Link key={n.href} href={n.href} aria-current={active(n) ? 'page' : undefined}
                className={clsx('inline-flex min-h-[44px] items-center rounded-full px-5 text-[15px] font-medium', active(n) ? 'bg-white/[0.16] text-white shadow-[inset_0_1px_0_rgba(255,255,255,.3)]' : 'text-t2 hover:text-white')}>
                {n.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2.5">
            <Link href="/dreamer" className={clsx('inline-flex min-h-[44px] items-center gap-2 rounded-full border px-[18px] text-sm font-medium text-white', path === '/dreamer' ? 'border-violet/60 bg-violet/30' : 'border-violet/30 bg-violet/15')}>
              <Sparkles size={16} aria-hidden />Ask Dreamer
            </Link>
            <div className="sub flex h-11 items-center rounded-full px-4 text-sm font-medium" title={me?.email}>{me?.name ?? '…'}</div>
            <IconBtn label="Sign out" icon={LogOut} onClick={signOut} />
          </div>
        </header>
        {children}
      </div>
    </AppContext.Provider>
  );
}

/** Section tabs with the production switcher on the left. */
export function SectionTabs({ items, scoped = true }: { items: NavItem[]; scoped?: boolean }) {
  const { productions, production, choose } = useApp();
  const switcher = scoped && productions && productions.length > 0 && (
    <label className="sub relative inline-flex min-h-[44px] items-center rounded-full pl-4 pr-9 text-[15px] font-semibold">
      <span className="sr-only">Production</span>
      <select value={production?._id ?? ''} onChange={(e) => choose(e.target.value)} className="max-w-[220px] cursor-pointer appearance-none truncate bg-transparent outline-none">
        {productions.map((p) => <option key={p._id} value={p._id}>{p.title}</option>)}
      </select>
      <ChevronDown size={15} className="pointer-events-none absolute right-3.5" aria-hidden />
    </label>
  );
  return <Tabs items={items} left={switcher || undefined} />;
}

/** Wraps a production-scoped page: waits for the list and handles "no productions yet". */
export function WithProduction({ children }: { children: (production: Production, me: Me | undefined) => ReactNode }) {
  const { productions, production, me } = useApp();
  if (!productions) return <Loading what="Loading productions" />;
  if (!production) return <Empty title="No productions yet">Create your first production from Home, then come back here.</Empty>;
  return <>{children(production, me)}</>;
}

export { Note };
