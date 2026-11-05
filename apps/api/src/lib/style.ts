import type { StylePreset } from '@sceneos/shared';
import { Production, Story } from '../models';
import { DEFAULT_STYLE, artDirectorFor, type StyleInput } from './artDirector';

/** The style of the production a story belongs to. Stories with no production keep the original Pakistani rules. */
export async function styleForStory(storyId: unknown): Promise<StyleInput> {
  const story = await Story.findById(storyId).select('productionId').lean();
  if (!story?.productionId) return DEFAULT_STYLE;
  const p = await Production.findById(story.productionId).select('stylePreset country language').lean();
  if (!p) return DEFAULT_STYLE;
  return { preset: (p.stylePreset ?? 'pakistani_serial') as StylePreset, country: p.country ?? undefined, language: p.language ?? undefined };
}

export async function briefForStory(storyId: unknown) {
  return artDirectorFor(await styleForStory(storyId));
}
