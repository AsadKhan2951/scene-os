'use client';

import { useRef, useState } from 'react';
import { errorText, refresh, upload } from '@/lib/api';

/**
 * Speak instead of typing: records from the microphone, sends it to Scene AI to be written down
 * in the language spoken, and hands back the text. Press once to start, again to stop.
 */
export function useDictation(onText: (text: string) => void) {
  const recorder = useRef<MediaRecorder | null>(null);
  const started = useRef(0);
  const [state, setState] = useState<'idle' | 'recording' | 'writing'>('idle');
  const [error, setError] = useState('');

  async function toggle() {
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
        setState('writing');
        try {
          const r = await upload<{ text: string }>(`/script-director/dictate?seconds=${seconds}`, new Blob(chunks, { type: rec.mimeType || 'audio/webm' }));
          onText(r.text);
          await refresh('/credits');
        } catch (e) { setError(errorText(e)); } finally { setState('idle'); }
      };
      started.current = Date.now();
      rec.start();
      recorder.current = rec;
      setState('recording');
    } catch { setError('The microphone could not be opened. Allow microphone access for this site and try again.'); }
  }
  return { state, error, toggle };
}
