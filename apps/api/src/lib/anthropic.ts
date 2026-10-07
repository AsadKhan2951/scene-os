import Anthropic from '@anthropic-ai/sdk';
import { env } from '../config/env';
import { HttpError } from './http';

let client: Anthropic | null = null;

/** The Claude client. Only ever used on the server; the key never reaches the browser. */
export function claude(): Anthropic {
  if (!env.ANTHROPIC_API_KEY) throw new HttpError(503, 'AI is not set up yet. Add ANTHROPIC_API_KEY on the server');
  client ??= new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });
  return client;
}

/** One-shot text generation. */
export async function generateText(system: string, prompt: string, maxTokens = 4000): Promise<string> {
  const res = await claude().messages.create({
    model: env.ANTHROPIC_MODEL,
    max_tokens: maxTokens,
    system,
    messages: [{ role: 'user', content: prompt }],
  });
  return res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
}
