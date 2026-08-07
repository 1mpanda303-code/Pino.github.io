export const AI_PROVIDER_PROTOCOL = 'openai-compatible-chat' as const;

export type AiProviderProtocol = typeof AI_PROVIDER_PROTOCOL;

export type AiProviderProfile = {
  id: string;
  label: string;
  protocol: AiProviderProtocol;
  baseUrl: string;
  model: string;
  models: string[];
  jsonMode: boolean;
  maxOutputTokens: number;
  modelCapabilities?: Record<string, AiModelCapability>;
};

export type AiProviderOverride = {
  providerId: string;
  label: string;
  protocol: AiProviderProtocol;
  baseUrl: string;
  model: string;
  apiKey?: string;
  jsonMode?: boolean;
  maxOutputTokens?: number;
  modelCapability?: AiModelCapability;
};

export type AiCapabilitySource = 'known' | 'user' | 'unknown';

export type AiModelCapability = {
  jsonOutput: boolean;
  contextTokens: number | null;
  maxOutputTokens: number | null;
  source: AiCapabilitySource;
  probedAt?: string;
};

export const DEFAULT_MAX_OUTPUT_TOKENS = 393_216;
const MAX_OUTPUT_CAP = 1_000_000;
export const MIN_REPORT_OUTPUT_TOKENS = 16_384;
export const MIN_REPORT_CONTEXT_TOKENS = 32_768;

const KNOWN_MODEL_CAPABILITIES: Record<string, AiModelCapability> = {
  'deepseek-v4-pro': { jsonOutput: true, contextTokens: 1_000_000, maxOutputTokens: 393_216, source: 'known' },
  'deepseek-v4-flash': { jsonOutput: true, contextTokens: 1_000_000, maxOutputTokens: 393_216, source: 'known' },
};

export function knownModelCapability(model: string): AiModelCapability | null {
  const capability = KNOWN_MODEL_CAPABILITIES[model.trim().toLocaleLowerCase()];
  return capability ? { ...capability } : null;
}

export function sanitizeModelCapability(value: unknown): AiModelCapability | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const item = value as Record<string, unknown>;
  if (typeof item.jsonOutput !== 'boolean') return null;
  const source = item.source === 'known' || item.source === 'user' ? item.source : 'unknown';
  const contextTokens = typeof item.contextTokens === 'number' && Number.isInteger(item.contextTokens) && item.contextTokens > 0
    ? Math.min(item.contextTokens, 10_000_000)
    : null;
  const maxOutputTokens = typeof item.maxOutputTokens === 'number' && Number.isInteger(item.maxOutputTokens) && item.maxOutputTokens > 0
    ? Math.min(item.maxOutputTokens, MAX_OUTPUT_CAP)
    : null;
  const probedAt = typeof item.probedAt === 'string' && item.probedAt ? item.probedAt.slice(0, 40) : undefined;
  return { jsonOutput: item.jsonOutput, contextTokens, maxOutputTokens, source, ...(probedAt ? { probedAt } : {}) };
}

export function capabilityForModel(profile: AiProviderProfile, model?: string): AiModelCapability {
  const selected = model?.trim() || profile.model;
  const manual = profile.modelCapabilities?.[selected];
  if (manual) return { ...manual };
  const known = knownModelCapability(selected);
  if (known) return known;
  return { jsonOutput: profile.jsonMode, contextTokens: null, maxOutputTokens: profile.maxOutputTokens, source: 'unknown' };
}

export type ReportCapabilityDecision =
  | { allowed: true; compact: boolean; jsonMode: boolean; effectiveMaxOutputTokens: number; capability: AiModelCapability }
  | { allowed: false; reason: string; compact: boolean; jsonMode: boolean; effectiveMaxOutputTokens: number; capability: AiModelCapability };

export function reportCapabilityDecision(profile: AiProviderProfile, model?: string): ReportCapabilityDecision {
  const capability = capabilityForModel(profile, model);
  return decideReportCapability(capability, profile.maxOutputTokens);
}

export function reportCapabilityDecisionFromOverride(provider?: AiProviderOverride): ReportCapabilityDecision {
  const capability: AiModelCapability = provider?.modelCapability ?? {
    jsonOutput: provider?.jsonMode ?? true,
    contextTokens: null,
    maxOutputTokens: provider?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS,
    source: 'unknown',
  };
  return decideReportCapability(capability, provider?.maxOutputTokens ?? DEFAULT_MAX_OUTPUT_TOKENS);
}

function decideReportCapability(capability: AiModelCapability, fallbackMaxOutput: number): ReportCapabilityDecision {
  const maxOutput = capability.maxOutputTokens ?? fallbackMaxOutput;
  const context = capability.contextTokens;
  if (!capability.jsonOutput) {
    return {
      allowed: false,
      reason: '当前模型未记录为支持 JSON 输出模式，无法可靠生成 AI 报告。请编辑模型能力或切换模型。',
      compact: false,
      jsonMode: false,
      effectiveMaxOutputTokens: maxOutput,
      capability,
    };
  }
  if (maxOutput < MIN_REPORT_OUTPUT_TOKENS) {
    return {
      allowed: false,
      reason: `当前模型最大输出 ${maxOutput} tokens，低于 AI 报告所需下限 ${MIN_REPORT_OUTPUT_TOKENS} tokens。请提高输出上限或切换模型。`,
      compact: false,
      jsonMode: true,
      effectiveMaxOutputTokens: maxOutput,
      capability,
    };
  }
  if (context !== null && context < MIN_REPORT_CONTEXT_TOKENS) {
    return {
      allowed: false,
      reason: `当前模型上下文 ${context} tokens，低于 AI 报告所需下限 ${MIN_REPORT_CONTEXT_TOKENS} tokens。请先清空对话或切换模型。`,
      compact: false,
      jsonMode: true,
      effectiveMaxOutputTokens: maxOutput,
      capability,
    };
  }
  return {
    allowed: true,
    compact: maxOutput < 128_000,
    jsonMode: true,
    effectiveMaxOutputTokens: Math.min(fallbackMaxOutput, maxOutput),
    capability,
  };
}

function sanitizeModelCapabilities(value: unknown): Record<string, AiModelCapability> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  const result: Record<string, AiModelCapability> = {};
  for (const [model, capability] of Object.entries(value as Record<string, unknown>)) {
    const normalized = sanitizeModelCapability(capability);
    if (normalized && model.trim()) result[model.trim().slice(0, 200)] = normalized;
  }
  return result;
}

export function normalizeBaseUrl(value: string): string {
  const trimmed = value.trim().replace(/\/+$/, '');
  return trimmed.replace(/\/chat\/completions$/i, '');
}

function hostnameIsLocalOrIp(hostname: string): boolean {
  const normalized = hostname.toLowerCase().replace(/^\[|\]$/g, '');
  if (normalized === 'localhost' || normalized.endsWith('.localhost')) return true;
  if (normalized.includes(':')) return true;
  const parts = normalized.split('.');
  return parts.length === 4 && parts.every((part) => /^\d{1,3}$/.test(part));
}

export function providerProfileErrors(input: Partial<AiProviderProfile>): string[] {
  const errors: string[] = [];
  if (!input.label?.trim()) errors.push('配置名称不能为空。');
  const baseUrl = normalizeBaseUrl(input.baseUrl ?? '');
  let parsed: URL | null = null;
  try {
    parsed = new URL(baseUrl);
  } catch {
    parsed = null;
  }
  if (!parsed) {
    errors.push('API Base URL 不是有效地址。');
  } else {
    if (parsed.protocol !== 'https:') errors.push('API Base URL 必须使用 HTTPS。');
    if (parsed.username || parsed.password) errors.push('API Base URL 不能包含用户名或密码。');
    if (hostnameIsLocalOrIp(parsed.hostname)) errors.push('API Base URL 不能指向本机、内网或 IP 地址。');
  }
  if (!input.model?.trim()) errors.push('模型名称不能为空。');
  const tokens = input.maxOutputTokens;
  if (tokens !== undefined && (!Number.isInteger(tokens) || tokens < 1 || tokens > MAX_OUTPUT_CAP)) {
    errors.push(`最大输出需为 1-${MAX_OUTPUT_CAP} 的整数。`);
  }
  return errors;
}

export function createAiProviderProfile(input: {
  id?: string;
  label: string;
  baseUrl: string;
  model: string;
  models?: string[];
  jsonMode?: boolean;
  maxOutputTokens?: number;
  modelCapabilities?: Record<string, AiModelCapability>;
}): AiProviderProfile {
  const profile: AiProviderProfile = {
    id: input.id?.trim() || `provider-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`,
    label: input.label.trim().slice(0, 80),
    protocol: AI_PROVIDER_PROTOCOL,
    baseUrl: normalizeBaseUrl(input.baseUrl),
    model: input.model.trim().slice(0, 200),
    models: [...new Set((input.models ?? []).map((item) => item.trim()).filter(Boolean).map((item) => item.slice(0, 200)))].slice(0, 30),
    jsonMode: input.jsonMode !== false,
    maxOutputTokens: Number.isInteger(input.maxOutputTokens) && input.maxOutputTokens! > 0 && input.maxOutputTokens! <= MAX_OUTPUT_CAP
      ? input.maxOutputTokens!
      : DEFAULT_MAX_OUTPUT_TOKENS,
    modelCapabilities: sanitizeModelCapabilities(input.modelCapabilities),
  };
  const errors = providerProfileErrors(profile);
  if (errors.length) throw new Error(errors.join('\n'));
  return profile;
}

export function sanitizeProviderProfile(value: unknown): AiProviderProfile | null {
  if (!value || typeof value !== 'object') return null;
  const item = value as Record<string, unknown>;
  if (typeof item.id !== 'string' || !item.id) return null;
  try {
    return createAiProviderProfile({
      id: item.id,
      label: typeof item.label === 'string' ? item.label : '',
      baseUrl: typeof item.baseUrl === 'string' ? item.baseUrl : '',
      model: typeof item.model === 'string' ? item.model : '',
      models: Array.isArray(item.models) ? item.models.filter((entry): entry is string => typeof entry === 'string') : [],
      jsonMode: item.jsonMode !== false,
      maxOutputTokens: typeof item.maxOutputTokens === 'number' ? item.maxOutputTokens : undefined,
      modelCapabilities: sanitizeModelCapabilities(item.modelCapabilities),
    });
  } catch {
    return null;
  }
}

export function toProviderOverride(profile: AiProviderProfile, apiKey?: string): AiProviderOverride {
  return {
    providerId: profile.id,
    label: profile.label,
    protocol: profile.protocol,
    baseUrl: profile.baseUrl,
    model: profile.model,
    apiKey: apiKey?.trim() || undefined,
    jsonMode: profile.jsonMode,
    maxOutputTokens: profile.maxOutputTokens,
    modelCapability: capabilityForModel(profile),
  };
}
