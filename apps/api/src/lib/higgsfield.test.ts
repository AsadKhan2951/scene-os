import { describe, expect, it, vi } from 'vitest';

vi.stubEnv('JWT_SECRET', 'test-secret-test-secret-test-secret-1234');
vi.stubEnv('HIGGSFIELD_API_KEY', 'id:secret');
const { generateClip, generateImage, outputUrl } = await import('./higgsfield');

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });

describe('outputUrl', () => {
  it('reads an image or a video', () => {
    expect(outputUrl({ status: 'completed', images: [{ url: 'https://x/a.jpg' }] })).toBe('https://x/a.jpg');
    expect(outputUrl({ status: 'completed', video: { url: 'https://x/a.mp4' } })).toBe('https://x/a.mp4');
    expect(outputUrl({ status: 'completed' })).toBeUndefined();
  });
});

describe('Higgsfield requests', () => {
  it('submits with the Key header, polls, and returns the image', async () => {
    vi.useFakeTimers();
    const calls: [string, RequestInit | undefined][] = [];
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      calls.push([url, init]);
      if (calls.length === 1) return json({ status: 'queued', status_url: 'https://api.higgsfield.ai/requests/r1/status' });
      if (calls.length === 2) return json({ status: 'in_progress' });
      return json({ status: 'completed', images: [{ url: 'https://cdn/frame.jpg' }] });
    }));
    const pending = generateImage('a courtyard at dawn');
    await vi.runAllTimersAsync();
    expect(await pending).toBe('https://cdn/frame.jpg');
    expect(calls[0][0]).toBe('https://api.higgsfield.ai/higgsfield-ai/soul/v2/standard');
    expect((calls[0][1]!.headers as Record<string, string>).Authorization).toBe('Key id:secret');
    expect(JSON.parse(calls[0][1]!.body as string)).toEqual({ prompt: 'a courtyard at dawn' });
    expect(calls[1][0]).toBe('https://api.higgsfield.ai/requests/r1/status');
    vi.useRealTimers();
  });

  it('sends the frame image for a clip and returns the video', async () => {
    vi.useFakeTimers();
    let body: Record<string, unknown> = {};
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      if (init?.method === 'POST') { body = JSON.parse(init.body as string); return json({ status: 'queued', status_url: 'https://api.higgsfield.ai/requests/r2/status' }); }
      return json({ status: 'completed', video: { url: 'https://cdn/clip.mp4' } });
    }));
    const pending = generateClip('she looks up', 'https://cdn/frame.jpg');
    await vi.runAllTimersAsync();
    expect(await pending).toBe('https://cdn/clip.mp4');
    expect(body).toMatchObject({ prompt: 'she looks up', image_url: 'https://cdn/frame.jpg', duration: 5, resolution: '720p' });
    vi.useRealTimers();
  });

  it('explains a blocked or failed request', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => json({ status: 'nsfw' })));
    await expect(generateImage('x')).rejects.toThrow(/unsafe/);
    vi.stubGlobal('fetch', vi.fn(async () => json({ detail: 'bad key' }, 401)));
    await expect(generateImage('x')).rejects.toThrow(/401/);
  });
});
