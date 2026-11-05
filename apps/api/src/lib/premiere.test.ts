import { describe, expect, it } from 'vitest';
import { fcpXml, otio, type TimelineInput } from './premiere';

const t: TimelineInput = {
  name: 'Gwadar sc 12 circled & <best>', fps: 25,
  clips: [
    { name: 'A001C003', seconds: 10, label: 'Sc 12 T3 A', markers: [{ seconds: 4, text: 'Use this look', by: 'Director' }] },
    { name: 'A001C007.mov', seconds: 8, markers: [] },
  ],
};

describe('fcpXml', () => {
  const xml = fcpXml(t);
  it('lays clips end to end in frames', () => {
    expect(xml).toContain('<duration>450</duration>');
    expect(xml).toContain('<start>250</start><end>450</end>');
  });
  it('turns comments into markers and escapes text', () => {
    expect(xml).toContain('<in>99</in>');
    expect(xml).toContain('Director: Use this look');
    expect(xml).toContain('circled &amp; &lt;best&gt;');
    expect(xml).toContain('file://localhost/A001C003.mov');
    expect(xml).toContain('file://localhost/A001C007.mov');
  });
  it('handles NTSC rates', () => {
    expect(fcpXml({ ...t, fps: 23.976 })).toContain('<timebase>24</timebase><ntsc>TRUE</ntsc>');
  });
});

describe('otio', () => {
  it('writes one video track with markers', () => {
    const o = otio(t);
    const clips = o.tracks.children[0].children;
    expect(clips).toHaveLength(2);
    expect(clips[0].source_range.duration.value).toBe(250);
    expect(clips[0].markers[0].marked_range.start_time.value).toBe(99);
  });
});
