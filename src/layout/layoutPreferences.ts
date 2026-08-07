export const LAYOUT_STORAGE_KEY = 'luma-layout-preferences-v1';

export type LayoutPreset = 'balanced' | 'reading' | 'library';
export type LayoutBreakpoint = 'desktop' | 'tablet' | 'mobile';

export type LayoutPreferences = {
  version: 1;
  desktop: {
    libraryRatio: number;
    keywordRatio: number;
    transcriptRatio: number;
    collapsed: { library: boolean; keywords: boolean; highlights: boolean };
  };
  tablet: {
    libraryRatio: number;
    keywordCollapsed: boolean;
  };
  updatedAt: string;
};

type LayoutStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));
const finiteNumber = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
const booleanValue = (value: unknown, fallback: boolean) => typeof value === 'boolean' ? value : fallback;

export function getLayoutBreakpoint(width: number): LayoutBreakpoint {
  if (width < 768) return 'mobile';
  if (width < 1100) return 'tablet';
  return 'desktop';
}

export function createDefaultLayoutPreferences(viewportWidth = 1440, now = new Date().toISOString()): LayoutPreferences {
  return {
    version: 1,
    desktop: {
      libraryRatio: clamp(300 / Math.max(viewportWidth, 1), .17, .34),
      keywordRatio: .26,
      transcriptRatio: .65,
      collapsed: { library: false, keywords: false, highlights: false },
    },
    tablet: {
      libraryRatio: clamp(280 / Math.max(viewportWidth, 1), .28, .42),
      keywordCollapsed: false,
    },
    updatedAt: now,
  };
}

export function normalizeLayoutPreferences(value: unknown, viewportWidth = 1440): LayoutPreferences {
  const fallback = createDefaultLayoutPreferences(viewportWidth);
  if (!value || typeof value !== 'object' || (value as { version?: unknown }).version !== 1) return fallback;

  const candidate = value as Partial<LayoutPreferences>;
  const desktop = candidate.desktop && typeof candidate.desktop === 'object' ? candidate.desktop : fallback.desktop;
  const tablet = candidate.tablet && typeof candidate.tablet === 'object' ? candidate.tablet : fallback.tablet;
  const collapsed = desktop.collapsed && typeof desktop.collapsed === 'object' ? desktop.collapsed : fallback.desktop.collapsed;

  return {
    version: 1,
    desktop: {
      libraryRatio: clamp(finiteNumber(desktop.libraryRatio, fallback.desktop.libraryRatio), .12, .5),
      keywordRatio: clamp(finiteNumber(desktop.keywordRatio, fallback.desktop.keywordRatio), .18, .44),
      transcriptRatio: clamp(finiteNumber(desktop.transcriptRatio, fallback.desktop.transcriptRatio), .42, .78),
      collapsed: {
        library: booleanValue(collapsed.library, false),
        keywords: booleanValue(collapsed.keywords, false),
        highlights: booleanValue(collapsed.highlights, false),
      },
    },
    tablet: {
      libraryRatio: clamp(finiteNumber(tablet.libraryRatio, fallback.tablet.libraryRatio), .24, .48),
      keywordCollapsed: booleanValue(tablet.keywordCollapsed, false),
    },
    updatedAt: typeof candidate.updatedAt === 'string' && candidate.updatedAt ? candidate.updatedAt : fallback.updatedAt,
  };
}

function browserStorage(): LayoutStorage | null {
  try {
    return typeof window === 'undefined' ? null : window.localStorage;
  } catch {
    return null;
  }
}

export function loadLayoutPreferences(storage: LayoutStorage | null = browserStorage(), viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth): LayoutPreferences {
  if (!storage) return createDefaultLayoutPreferences(viewportWidth);
  try {
    const stored = storage.getItem(LAYOUT_STORAGE_KEY);
    return stored ? normalizeLayoutPreferences(JSON.parse(stored), viewportWidth) : createDefaultLayoutPreferences(viewportWidth);
  } catch {
    return createDefaultLayoutPreferences(viewportWidth);
  }
}

export function saveLayoutPreferences(preferences: LayoutPreferences, storage: LayoutStorage | null = browserStorage()) {
  if (!storage) return;
  try {
    storage.setItem(LAYOUT_STORAGE_KEY, JSON.stringify(normalizeLayoutPreferences(preferences)));
  } catch {
    // Layout preferences are optional and must never block the learning workflow.
  }
}

export function resetLayoutPreferences(storage: LayoutStorage | null = browserStorage(), viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth) {
  const next = createDefaultLayoutPreferences(viewportWidth);
  try {
    storage?.removeItem(LAYOUT_STORAGE_KEY);
  } catch {
    // A restricted storage environment still receives the in-memory defaults.
  }
  return next;
}

export function applyLayoutPreset(current: LayoutPreferences, preset: LayoutPreset, viewportWidth = typeof window === 'undefined' ? 1440 : window.innerWidth): LayoutPreferences {
  const defaults = createDefaultLayoutPreferences(viewportWidth);
  const values = preset === 'reading'
    ? { libraryRatio: .18, keywordRatio: .21, transcriptRatio: .54 }
    : preset === 'library'
      ? { libraryRatio: .32, keywordRatio: .26, transcriptRatio: .65 }
      : { libraryRatio: defaults.desktop.libraryRatio, keywordRatio: .26, transcriptRatio: .65 };

  return {
    ...current,
    desktop: {
      ...current.desktop,
      ...values,
      collapsed: { library: false, keywords: false, highlights: false },
    },
    tablet: {
      libraryRatio: preset === 'library' ? .42 : preset === 'reading' ? .28 : defaults.tablet.libraryRatio,
      keywordCollapsed: false,
    },
    updatedAt: new Date().toISOString(),
  };
}
