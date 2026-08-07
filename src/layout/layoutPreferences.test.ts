import { describe, expect, it } from 'vitest';
import {
  applyLayoutPreset, createDefaultLayoutPreferences, loadLayoutPreferences, normalizeLayoutPreferences,
} from './layoutPreferences';

function memoryStorage(initial: Record<string, string> = {}) {
  const values = new Map(Object.entries(initial));
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => { values.set(key, value); },
    removeItem: (key: string) => { values.delete(key); },
  };
}

describe('layout preferences', () => {
  it('falls back from an unknown version and clamps malformed values', () => {
    const defaults = createDefaultLayoutPreferences(1440);
    expect(normalizeLayoutPreferences({ version: 7 }, 1440).desktop).toEqual(defaults.desktop);
    expect(normalizeLayoutPreferences({ version: 7 }, 1440).tablet).toEqual(defaults.tablet);
    const result = normalizeLayoutPreferences({
      version: 1,
      desktop: { libraryRatio: 99, keywordRatio: -1, transcriptRatio: 0, collapsed: { library: true } },
      tablet: { libraryRatio: 0, keywordCollapsed: true },
    }, 1440);
    expect(result.desktop.libraryRatio).toBe(.5);
    expect(result.desktop.keywordRatio).toBe(.18);
    expect(result.desktop.transcriptRatio).toBe(.42);
    expect(result.desktop.collapsed).toEqual({ library: true, keywords: false, highlights: false });
    expect(result.tablet.libraryRatio).toBe(.24);
    expect(result.tablet.keywordCollapsed).toBe(true);
  });

  it('loads corrupt storage without blocking the app', () => {
    const storage = memoryStorage({ 'luma-layout-preferences-v1': '{bad json' });
    expect(loadLayoutPreferences(storage, 1024).desktop.collapsed.library).toBe(false);
    expect(loadLayoutPreferences(null, 1024).tablet.libraryRatio).toBeGreaterThan(0);
  });

  it('applies presets without touching the storage contract', () => {
    const current = createDefaultLayoutPreferences(1440);
    const reading = applyLayoutPreset(current, 'reading', 1440);
    const library = applyLayoutPreset(current, 'library', 1440);
    expect(reading.desktop.libraryRatio).toBe(.18);
    expect(reading.desktop.keywordRatio).toBe(.21);
    expect(library.desktop.libraryRatio).toBe(.32);
    expect(reading.desktop.collapsed).toEqual({ library: false, keywords: false, highlights: false });
    expect(reading.version).toBe(1);
  });
});
