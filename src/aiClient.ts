import type { AiChatRequest, AiChatResponse, AiError } from './domain/aiStudy';

export class AiClientError extends Error {
  readonly code: AiError['code'];
  readonly retryAfter?: number;

  constructor(error: AiError) {
    super(error.message);
    this.name = 'AiClientError';
    this.code = error.code;
    this.retryAfter = error.retryAfter;
  }
}

function endpoint() {
  return import.meta.env.VITE_AI_API_URL || `${import.meta.env.BASE_URL}api/ai/chat`;
}

function modelsEndpoint() {
  const api = endpoint();
  if (api.endsWith('/api/ai/chat')) return api.replace(/\/chat$/, '/models');
  return `${api.replace(/\/+$/, '')}/api/ai/models`;
}

export async function requestAi(request: AiChatRequest, signal?: AbortSignal): Promise<AiChatResponse> {
  let response: Response;
  try {
    response = await fetch(endpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(request),
      signal,
    });
  } catch {
    throw new AiClientError({ code: 'upstream_unavailable', message: 'AI 服务暂时不可用，请稍后重试。' });
  }

  let payload: AiChatResponse | AiError | null = null;
  try { payload = await response.json() as AiChatResponse | AiError; } catch { /* stable client error below */ }
  if (!response.ok || !payload || !('text' in payload)) {
    const error = payload && 'code' in payload ? payload : { code: 'upstream_error' as const, message: 'AI 服务返回了无法识别的响应。' };
    throw new AiClientError(error);
  }
  return payload;
}

export async function requestAiModels(input: { baseUrl: string; apiKey?: string }, signal?: AbortSignal): Promise<string[]> {
  let response: Response;
  try {
    response = await fetch(modelsEndpoint(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(input),
      signal,
    });
  } catch {
    throw new AiClientError({ code: 'upstream_unavailable', message: '模型列表服务暂时不可用，请稍后重试。' });
  }

  let payload: AiError | { models?: unknown } | null = null;
  try {
    payload = await response.json() as AiError | { models?: unknown };
  } catch {
    // stable client error below
  }
  if (!response.ok || !payload || !('models' in payload) || !Array.isArray(payload.models)) {
    const error = payload && 'code' in payload ? payload : { code: 'upstream_error' as const, message: '模型列表返回了无法识别的响应。' };
    throw new AiClientError(error);
  }
  return payload.models.filter((item): item is string => typeof item === 'string' && !!item.trim()).slice(0, 200);
}
