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
  HIGGSFIELD_API_KEY: z.string().optional(),
  HIGGSFIELD_API_URL: z.string().optional(),
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

const parsed = schema.safeParse(process.env);
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
