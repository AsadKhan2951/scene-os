'use client';

import clsx from 'clsx';
import type { PitchSlide } from '@/lib/types';

/** A slide drawn the way the PowerPoint file lays it out. */
export function SlideCard({ slide: s, small, className }: { slide: PitchSlide; small?: boolean; className?: string }) {
  const cover = s.kind === 'title';
  return (
    <div className={clsx('relative aspect-video w-full overflow-hidden rounded-xl bg-[#0E0C14] text-[#F4F2FA]', small ? 'text-[7px]' : className ? '' : 'text-[14px]', className)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {s.imageUrl && <img src={s.imageUrl} alt="" className={clsx('absolute top-0 h-full object-cover', cover ? 'left-0 w-full' : 'right-0 w-1/2')} />}
      {cover && <div className="absolute inset-0 bg-gradient-to-b from-transparent to-[#0E0C14]" />}
      <div className={clsx('absolute', cover ? 'inset-x-[6%] bottom-[8%]' : 'left-[6%] top-[9%] w-[42%]')}>
        {!cover && s.subtitle && <div className="font-bold uppercase tracking-wide text-[#8B6CF7]" style={{ fontSize: '0.9em' }}>{s.subtitle}</div>}
        <div className="font-bold leading-tight" style={{ fontSize: cover ? '3.2em' : '2em' }}>{s.title}</div>
        {cover && s.subtitle && <div className="mt-[0.4em] text-[#B8B4C8]" style={{ fontSize: '1.2em' }}>{s.subtitle}</div>}
        {!cover && s.body && <div className="mt-[0.8em] text-[#B8B4C8]" style={{ fontSize: '0.95em' }}>{s.body}</div>}
        {!cover && s.bullets.length > 0 && <ul className="mt-[0.5em] list-disc pl-[1.2em]" style={{ fontSize: '0.95em' }}>{s.bullets.map((b) => <li key={b}>{b}</li>)}</ul>}
      </div>
    </div>
  );
}
