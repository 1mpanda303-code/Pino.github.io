import { describe, expect, it } from 'vitest';
import {
  capabilityForModel, createAiProviderProfile, DEFAULT_MAX_OUTPUT_TOKENS, knownModelCapability, normalizeBaseUrl, providerProfileErrors, reportCapabilityDecision, sanitizeProviderProfile, toProviderOverride,
} from './aiProvider';

describe('AI provider configuration', () => {
  it('normalizes base URLs and removes a chat completions suffix', () => {
    expect(normalizeBaseUrl(' https://api.deepseek.com/v1/chat/completions/ ')).toBe('https://api.deepseek.com/v1');
    expect(normalizeBaseUrl('https://api.deepseek.com/')).toBe('https://api.deepseek.com');
  });

  it('rejects insecure, local and credential-bearing URLs', () => {
    expect(providerProfileErrors({ label: 'x', baseUrl: 'http://api.example.com', model: 'm', maxOutputTokens: 1000 }).join(' ')).toContain('必须使用 HTTPS');
    expect(providerProfileErrors({ label: 'x', baseUrl: 'https://localhost:11434', model: 'm', maxOutputTokens: 1000 }).join(' ')).toContain('不能指向本机');
    expect(providerProfileErrors({ label: 'x', baseUrl: 'https://user:pass@api.example.com', model: 'm', maxOutputTokens: 1000 }).join(' ')).toContain('不能包含用户名或密码');
  });

  it('creates a profile and builds a request override without persisting the key', () => {
    const profile = createAiProviderProfile({
      label: 'DeepSeek',
      baseUrl: 'https://api.deepseek.com/',
      model: 'deepseek-v4-pro',
      models: ['deepseek-v4-pro', 'deepseek-v4-flash'],
      maxOutputTokens: 1000,
    });
    expect(profile.baseUrl).toBe('https://api.deepseek.com');
    expect(profile.models).toEqual(['deepseek-v4-pro', 'deepseek-v4-flash']);
    expect(providerProfileErrors(profile)).toEqual([]);
    expect(toProviderOverride(profile, '  sk-test  ')).toMatchObject({ providerId: profile.id, baseUrl: 'https://api.deepseek.com', model: 'deepseek-v4-pro', apiKey: 'sk-test', maxOutputTokens: 1000 });
    expect(toProviderOverride(profile, '  ').apiKey).toBeUndefined();
    expect('apiKey' in profile).toBe(false);
  });

  it('sanitizes only valid stored profiles', () => {
    const profile = createAiProviderProfile({ label: 'x', baseUrl: 'https://api.example.com', model: 'm' });
    expect(sanitizeProviderProfile(profile)?.id).toBe(profile.id);
    expect(sanitizeProviderProfile({ ...profile, baseUrl: 'http://api.example.com' })).toBeNull();
    expect(sanitizeProviderProfile({ ...profile, model: '' })).toBeNull();
    expect(sanitizeProviderProfile({ label: 'no id', baseUrl: 'https://api.example.com', model: 'm' })).toBeNull();
    expect(DEFAULT_MAX_OUTPUT_TOKENS).toBe(393216);
  });

  it('records per-model capabilities and uses them in the request override', () => {
    const profile = createAiProviderProfile({
      label: 'Capable API',
      baseUrl: 'https://api.example.com',
      model: 'mini-model',
      models: ['mini-model', 'big-model'],
      modelCapabilities: {
        'mini-model': { jsonOutput: false, contextTokens: 16_000, maxOutputTokens: 4_096, source: 'user' },
        'big-model': { jsonOutput: true, contextTokens: 200_000, maxOutputTokens: 64_000, source: 'user' },
      },
    });
    expect(capabilityForModel(profile, 'big-model')).toMatchObject({ jsonOutput: true, contextTokens: 200_000, maxOutputTokens: 64_000, source: 'user' });
    expect(toProviderOverride(profile, 'sk-test')).toMatchObject({ model: 'mini-model', modelCapability: { jsonOutput: false, contextTokens: 16_000, maxOutputTokens: 4_096 } });
    const sanitized = sanitizeProviderProfile(profile);
    expect(sanitized?.modelCapabilities?.['big-model']).toMatchObject({ jsonOutput: true });
  });

  it('disables AI report generation when JSON output is unsupported', () => {
    const profile = createAiProviderProfile({
      label: 'No JSON',
      baseUrl: 'https://api.example.com',
      model: 'text-only',
      modelCapabilities: { 'text-only': { jsonOutput: false, contextTokens: 100_000, maxOutputTokens: 50_000, source: 'user' } },
    });
    const decision = reportCapabilityDecision(profile);
    expect(decision.allowed).toBe(false);
    if (!decision.allowed) expect(decision.reason).toContain('JSON');
  });

  it('uses known defaults for DeepSeek V4 and downgrades to compact generation for small output budgets', () => {
    expect(knownModelCapability('deepseek-v4-pro')).toMatchObject({ jsonOutput: true, contextTokens: 1_000_000, maxOutputTokens: 393_216 });
    const profile = createAiProviderProfile({
      label: 'Small output',
      baseUrl: 'https://api.example.com',
      model: 'compact-model',
      modelCapabilities: { 'compact-model': { jsonOutput: true, contextTokens: 64_000, maxOutputTokens: 20_000, source: 'user' } },
    });
    const decision = reportCapabilityDecision(profile);
    expect(decision.allowed).toBe(true);
    if (decision.allowed) expect(decision.compact).toBe(true);
  });
});
