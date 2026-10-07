import { env } from '../config/env';

/** Turns a storyboard frame description into an image URL. */
export interface ImageProvider {
  readonly name: string;
  generate(prompt: string): Promise<string>;
}

/**
 * Higgsfield provider.
 *
 * NOT WIRED YET: the request and response shape below is a guess and must be
 * replaced with the real Higgsfield API contract once the key and docs are in hand.
 * Until HIGGSFIELD_API_KEY and HIGGSFIELD_API_URL are set, imageProvider() returns
 * null and frames are saved with status "needs_image" (text only, no picture).
 */
class HiggsfieldProvider implements ImageProvider {
  readonly name = 'higgsfield';
  constructor(private url: string, private key: string) {}

  async generate(prompt: string): Promise<string> {
    const res = await fetch(this.url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${this.key}` },
      body: JSON.stringify({ prompt, aspect_ratio: '16:9' }),
    });
    if (!res.ok) throw new Error(`Higgsfield returned ${res.status}`);
    const data = (await res.json()) as { url?: string };
    if (!data.url) throw new Error('Higgsfield returned no image URL');
    return data.url;
  }
}

export function imageProvider(): ImageProvider | null {
  if (!env.HIGGSFIELD_API_KEY || !env.HIGGSFIELD_API_URL) return null;
  return new HiggsfieldProvider(env.HIGGSFIELD_API_URL, env.HIGGSFIELD_API_KEY);
}
