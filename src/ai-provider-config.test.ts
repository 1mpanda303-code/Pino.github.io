import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_MAX_OUTPUT_TOKENS } from '../functions/api/ai/chat';
import { callDeepSeek } from '../functions/lib/aiProviders';

afterEach(() => vi.unstubAllGlobals());

describe('DeepSeek output budget', () => {
  it('uses the model maximum and preserves the upstream finish reason', async () => {
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (_url: string, init?: RequestInit) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({
        choices: [{ finish_reason: 'length', message: { content: '{"partial":true}' } }],
        usage: { prompt_tokens: 20, completion_tokens: AI_MAX_OUTPUT_TOKENS, total_tokens: 393236 },
      }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const result = await callDeepSeek(
      { DEEPSEEK_API_KEY: 'test-only-key' },
      { system: 'system', history: [], question: 'question', maximumTokens: AI_MAX_OUTPUT_TOKENS, jsonObject: true },
    );

    expect(AI_MAX_OUTPUT_TOKENS).toBe(393216);
    expect(requestBody).toMatchObject({ model: 'deepseek-v4-pro', max_tokens: 393216, response_format: { type: 'json_object' } });
    expect(result).toMatchObject({ model: 'deepseek-v4-pro', finishReason: 'length', usage: { completionTokens: 393216 } });
  });

  it('honors a request-level provider override and keeps the env key as fallback', async () => {
    let requestUrl = '';
    let requestBody: Record<string, unknown> | undefined;
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      requestUrl = url;
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }], usage: {} }), { status: 200, headers: { 'Content-Type': 'application/json' } });
    }));

    const result = await callDeepSeek(
      { DEEPSEEK_API_KEY: 'env-key' },
      { system: 'system', history: [], question: 'question', maximumTokens: AI_MAX_OUTPUT_TOKENS, jsonObject: true },
      { providerId: 'p1', baseUrl: 'https://api.test.example/v1', model: 'test-model', maxOutputTokens: 2048, jsonMode: false },
    );

    expect(requestUrl).toBe('https://api.test.example/v1/chat/completions');
    expect(requestBody).toMatchObject({ model: 'test-model', max_tokens: 2048 });
    expect(requestBody).not.toHaveProperty('response_format');
    expect(result).toMatchObject({ providerId: 'p1', model: 'test-model', finishReason: 'stop' });
  });
});
