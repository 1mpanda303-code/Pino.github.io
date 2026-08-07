type DeepSeekEnv = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
  DEEPSEEK_MODEL?: string;
};

export type ProviderOverride = {
  providerId?: string;
  label?: string;
  protocol?: string;
  baseUrl?: string;
  model?: string;
  apiKey?: string;
  jsonMode?: boolean;
  maxOutputTokens?: number;
  modelCapability?: {
    jsonOutput?: boolean;
    contextTokens?: number | null;
    maxOutputTokens?: number | null;
  };
};

export type ProviderCall = {
  system: string;
  history: Array<{ role: 'user' | 'assistant'; content: string }>;
  question: string;
  maximumTokens: number;
  jsonObject?: boolean;
};

export type ProviderResult = {
  providerId: string;
  model: string;
  text: string;
  finishReason?: string;
  usage?: { promptTokens?: number; completionTokens?: number; totalTokens?: number };
};

function timeoutSignal(milliseconds: number) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), milliseconds);
  return { signal: controller.signal, clear: () => clearTimeout(timer) };
}

function normalizeBaseUrl(value: string) {
  return value.trim().replace(/\/+$/, '').replace(/\/chat\/completions$/i, '');
}

function hostnameIsLocalOrIp(hostname: string) {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized.includes(':')) return true;
  const parts = normalized.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part));
}

function validateUpstreamUrl(value: string) {
  if (value.startsWith('http://')) throw new Error('upstream_error');
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error('upstream_error');
  }
  if (parsed.protocol !== 'https:') throw new Error('upstream_error');
  if (parsed.username || parsed.password) throw new Error('upstream_error');
  if (hostnameIsLocalOrIp(parsed.hostname)) throw new Error('upstream_error');
}

export async function callDeepSeek(env: DeepSeekEnv, input: ProviderCall, override?: ProviderOverride): Promise<ProviderResult> {
  if (override && override.protocol !== undefined && override.protocol !== 'openai-compatible-chat') throw new Error('upstream_error');
  const apiKey = override?.apiKey?.trim() || env.DEEPSEEK_API_KEY?.trim();
  if (!apiKey) throw new Error('not_configured');
  const baseUrl = normalizeBaseUrl(override?.baseUrl?.trim() || env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com');
  validateUpstreamUrl(baseUrl);
  const model = override?.model?.trim() || env.DEEPSEEK_MODEL?.trim() || 'deepseek-v4-pro';
  const maximumTokens = override?.maxOutputTokens && Number.isInteger(override.maxOutputTokens) && override.maxOutputTokens > 0 && override.maxOutputTokens <= 1_000_000
    ? override.maxOutputTokens
    : input.maximumTokens;
  const capabilityMax = override?.modelCapability?.maxOutputTokens && Number.isInteger(override.modelCapability.maxOutputTokens) && override.modelCapability.maxOutputTokens > 0
    ? override.modelCapability.maxOutputTokens
    : maximumTokens;
  const effectiveMaximumTokens = Math.min(maximumTokens, capabilityMax);
  const jsonObject = input.jsonObject && (override?.jsonMode ?? true) && (override?.modelCapability?.jsonOutput ?? true);
  const timeout = timeoutSignal(600_000);
  try {
    const response = await fetch(`${baseUrl}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model,
        temperature: jsonObject ? 0.1 : 0.3,
        max_tokens: effectiveMaximumTokens,
        ...(jsonObject ? { response_format: { type: 'json_object' } } : {}),
        messages: [
          { role: 'system', content: input.system },
          ...input.history,
          { role: 'user', content: input.question },
        ],
      }),
      signal: timeout.signal,
    });
    if (response.status === 429) throw new Error('upstream_rate_limited');
    if (!response.ok) throw new Error('upstream_error');
    const payload = await response.json() as {
      choices?: Array<{ finish_reason?: unknown; message?: { content?: unknown } }>;
      usage?: { prompt_tokens?: unknown; completion_tokens?: unknown; total_tokens?: unknown };
    };
    const text = payload.choices?.[0]?.message?.content;
    if (typeof text !== 'string' || !text.trim()) throw new Error('upstream_error');
    const finishReason = typeof payload.choices?.[0]?.finish_reason === 'string' ? payload.choices[0].finish_reason : undefined;
    const usage = payload.usage ? {
      promptTokens: typeof payload.usage.prompt_tokens === 'number' ? payload.usage.prompt_tokens : undefined,
      completionTokens: typeof payload.usage.completion_tokens === 'number' ? payload.usage.completion_tokens : undefined,
      totalTokens: typeof payload.usage.total_tokens === 'number' ? payload.usage.total_tokens : undefined,
    } : undefined;
    return { providerId: override?.providerId || 'deepseek', model, text: text.trim(), finishReason, usage };
  } catch (error) {
    if (error instanceof Error && ['not_configured', 'upstream_rate_limited', 'upstream_error'].includes(error.message)) throw error;
    throw new Error('upstream_unavailable');
  } finally {
    timeout.clear();
  }
}
