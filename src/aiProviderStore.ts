import { sanitizeProviderProfile, type AiProviderProfile } from './domain/aiProvider';

const PROFILES_KEY = 'luma-ai-provider-profiles-v1';
const ACTIVE_KEY = 'luma-ai-active-provider-id';

export function loadStoredAiProfiles(): AiProviderProfile[] {
  try {
    const raw = localStorage.getItem(PROFILES_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    return Array.isArray(parsed)
      ? parsed.map(sanitizeProviderProfile).filter((item): item is AiProviderProfile => item !== null)
      : [];
  } catch {
    return [];
  }
}

export function saveStoredAiProfiles(profiles: AiProviderProfile[]) {
  localStorage.setItem(PROFILES_KEY, JSON.stringify(profiles));
}

export function loadStoredActiveProviderId(): string {
  return localStorage.getItem(ACTIVE_KEY) ?? '';
}

export function saveStoredActiveProviderId(id: string) {
  if (id) localStorage.setItem(ACTIVE_KEY, id);
  else localStorage.removeItem(ACTIVE_KEY);
}
