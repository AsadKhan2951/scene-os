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


/**
 * Generation that must come back as JSON. Newer models think before they answer and that thinking
 * counts against max_tokens, so the allowance is generous: a small one leaves no room for the answer.
 * If the reply cannot be used it is asked once more with a shorter brief. The error says what came back.
 */
export async function generateJson<T>(primary: string, prompt: string, parse: (raw: string) => T, fallbackSystem?: string, maxTokens = 16000): Promise<T> {
  const problems: string[] = [];
  for (const system of [primary, ...(fallbackSystem ? [fallbackSystem] : [])]) {
    try {
      const res = await claude().messages.create({ model: env.ANTHROPIC_MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content: prompt }] });
      const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
      try { return parse(text); } catch (err) {
        problems.push(`${err instanceof Error ? err.message.slice(0, 100) : 'not valid JSON'} (stopped: ${res.stop_reason}; reply began: ${text.slice(0, 80) || 'empty'})`);
      }
    } catch (err) {
      problems.push(err instanceof Error ? err.message.slice(0, 160) : 'the AI request failed');
    }
  }
  console.error('Planning failed:', problems);
  throw new HttpError(502, `The AI plan could not be written. ${problems.join(' | ')}`);
}
