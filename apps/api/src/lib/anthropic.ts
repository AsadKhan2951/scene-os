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
 * Generation that must come back as JSON. The reply is started for the model with the opening
 * bracket, which stops it from answering in prose. If that still does not parse, it is asked once
 * more with the brief in the message itself. The error says what actually came back.
 */
export async function generateJson<T>(primary: string, prompt: string, open: '[' | '{', parse: (raw: string) => T, fallbackSystem?: string, maxTokens = 6000): Promise<T> {
  const ask = async (prefill: boolean, system: string) => {
    const res = await claude().messages.create({
      model: env.ANTHROPIC_MODEL,
      max_tokens: maxTokens,
      ...(prefill ? { system } : {}),
      messages: [
        { role: 'user', content: prefill ? prompt : `${system}\n\n${prompt}` },
        ...(prefill ? [{ role: 'assistant' as const, content: open }] : []),
      ],
    });
    const text = res.content.flatMap((b) => (b.type === 'text' ? [b.text] : [])).join('\n').trim();
    return { text: prefill ? `${open}${text}` : text, stop: res.stop_reason };
  };
  let last = '';
  const tries: [boolean, string][] = [[true, primary], [false, primary], ...(fallbackSystem ? [[true, fallbackSystem] as [boolean, string]] : [])];
  for (const [prefill, brief] of tries) {
    try {
      const reply = await ask(prefill, brief);
      try { return parse(reply.text); } catch (err) {
        last = `${err instanceof Error ? err.message.slice(0, 120) : 'not valid JSON'} (stopped: ${reply.stop}; reply began: ${reply.text.slice(0, 120) || 'empty'})`;
        console.error('Planning reply could not be used:', last);
      }
    } catch (err) {
      last = err instanceof Error ? err.message.slice(0, 240) : 'the AI request failed';
      console.error('Planning request failed:', last);
    }
  }
  throw new HttpError(502, `The AI plan could not be written. ${last}`);
}
