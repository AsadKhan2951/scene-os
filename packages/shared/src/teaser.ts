import { z } from 'zod';

export const TEASER_TONES = ['emotional', 'suspense', 'romantic', 'intense', 'hopeful'] as const;
export const TEASER_MUSIC = ['soft_piano_strings', 'sitar_and_flute', 'tense_percussion', 'ost_style_vocal_hum', 'no_music'] as const;
export const TEASER_MUSIC_LABELS: Record<(typeof TEASER_MUSIC)[number], string> = {
  soft_piano_strings: 'Soft piano and strings',
  sitar_and_flute: 'Sitar and flute',
  tense_percussion: 'Tense percussion',
  ost_style_vocal_hum: 'OST style with a vocal hum',
  no_music: 'No music',
};
export const TEASER_VOICES = ['female', 'male'] as const;
export const TEASER_VOICE_LANGUAGES = ['urdu', 'english'] as const;
export const TEASER_STATUSES = ['planned', 'queued', 'rendering', 'ready', 'failed'] as const;

export const TEASER_MIN_SECONDS = 15;
export const TEASER_MAX_SECONDS = 60;
/** The closing title card is part of the total running time. */
export const TEASER_END_CARD_SECONDS = 3;

export interface TeaserTiming { shots: number; shotSeconds: number; clipSeconds: number; voiceOverWords: number }

/**
 * Splits a running time into equal shots plus the end card.
 * Shots aim for about five seconds; clips are generated in whole seconds and trimmed.
 */
export function teaserTiming(durationSeconds: number): TeaserTiming {
  const body = durationSeconds - TEASER_END_CARD_SECONDS;
  const shots = Math.max(2, Math.round(body / 5));
  const shotSeconds = Math.round((body / shots) * 100) / 100;
  return {
    shots,
    shotSeconds,
    clipSeconds: Math.min(15, Math.max(3, Math.ceil(shotSeconds))),
    // A promo voice-over reads at roughly 1.8 words a second, leaving room to breathe at both ends.
    voiceOverWords: Math.floor((durationSeconds - 4) * 1.8),
  };
}

export const teaserCreateSchema = z.object({
  storyId: z.string().regex(/^[a-f0-9]{24}$/i),
  durationSeconds: z.number().int().min(TEASER_MIN_SECONDS).max(TEASER_MAX_SECONDS),
  tone: z.enum(TEASER_TONES),
  music: z.enum(TEASER_MUSIC),
  musicNotes: z.string().max(300).optional(),
  voiceOver: z.boolean(),
  voice: z.enum(TEASER_VOICES).default('female'),
  voiceLanguage: z.enum(TEASER_VOICE_LANGUAGES).default('urdu'),
  endLine: z.string().max(80).optional(),
});

export const teaserUpdateSchema = z.object({
  characters: z.array(z.object({ name: z.string().min(1).max(100), look: z.string().min(1).max(600) })).max(8).optional(),
  shots: z.array(z.object({ visual: z.string().min(1).max(800), motion: z.string().max(400).default('') })).min(2).max(20).optional(),
  voiceOverScript: z.string().max(1200).optional(),
  musicPrompt: z.string().max(600).optional(),
  endLine: z.string().max(80).optional(),
});

/** What the planning model must return. */
export const teaserPlanSchema = z.object({
  characters: z.array(z.object({ name: z.string(), look: z.string() })).max(8),
  shots: z.array(z.object({ visual: z.string(), motion: z.string().nullish().transform((v) => v ?? '') })).min(2).max(20),
  voiceOverScript: z.string().nullish().transform((v) => v ?? ''),
  musicPrompt: z.string().nullish().transform((v) => v ?? ''),
});

/** Pulls the first JSON object out of a model reply that may have prose or a code fence around it. */
export function extractJsonObject(raw: string): unknown {
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) throw new Error('The reply contained no JSON object');
  return JSON.parse(raw.slice(start, end + 1));
}
