type Env = {
  DEEPSEEK_API_KEY?: string;
  DEEPSEEK_BASE_URL?: string;
};

type PagesContext = { request: Request; env: Env };

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' },
});

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

function isValidBaseUrl(value: string) {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    return false;
  }
  return parsed.protocol === 'https:' && !parsed.username && !parsed.password && !hostnameIsLocalOrIp(parsed.hostname);
}

export async function onRequest({ request, env }: PagesContext) {
  if (request.method !== 'POST') return json({ code: 'invalid_request', message: '不支持的请求方法。' }, 405);
  let body: { baseUrl?: unknown; apiKey?: unknown };
  try {
    body = await request.json() as typeof body;
  } catch {
    return json({ code: 'invalid_request', message: '请求不是有效 JSON。' }, 400);
  }
  const baseUrl = normalizeBaseUrl(
    typeof body.baseUrl === 'string' && body.baseUrl.trim()
      ? body.baseUrl
      : env.DEEPSEEK_BASE_URL?.trim() || 'https://api.deepseek.com',
  );
  const apiKey = typeof body.apiKey === 'string' ? body.apiKey.trim() : '';
  const key = apiKey || env.DEEPSEEK_API_KEY?.trim() || '';
  if (!key) return json({ code: 'not_configured', message: 'AI 尚未配置 API Key。' }, 503);
  if (!isValidBaseUrl(baseUrl)) return json({ code: 'upstream_error', message: 'API Base URL 无效或不允许。' }, 502);
  try {
    const response = await fetch(`${baseUrl}/models`, { headers: { Authorization: `Bearer ${key}` } });
    if (response.status === 429) return json({ code: 'upstream_rate_limited', message: '模型列表请求较多，请稍后再试。', retryAfter: 20 }, 429);
    if (!response.ok) return json({ code: 'upstream_error', message: '模型列表获取失败。' }, 502);
    const payload = await response.json() as { data?: Array<{ id?: unknown }> };
    const models = Array.isArray(payload.data)
      ? payload.data.map((item) => typeof item.id === 'string' ? item.id.trim() : '').filter(Boolean).slice(0, 200)
      : [];
    return json({ models });
  } catch {
    return json({ code: 'upstream_unavailable', message: '模型列表服务暂时不可用。' }, 503);
  }
}
