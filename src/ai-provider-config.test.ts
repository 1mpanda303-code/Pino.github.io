import { afterEach, describe, expect, it, vi } from 'vitest';
import { AI_MAX_OUTPUT_TOKENS, onRequest } from '../functions/api/ai/chat';
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

describe('browser provider configuration', () => {
  it('explains that either the session key or the production secret is missing', async () => {
    const request = new Request('http://local/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({ action: 'chat', language: 'zh', question: '你好', history: [] }),
    });

    const response = await onRequest({ request, env: {} });
    expect(response.status).toBe(503);
    expect(await response.json()).toMatchObject({
      code: 'not_configured',
      message: '未检测到可用 API Key。请在当前会话重新输入 API Key，或在 Cloudflare Pages Production Secrets 配置 DEEPSEEK_API_KEY 后重新部署。',
    });
  });

  it('uses the session provider key when no server-side key is configured', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
      expect(url).toBe('https://api.deepseek.com/chat/completions');
      expect(init?.headers).toMatchObject({ Authorization: 'Bearer session-key' });
      return new Response(JSON.stringify({ choices: [{ finish_reason: 'stop', message: { content: 'ok' } }] }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }));

    const request = new Request('http://local/api/ai/chat', {
      method: 'POST',
      body: JSON.stringify({
        action: 'chat',
        language: 'zh',
        question: 'Explain this sentence.',
        history: [],
        provider: {
          providerId: 'deepseek-browser',
          protocol: 'openai-compatible-chat',
          baseUrl: 'https://api.deepseek.com',
          model: 'deepseek-v4-flash',
          apiKey: 'session-key',
        },
      }),
    });

    const response = await onRequest({ request, env: {} });
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ providerId: 'deepseek-browser', model: 'deepseek-v4-flash', text: 'ok' });
  });
});
