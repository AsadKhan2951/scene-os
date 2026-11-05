/**
 * Timelines for the edit: a scene's takes as an FCP 7 XML sequence (File > Import in Premiere Pro,
 * which also reads Final Cut 7 XML) and as OpenTimelineIO JSON (DaVinci Resolve, Avid via
 * adapters, and other tools). Review comments become clip markers at their timecode. Media is
 * referenced by clip name, so the editor relinks to the card files on their own machine.
 */

export interface TimelineClip { name: string; seconds: number; url?: string | null; label?: string; markers: { seconds: number; text: string; by?: string }[] }
export interface TimelineInput { name: string; fps: number; width?: number; height?: number; clips: TimelineClip[] }

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const frames = (seconds: number, fps: number) => Math.max(1, Math.round(seconds * fps));
/** Whole-number timebase and NTSC flag for a frame rate (23.976 is 24 NTSC, 29.97 is 30 NTSC). */
const timebase = (fps: number) => (Math.abs(fps - Math.round(fps)) > 0.001 ? { base: Math.round(fps), ntsc: true } : { base: Math.round(fps), ntsc: false });
const pathFor = (c: TimelineClip) => (c.url?.startsWith('file://') ? c.url : `file://localhost/${encodeURIComponent(/\.\w{2,4}$/.test(c.name) ? c.name : `${c.name}.mov`)}`);

export function fcpXml(t: TimelineInput): string {
  const { base, ntsc } = timebase(t.fps);
  const rate = `<rate><timebase>${base}</timebase><ntsc>${ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`;
  let cursor = 0;
  const placed = t.clips.map((c, i) => {
    const len = frames(c.seconds, t.fps);
    const item = { c, i: i + 1, len, start: cursor, end: cursor + len };
    cursor += len;
    return item;
  });
  const file = (p: (typeof placed)[number], full: boolean) => full
    ? `<file id="file-${p.i}"><name>${esc(p.c.name)}</name><pathurl>${esc(pathFor(p.c))}</pathurl>${rate}<duration>${p.len}</duration><media><video><samplecharacteristics>${rate}<width>${t.width ?? 1920}</width><height>${t.height ?? 1080}</height></samplecharacteristics></video><audio><channelcount>2</channelcount></audio></media></file>`
    : `<file id="file-${p.i}"/>`;
  const markers = (p: (typeof placed)[number]) => p.c.markers.map((m) => `<marker><name>${esc((m.by ? `${m.by}: ` : '') + m.text.slice(0, 60))}</name><comment>${esc(m.text)}</comment><in>${Math.min(p.len - 1, frames(m.seconds, t.fps) - 1)}</in><out>-1</out></marker>`).join('');
  const video = placed.map((p) => `<clipitem id="clipitem-v${p.i}"><name>${esc(p.c.label ?? p.c.name)}</name><enabled>TRUE</enabled><duration>${p.len}</duration>${rate}<start>${p.start}</start><end>${p.end}</end><in>0</in><out>${p.len}</out>${file(p, true)}${markers(p)}<link><linkclipref>clipitem-v${p.i}</linkclipref><mediatype>video</mediatype><trackindex>1</trackindex><clipindex>${p.i}</clipindex></link><link><linkclipref>clipitem-a${p.i}</linkclipref><mediatype>audio</mediatype><trackindex>1</trackindex><clipindex>${p.i}</clipindex></link></clipitem>`).join('');
  const audio = placed.map((p) => `<clipitem id="clipitem-a${p.i}"><name>${esc(p.c.label ?? p.c.name)}</name><enabled>TRUE</enabled><duration>${p.len}</duration>${rate}<start>${p.start}</start><end>${p.end}</end><in>0</in><out>${p.len}</out>${file(p, false)}<sourcetrack><mediatype>audio</mediatype><trackindex>1</trackindex></sourcetrack></clipitem>`).join('');
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5"><sequence id="sequence-1"><name>${esc(t.name)}</name><duration>${cursor}</duration>${rate}<timecode>${rate}<string>01:00:00:00</string><frame>${3600 * base}</frame><displayformat>NDF</displayformat></timecode><media><video><format><samplecharacteristics>${rate}<width>${t.width ?? 1920}</width><height>${t.height ?? 1080}</height><pixelaspectratio>square</pixelaspectratio></samplecharacteristics></format><track>${video}</track></video><audio><track>${audio}</track></audio></media></sequence></xmeml>
`;
}

/** The same timeline as OpenTimelineIO JSON (.otio). */
export function otio(t: TimelineInput) {
  const rt = (value: number) => ({ OTIO_SCHEMA: 'RationalTime.1', rate: t.fps, value });
  const range = (start: number, duration: number) => ({ OTIO_SCHEMA: 'TimeRange.1', start_time: rt(start), duration: rt(duration) });
  return {
    OTIO_SCHEMA: 'Timeline.1', name: t.name, metadata: { source: 'Scene OS' },
    global_start_time: rt(3600 * t.fps),
    tracks: {
      OTIO_SCHEMA: 'Stack.1', name: 'tracks', metadata: {}, effects: [], markers: [], source_range: null,
      children: [{
        OTIO_SCHEMA: 'Track.1', name: 'V1', kind: 'Video', metadata: {}, effects: [], markers: [], source_range: null,
        children: t.clips.map((c) => ({
          OTIO_SCHEMA: 'Clip.2', name: c.label ?? c.name, metadata: {}, effects: [], enabled: true,
          source_range: range(0, frames(c.seconds, t.fps)),
          markers: c.markers.map((m) => ({ OTIO_SCHEMA: 'Marker.2', name: (m.by ? `${m.by}: ` : '') + m.text.slice(0, 60), color: 'RED', comment: m.text, metadata: {}, marked_range: range(frames(m.seconds, t.fps) - 1, 0) })),
          media_references: { DEFAULT_MEDIA: { OTIO_SCHEMA: 'ExternalReference.1', name: c.name, target_url: pathFor(c), available_range: range(0, frames(c.seconds, t.fps)), metadata: {} } },
          active_media_reference_key: 'DEFAULT_MEDIA',
        })),
      }],
    },
  };
}
