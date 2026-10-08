import { z } from 'zod';
import { DEFAULT_HEALTH_THRESHOLDS } from '@sceneos/shared';

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().default(4000),
  MONGODB_URI: z.string().default('mongodb://localhost:27017/sceneos'),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  JWT_SECRET: z.string().min(32, 'JWT_SECRET must be at least 32 characters'),
  WEB_ORIGIN: z.string().default('http://localhost:3000'),
  ANTHROPIC_API_KEY: z.string().optional(),
  ANTHROPIC_MODEL: z.string().default('claude-sonnet-5-5'),
  /** "<key id>:<key secret>", exactly as Higgsfield shows it. */
  HIGGSFIELD_API_KEY: z.string().optional(),
  HIGGSFIELD_API_URL: z.string().default('https://api.higgsfield.ai'),
  HIGGSFIELD_IMAGE_MODEL: z.string().default('higgsfield-ai/soul/v2/standard'),
  /** Draws a new picture from reference photos. Used to keep a character's face and clothes the same in every shot. */
  HIGGSFIELD_EDIT_MODEL: z.string().default('alibaba/qwen-image-3/edit'),
  HIGGSFIELD_VIDEO_MODEL: z.string().default('kling-video/v3.0-turbo/image-to-video'),
  HIGGSFIELD_VIDEO_SECONDS: z.coerce.number().int().min(3).max(15).default(5),
  /** Optional extra JSON merged into the request body, for model-specific settings. */
  HIGGSFIELD_IMAGE_PARAMS: z.string().optional(),
  /** Voice-over and music for teasers. */
  ELEVENLABS_API_KEY: z.string().optional(),
  ELEVENLABS_TTS_MODEL: z.string().default('eleven_v3'),
  ELEVENLABS_VOICE_FEMALE: z.string().default('EXAVITQu4vr4xnSDxMaL'),
  ELEVENLABS_VOICE_MALE: z.string().default('JBFqnCBsd6RMkjVDRZzb'),
  /** Where finished teasers are kept. Shared between the API and the worker. */
  MEDIA_DIR: z.string().default('/data/media'),
  TEASER_FONT: z.string().default('/usr/share/fonts/noto/NotoSans-Bold.ttf'),
  HIGGSFIELD_VIDEO_PARAMS: z.string().optional(),
  SPACES_ENDPOINT: z.string().optional(),
  SPACES_REGION: z.string().default('sgp1'),
  SPACES_BUCKET: z.string().optional(),
  SPACES_KEY: z.string().optional(),
  SPACES_SECRET: z.string().optional(),
  HEALTH_BUDGET_AMBER_PCT: z.coerce.number().default(DEFAULT_HEALTH_THRESHOLDS.budgetAmberPct),
  HEALTH_BUDGET_RED_PCT: z.coerce.number().default(DEFAULT_HEALTH_THRESHOLDS.budgetRedPct),
  HEALTH_PENDING_AMBER: z.coerce.number().default(DEFAULT_HEALTH_THRESHOLDS.pendingAmberCount),
  HEALTH_PENDING_RED: z.coerce.number().default(DEFAULT_HEALTH_THRESHOLDS.pendingRedCount),
});

// A blank line in .env (KEY=) means "not set", so defaults apply.
const emptyToUndefined = Object.fromEntries(Object.entries(process.env).filter(([, v]) => v !== ''));
const parsed = schema.safeParse(emptyToUndefined);
if (!parsed.success) {
  console.error('Invalid environment:', parsed.error.flatten().fieldErrors);
  process.exit(1);
}
export const env = parsed.data;
export const isProd = env.NODE_ENV === 'production';
export const healthThresholds = {
  budgetAmberPct: env.HEALTH_BUDGET_AMBER_PCT,
  budgetRedPct: env.HEALTH_BUDGET_RED_PCT,
  pendingAmberCount: env.HEALTH_PENDING_AMBER,
  pendingRedCount: env.HEALTH_PENDING_RED,
};
