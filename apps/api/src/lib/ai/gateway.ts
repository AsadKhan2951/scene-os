import type Anthropic from '@anthropic-ai/sdk';
import { tokenCostUsd, unitCostUsd, type UnitKind } from '@sceneos/shared';
import { env } from '../../config/env';
import { claude } from '../anthropic';
import { charge } from './credits';

/**
 * The AI gateway: the one door every model and media call goes through, so every call is
 * routed to the right model and metered. Feature code never calls a provider SDK directly.
 */

/** Which model does which kind of work (see the architecture doc, "Model routing"). */
export type Tier = 'deep' | 'standard' | 'fast';
export const modelFor = (tier: Tier = 'standard') =>
  tier === 'deep' ? env.ANTHROPIC_MODEL_DEEP : tier === 'fast' ? env.ANTHROPIC_MODEL_FAST : env.ANTHROPIC_MODEL;

type CreateParams = Omit<Anthropic.MessageCreateParams, 'model' | 'stream'> & { model?: string };

/** A Claude Messages call, metered from the token counts the API returns. */
export async function claudeMessage(params: CreateParams, tier: Tier = 'standard'): Promise<Anthropic.Message> {
  const model = params.model ?? modelFor(tier);
  const started = Date.now();
  const res = (await claude().messages.create({ ...params, model, stream: false } as Anthropic.MessageCreateParamsNonStreaming)) as Anthropic.Message;
  const u = (res.usage ?? {}) as { input_tokens?: number; output_tokens?: number; cache_creation_input_tokens?: number | null; cache_read_input_tokens?: number | null };
  const usage = {
    inputTokens: u.input_tokens ?? 0,
    outputTokens: u.output_tokens ?? 0,
    cacheCreationTokens: u.cache_creation_input_tokens ?? 0,
    cacheReadTokens: u.cache_read_input_tokens ?? 0,
  };
  await charge({ provider: 'anthropic', model, ...usage, costUsd: tokenCostUsd(model, usage), latencyMs: Date.now() - started });
  return res;
}

/** The text of a reply, ignoring thinking and tool blocks. */
export const replyText = (res: Anthropic.Message): string =>
  (res.content as { type: string; text?: string }[]).flatMap((b) => (b.type === 'text' && b.text ? [b.text] : [])).join('\n').trim();

/** Records a media or other provider call priced per unit (images, video seconds, characters, searches). */
export function meterUnits(provider: 'higgsfield' | 'elevenlabs' | 'google', unit: UnitKind, quantity: number, model?: string, latencyMs?: number) {
  return charge({ provider, model, unit, quantity, costUsd: unitCostUsd(unit, quantity), latencyMs });
}
