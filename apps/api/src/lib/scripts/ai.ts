import type { z } from 'zod';
import { extractJsonArray, extractJsonObject } from '@sceneos/shared';
import { HttpError } from '../http';
import { claudeStream, replyText, type Tier } from '../ai/gateway';

/**
 * Claude over a whole script. The script goes first in the prompt and is cached, so the
 * intake run's several questions about the same script pay full price for it once
 * (a cache read costs 5% of normal input on Opus and Sonnet).
 */
export async function askAboutScript<S extends z.ZodTypeAny>(opts: {
  system: string;
  script: string;
  task: string;
  schema: S;
  shape: 'object' | 'array';
  tier?: Tier;
  maxTokens?: number;
}): Promise<z.infer<S>> {
  const problems: string[] = [];
  for (let attempt = 0; attempt < 2; attempt++) {
    const res = await claudeStream({
      max_tokens: opts.maxTokens ?? 16000,
      system: `${opts.system}\nReply with JSON only, no prose and no code fence.`,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: `<script>\n${opts.script}\n</script>`, cache_control: { type: 'ephemeral' } },
          { type: 'text', text: attempt ? `${opts.task}\n\nYour previous reply could not be used (${problems.at(-1)}). Reply with valid JSON only.` : opts.task },
        ],
      }],
    } as never, opts.tier ?? 'standard');
    const text = replyText(res);
    try {
      return opts.schema.parse(opts.shape === 'array' ? extractJsonArray(text) : extractJsonObject(text));
    } catch (err) {
      problems.push(`${err instanceof Error ? err.message.slice(0, 120) : 'invalid JSON'}; stopped: ${res.stop_reason}`);
    }
  }
  throw new HttpError(502, `The AI reply could not be read. ${problems.join(' | ')}`);
}

/**
 * Reads a PDF screenplay (including Urdu scripts exported from InPage) and writes it out as
 * plain screenplay text, which the parser then reads like any Fountain file.
 */
export async function transcribePdf(pdf: Buffer): Promise<string> {
  const res = await claudeStream({
    max_tokens: 64000,
    system: 'You transcribe screenplays exactly. Never summarise, translate, correct or skip anything.',
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: 'application/pdf', data: pdf.toString('base64') } },
        { type: 'text', text: `Write out this screenplay as plain text, in its original language and script, in this layout:
- Each scene starts with its heading on its own line, in English capitals: "INT. PLACE - TIME" or "EXT. PLACE - TIME" (translate only the INT/EXT and the time word if they are written in another language; keep the place name as written).
- A blank line, then the action lines.
- A character's name on its own line in capitals (in the script's own language and script if that is how it is written), with their dialogue on the lines right under it; parentheticals in brackets on their own line.
- A blank line between blocks. Leave out page numbers, headers, footers and scene numbers.
Output only the screenplay text.` },
      ],
    }],
  } as never, 'standard');
  const text = replyText(res);
  if (!text) throw new HttpError(502, 'The PDF could not be read. Try exporting it again, or upload the Final Draft (.fdx) file');
  return text;
}
