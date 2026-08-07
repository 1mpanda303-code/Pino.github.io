import { afterEach, describe, expect, it, vi } from 'vitest';
import { onRequest } from './models';

afterEach(() => vi.unstubAllGlobals());

describe('AI models endpoint', () => {
  it('returns model ids from an OpenAI-compatible endpoint', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      expect(url).toBe('https://api.example.com/v1/models');
      return new Response(JSON.stringify({ data: [{ id: 'model-a' }, { id: 'model-b' }] }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const request = new Request('http://local/api/ai/models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: 'https://api.example.com/v1', apiKey: 'sk-test' }),
    });
    const response = await onRequest({ request, env: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ models: ['model-a', 'model-b'] });
  });

  it('rejects non-https base urls', async () => {
    const request = new Request('http://local/api/ai/models', {
      method: 'POST',
      body: JSON.stringify({ baseUrl: 'http://api.example.com/v1', apiKey: 'sk-test' }),
    });
    const response = await onRequest({ request, env: {} });
    expect(response.status).toBe(502);
    expect(await response.json()).toMatchObject({ code: 'upstream_error' });
  });
});
