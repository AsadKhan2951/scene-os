/**
 * AI credits. Every AI action is metered in provider units (tokens, images, video seconds,
 * characters, minutes, searches), priced in USD from a rate table, then turned into credits.
 *
 * credits = cost in USD x markup / CREDIT_USD
 *
 * The rate table is versioned: a usage event stores the version it was priced with,
 * so old charges can always be explained after a provider changes its prices.
 */

/** What one credit is worth to the customer, in USD. A business setting; can be overridden on the server. */
export const CREDIT_USD = 0.01;
/** Default markup over provider cost. A business setting; can be overridden on the server. */
export const DEFAULT_MARKUP = 2;
/** Credits each workspace gets per month until plans exist. */
export const DEFAULT_MONTHLY_CREDITS = 2000;

export const RATE_TABLE_VERSION = '2026-11-05';

/** Claude prices in USD per million tokens (platform.claude.com/docs/en/about-claude/pricing, 5 Nov 2026). */
export interface TokenRates { input: number; output: number; cacheWrite5m: number; cacheWrite1h: number; cacheRead: number }
export const CLAUDE_RATES: Record<string, TokenRates> = {
  'claude-opus-5-5': { input: 4, output: 20, cacheWrite5m: 5, cacheWrite1h: 8, cacheRead: 0.2 },
  'claude-sonnet-5-5': { input: 2, output: 10, cacheWrite5m: 2.5, cacheWrite1h: 4, cacheRead: 0.1 },
  'claude-haiku-5-5': { input: 0.1, output: 0.5, cacheWrite5m: 0.125, cacheWrite1h: 0.2, cacheRead: 0.01 },
};
/** Haiku 5.5 costs 5x when the whole prompt is over 100K tokens. */
export const HAIKU_LONG_PROMPT = { model: 'claude-haiku-5-5', threshold: 100_000, multiplier: 5 } as const;
/** Used when a model id is not in the table, so nothing is ever metered at zero. */
export const FALLBACK_TOKEN_RATES: TokenRates = CLAUDE_RATES['claude-opus-5-5'];

/**
 * Media and other provider prices in USD per unit. Higgsfield and Google numbers are
 * estimates until measured on the account (see the architecture doc); change them here or
 * through the server's rate overrides when the real figures are known.
 */
export const UNIT_RATES = {
  /** Higgsfield: about $5 per 100 credits; a premium image is about 2 credits. */
  'higgsfield.image': 0.1,
  'higgsfield.edit': 0.1,
  /** Kling 3.0 Turbo through Higgsfield: about 14 credits for 8 s at 720p. */
  'higgsfield.video_second': 0.09,
  /** Soul ID training: not published by Higgsfield. Placeholder until measured. */
  'higgsfield.character_training': 1,
  /** ElevenLabs: v3 text to speech per 1,000 characters. */
  'elevenlabs.tts_1k_chars': 0.08,
  'elevenlabs.music_minute': 0.15,
  'elevenlabs.stt_hour': 0.22,
  /** Google Places API (New). Estimates; verify on the Google Cloud billing page. */
  'google.places_text_search': 0.035,
  'google.places_photo': 0.007,
} as const;
export type UnitKind = keyof typeof UNIT_RATES;

export interface TokenUsage {
  inputTokens: number;
  outputTokens: number;
  cacheCreationTokens?: number;
  cacheReadTokens?: number;
  /** Cache writes with a 1-hour lifetime cost more than 5-minute ones. */
  cacheTtl?: '5m' | '1h';
}

/** USD cost of one Claude call. */
export function tokenCostUsd(model: string, u: TokenUsage): number {
  const r = CLAUDE_RATES[model] ?? FALLBACK_TOKEN_RATES;
  const promptTokens = u.inputTokens + (u.cacheCreationTokens ?? 0) + (u.cacheReadTokens ?? 0);
  const long = model === HAIKU_LONG_PROMPT.model && promptTokens > HAIKU_LONG_PROMPT.threshold ? HAIKU_LONG_PROMPT.multiplier : 1;
  const write = u.cacheTtl === '1h' ? r.cacheWrite1h : r.cacheWrite5m;
  const usd = (u.inputTokens * r.input + u.outputTokens * r.output + (u.cacheCreationTokens ?? 0) * write + (u.cacheReadTokens ?? 0) * r.cacheRead) / 1_000_000;
  return usd * long;
}

export const unitCostUsd = (kind: UnitKind, quantity: number) => UNIT_RATES[kind] * quantity;

/** Credits for a USD cost, rounded up to a hundredth of a credit so small calls still count. */
export function creditsFor(costUsd: number, markup = DEFAULT_MARKUP, creditUsd = CREDIT_USD): number {
  if (costUsd <= 0) return 0;
  return Math.ceil((costUsd * markup / creditUsd) * 100) / 100;
}

/** The features shown in usage reports. Every metered call names one. */
export const AI_FEATURES = [
  'writers', 'storyboard', 'scene_video', 'dreamer', 'reports', 'actors', 'locations', 'other',
] as const;
export type AiFeature = (typeof AI_FEATURES)[number];
export const AI_FEATURE_LABELS: Record<AiFeature, string> = {
  writers: 'Writing (one-liner, scripts)',
  storyboard: 'Storyboards and clips',
  scene_video: 'Scene video and teasers',
  dreamer: 'Ask Scene AI',
  reports: 'Reports',
  actors: 'Actor database',
  locations: 'Locations',
  other: 'Other',
};

/**
 * Rough credit quotes for actions that are checked before they start. They only need to be
 * in the right range: the real cost of every call is recorded and charged afterwards.
 */
export const ACTION_QUOTES = {
  'writers.one_liner': 15,
  'writers.episode': 60,
  /** Reading a whole script: overview, characters, characterisation, looks and coverage. */
  'writers.intake': 250,
  'writers.character': 30,
  'writers.dictate': 2,
  'storyboard.scene': 70,
  'storyboard.frame': 25,
  'storyboard.clip': 110,
  'scene_video.plan': 40,
  'scene_video.render': 1200,
  'dreamer.message': 10,
  'reports.generate': 20,
  'actors.generate': 30,
  'locations.search': 10,
  'locations.estimate': 10,
} as const;
export type QuotedAction = keyof typeof ACTION_QUOTES;

export const LEDGER_KINDS = ['grant', 'debit', 'hold', 'release', 'adjust'] as const;
export type LedgerKind = (typeof LEDGER_KINDS)[number];
