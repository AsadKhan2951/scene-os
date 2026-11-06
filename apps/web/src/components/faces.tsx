'use client';

import { Lock, ScanFace } from 'lucide-react';
import { useState } from 'react';
import { Btn, Chip, Note, Small } from '@/components/ui';
import { api, errorText, refresh, useApi } from '@/lib/api';
import type { FaceRow } from '@/lib/types';

const casting = (f: FaceRow) => !!f.casting && ['queued', 'running'].includes(f.casting.status);

/** The faces of a story, refreshed while one is being cast. */
export function useFaces(storyId: string) {
  return useApi<FaceRow[]>(`/direction/stories/${storyId}/faces`, { refreshInterval: (rows) => (rows?.some(casting) ? 5000 : 0) });
}

/**
 * One character's face: the casting photo, whether it is a trained Soul ID, and the button that casts
 * it. A trained face is what keeps the person the same in every storyboard frame, render and video.
 */
export function FaceLine({ face: c, storyId, compact = false }: { face: FaceRow; storyId: string; compact?: boolean }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const start = async (redo: boolean) => {
    setBusy(true); setError('');
    try {
      await api.post(`/direction/characters/${c._id}/face`, { redo });
      await refresh(`/direction/stories/${storyId}/faces`);
      await refresh('/credits');
    } catch (e) { setError(errorText(e)); } finally { setBusy(false); }
  };
  const working = casting(c);
  const status = working ? (c.casting?.note || 'Casting the face') : c.soulId ? 'Same face in every frame' : c.lookImageUrl ? 'Casting photo, not trained yet' : 'No face cast yet';
  return (
    <li className="flex flex-col gap-2">
      <div className="flex items-center gap-3">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        {c.lookImageUrl ? <img src={c.lookImageUrl} alt={`${c.name}'s casting photo`} className={compact ? 'h-11 w-11 rounded-full object-cover' : 'h-16 w-16 rounded-2xl object-cover'} /> : <span className={compact ? 'h-11 w-11 rounded-full bg-white/10' : 'h-16 w-16 rounded-2xl bg-white/10'} />}
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-medium">{c.name}</div>
          <Small>{status}</Small>
        </div>
        {c.soulId && !working && <Chip tone="ok"><Lock size={12} className="mr-1 inline" aria-hidden />Locked</Chip>}
      </div>
      {!working && (
        <div className="flex flex-wrap gap-2">
          {!c.soulId && <Btn icon={ScanFace} variant="primary" disabled={busy} onClick={() => void start(false)}>{busy ? 'Starting…' : c.lookImageUrl ? 'Train this face' : 'Cast a fixed face'}</Btn>}
          {c.soulId && !compact && <Btn icon={ScanFace} disabled={busy} onClick={() => void start(true)}>Cast a new face</Btn>}
        </div>
      )}
      {!working && !c.soulId && <Small>About 280 credits and a few minutes. After this the face stays the same in every frame, render and scene video.</Small>}
      {c.casting?.status === 'failed' && !c.soulId && <Note>{c.casting.error || 'Casting failed. Try again.'}</Note>}
      {error && <Note>{error}</Note>}
    </li>
  );
}
