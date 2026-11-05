'use client';

import { useParams } from 'next/navigation';
import { useEffect } from 'react';
import { SlideCard } from '@/components/pitch';
import { useApi } from '@/lib/api';
import type { PitchDeck } from '@/lib/types';

/** The pitch deck one slide per page, sized for landscape 16:9 paper, so the browser can save it as a PDF. */
export default function PitchPrintPage() {
  const { id } = useParams<{ id: string }>();
  const { data: deck, error } = useApi<PitchDeck>(`/direction/pitch/${id}`);
  // Open the print dialog once the pictures have loaded.
  useEffect(() => {
    if (!deck) return;
    const imgs = [...document.images];
    Promise.all(imgs.map((img) => (img.complete ? null : new Promise((r) => { img.onload = r; img.onerror = r; })))).then(() => setTimeout(() => window.print(), 300));
  }, [deck]);
  if (error) return <p style={{ padding: 24 }}>{error.message}</p>;
  if (!deck) return <p style={{ padding: 24 }}>Loading the deck…</p>;
  return (
    <main className="bg-[#0E0C14]">
      <style>{'@page { size: 13.333in 7.5in; margin: 0 } @media print { body { background: #0E0C14 } .slide { break-after: page; width: 13.333in; height: 7.5in; border-radius: 0 } }'}</style>
      <p className="p-4 text-sm text-[#B8B4C8] print:hidden">Choose “Save as PDF” in the print dialog. Turn on “Background graphics”.</p>
      {deck.slides.map((s, i) => <SlideCard key={i} slide={s} className="slide mx-auto mb-6 max-w-[1280px] text-[1.45vw] print:mb-0 print:max-w-none print:text-[19px]" />)}
    </main>
  );
}
