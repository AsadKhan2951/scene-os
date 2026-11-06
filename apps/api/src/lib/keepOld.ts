import { Character, Location, LookBook, PitchDeck, StoryboardFrame, Teaser } from '../models';
import { isKept, keep } from './higgsfield';

/**
 * Copies pictures and clips that still point at Higgsfield's temporary links onto the server, so
 * work made before files were kept does not disappear. Runs once when the worker starts; safe to
 * run again (kept links are skipped). A link Higgsfield has already removed is left as it is.
 */
export async function keepOldFiles(): Promise<{ copied: number; failed: number }> {
  let copied = 0;
  let failed = 0;
  // The same picture often appears in several places (a frame, the look book, the pitch); it is copied once.
  const done = new Map<string, string>();
  const move = async (url: string | null | undefined, key: string): Promise<string | null> => {
    if (!url || isKept(url) || !/^https?:\/\//.test(url)) return null;
    const seen = done.get(url);
    if (seen) return seen;
    const kept = await keep(url, key);
    if (kept.permanent) { copied++; done.set(url, kept.url); return kept.url; }
    failed++;
    return null;
  };

  for await (const f of StoryboardFrame.find({}).select('scriptEpisodeId imageUrl videoUrl render.url').cursor()) {
    const set: Record<string, unknown> = {};
    const image = await move(f.imageUrl, `storyboards/${f.scriptEpisodeId}/${f._id}.jpg`);
    if (image) set.imageUrl = image;
    const video = await move(f.videoUrl, `storyboards/${f.scriptEpisodeId}/${f._id}.mp4`);
    if (video) set.videoUrl = video;
    const render = await move(f.render?.url, `renders/${f._id}.jpg`);
    if (render) set['render.url'] = render;
    if (Object.keys(set).length) await StoryboardFrame.updateOne({ _id: f._id }, { $set: { ...set, filesPermanent: true } });
  }

  for await (const l of Location.find({ 'board.0': { $exists: true } }).select('board').cursor()) {
    let changed = false;
    for (const [i, b] of l.board.entries()) {
      const url = await move(b.imageUrl, `locations/${l._id}/${i}.jpg`);
      if (url) { b.imageUrl = url; changed = true; }
    }
    if (changed) await l.save();
  }

  for await (const c of Character.find({ lookImageUrl: { $ne: null } }).select('lookImageUrl').cursor()) {
    const url = await move(c.lookImageUrl, `cast/${c._id}-front.jpg`);
    if (url) await Character.updateOne({ _id: c._id }, { $set: { lookImageUrl: url } });
  }

  for await (const t of Teaser.find({}).select('shots characters').cursor()) {
    let changed = false;
    for (const [i, s] of t.shots.entries()) {
      const image = await move(s.imageUrl, `teasers/${t._id}/shot-${i}.jpg`);
      if (image) { s.imageUrl = image; changed = true; }
      const clip = await move(s.clipUrl, `teasers/${t._id}/shot-${i}.mp4`);
      if (clip) { s.clipUrl = clip; changed = true; }
    }
    for (const [i, c] of t.characters.entries()) {
      const ref = await move(c.refImageUrl, `cast/${t._id}-${i}.png`);
      if (ref) { c.refImageUrl = ref; changed = true; }
    }
    if (changed) await t.save();
  }
  for await (const b of LookBook.find({}).select('sections characters locations').cursor()) {
    let changed = false;
    for (const [i, sec] of b.sections.entries()) {
      for (const [j, u] of sec.imageUrls.entries()) {
        const url = await move(u, `lookbooks/${b._id}/s${i}-${j}.jpg`);
        if (url) { sec.imageUrls[j] = url; changed = true; }
      }
    }
    for (const [i, x] of [...b.characters, ...b.locations].entries()) {
      const url = await move(x.imageUrl, `lookbooks/${b._id}/p${i}.jpg`);
      if (url) { x.imageUrl = url; changed = true; }
    }
    if (changed) { b.markModified('sections'); await b.save(); }
  }

  for await (const d of PitchDeck.find({}).select('slides').cursor()) {
    let changed = false;
    for (const [i, slide] of d.slides.entries()) {
      const url = await move(slide.imageUrl, `pitches/${d._id}/${i}.jpg`);
      if (url) { slide.imageUrl = url; changed = true; }
    }
    if (changed) await d.save();
  }
  return { copied, failed };
}
