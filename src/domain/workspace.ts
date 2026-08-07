import {
  episodeExternalKeys, extractYouTubeVideoId, normalizeExternalId, normalizeExternalVideoSource, sourceKeys, sourcesToLinks,
  type Episode, type ExternalVideoSource, type Highlight, type LegacyRecall, type StudyAttempt,
} from './learning';
import type { StoredLearningReport } from './report';
import type { AiConversationEntry } from './aiStudy';
import type { QuestionLedgerEntry, StoredAiAssistantReport } from './aiReport';

export type Theme = 'light' | 'dark' | 'system';
export type MetadataOverride = { title?: string; publishedDate?: string };
export type LinkOverride = {
  youtubeUrl?: string | null;
  bilibiliUrl?: string | null;
  sources?: ExternalVideoSource[];
  updatedAt?: string;
};
export type TranscriptOverride = { englishTranscript: string; chineseTranscript: string };
export type Completion = { completedAt: string };
export const LEGACY_AI_CONVERSATION_KEY = '__legacy__';

export type WorkspaceState = {
  schemaVersion: 6;
  customVideos: Episode[];
  studyAttempts: Record<string, StudyAttempt[]>;
  activeAttemptIds: Record<string, string>;
  legacyRecalls: Record<string, LegacyRecall>;
  metadataOverrides: Record<string, MetadataOverride>;
  linkOverrides?: Record<string, LinkOverride>;
  hiddenEpisodeIds?: string[];
  transcriptOverrides: Record<string, TranscriptOverride>;
  highlights: Highlight[];
  completions: Record<string, Completion>;
  reports: StoredLearningReport[];
  aiReports: StoredAiAssistantReport[];
  activeSessions: Record<string, string>;
  aiConversations: Record<string, AiConversationEntry[]>;
  episodeAliases?: Record<string, string>;
  episodeAliasHistory?: Record<string, string[]>;
  episodeKeywords?: Record<string, string[]>;
  questionLedgers?: Record<string, QuestionLedgerEntry[]>;
  preferences: { theme: Theme };
};

export const emptyWorkspace: WorkspaceState = {
  schemaVersion: 6,
  customVideos: [],
  studyAttempts: {},
  activeAttemptIds: {},
  legacyRecalls: {},
  metadataOverrides: {},
  linkOverrides: {},
  hiddenEpisodeIds: [],
  transcriptOverrides: {},
  highlights: [],
  completions: {},
  reports: [],
  aiReports: [],
  activeSessions: {},
  aiConversations: {},
  episodeAliases: {},
  episodeAliasHistory: {},
  episodeKeywords: {},
  questionLedgers: {},
  preferences: { theme: 'system' },
};

export function episodeAliasIndex(episodes: Episode[]) {
  const aliases: Record<string, string> = {};
  const history: Record<string, string[]> = {};
  for (const episode of episodes) {
    const keys = episodeExternalKeys(episode);
    history[episode.id] = keys;
    for (const key of keys) aliases[key] = episode.id;
  }
  return { aliases, history };
}

function remapRecord(record: Record<string, unknown>, mapId: (id: string) => string) {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(record)) next[mapId(key)] = value;
  return next;
}

export function migrateEpisodeIdentity(workspace: WorkspaceState, episodes: Episode[]): WorkspaceState {
  const currentIds = new Set(episodes.map((episode) => episode.id));
  const currentIndex = episodeAliasIndex(episodes);
  const aliases = { ...(workspace.episodeAliases ?? {}), ...currentIndex.aliases };
  const history = { ...(workspace.episodeAliasHistory ?? {}), ...currentIndex.history };
  const oldToNew = new Map<string, string>();
  for (const [oldId, keys] of Object.entries(history)) {
    if (currentIds.has(oldId)) continue;
    for (const key of keys) {
      const next = aliases[key];
      if (next && next !== oldId && currentIds.has(next)) {
        oldToNew.set(oldId, next);
        break;
      }
    }
  }
  const mapId = (id: string) => oldToNew.get(id) ?? id;
  const migratedAliases: Record<string, string> = {};
  for (const [key, value] of Object.entries(aliases)) migratedAliases[key] = mapId(value);
  const migratedHistory: Record<string, string[]> = {};
  for (const [id, keys] of Object.entries(history)) {
    const migratedId = mapId(id);
    migratedHistory[id] = [...new Set([...(migratedHistory[id] ?? []), ...keys])];
    migratedHistory[migratedId] = [...new Set([...(migratedHistory[migratedId] ?? []), ...keys])];
  }
  if (!oldToNew.size) return { ...workspace, episodeAliases: migratedAliases, episodeAliasHistory: migratedHistory };

  const studyAttempts: WorkspaceState['studyAttempts'] = {};
  for (const [id, attempts] of Object.entries(workspace.studyAttempts)) {
    studyAttempts[mapId(id)] = attempts.map((attempt) => ({ ...attempt, episodeId: mapId(attempt.episodeId) }));
  }
  const reports = workspace.reports.map((item) => {
    const nextEpisodeId = mapId(item.episodeId);
    return nextEpisodeId === item.episodeId ? item : { ...item, episodeId: nextEpisodeId, report: { ...item.report, episodeId: nextEpisodeId } };
  });
  const aiReports = workspace.aiReports.map((item) => {
    const nextEpisodeId = mapId(item.episodeId);
    return nextEpisodeId === item.episodeId ? item : { ...item, episodeId: nextEpisodeId, report: { ...item.report, episodeId: nextEpisodeId } };
  });
  const aiConversations: WorkspaceState['aiConversations'] = {};
  for (const [id, conversation] of Object.entries(workspace.aiConversations)) aiConversations[mapId(id)] = conversation;
  const questionLedgers: WorkspaceState['questionLedgers'] = {};
  for (const [id, ledger] of Object.entries(workspace.questionLedgers ?? {})) questionLedgers[mapId(id)] = ledger;
  const episodeKeywords: WorkspaceState['episodeKeywords'] = {};
  for (const [id, keywords] of Object.entries(workspace.episodeKeywords ?? {})) episodeKeywords[mapId(id)] = keywords;
  const highlights = workspace.highlights.map((item) => ({ ...item, episodeId: mapId(item.episodeId) }));
  const customVideos = workspace.customVideos.map((episode) => ({ ...episode, id: mapId(episode.id) }));

  return {
    ...workspace,
    customVideos,
    studyAttempts,
    activeAttemptIds: remapRecord(workspace.activeAttemptIds, mapId) as WorkspaceState['activeAttemptIds'],
    legacyRecalls: remapRecord(workspace.legacyRecalls, mapId) as WorkspaceState['legacyRecalls'],
    metadataOverrides: remapRecord(workspace.metadataOverrides, mapId) as WorkspaceState['metadataOverrides'],
    linkOverrides: workspace.linkOverrides ? remapRecord(workspace.linkOverrides, mapId) as WorkspaceState['linkOverrides'] : undefined,
    hiddenEpisodeIds: (workspace.hiddenEpisodeIds ?? []).map(mapId),
    transcriptOverrides: remapRecord(workspace.transcriptOverrides, mapId) as WorkspaceState['transcriptOverrides'],
    highlights,
    completions: remapRecord(workspace.completions, mapId) as WorkspaceState['completions'],
    reports,
    aiReports,
    activeSessions: remapRecord(workspace.activeSessions, mapId) as WorkspaceState['activeSessions'],
    aiConversations,
    episodeAliases: migratedAliases,
    episodeAliasHistory: migratedHistory,
    episodeKeywords,
    questionLedgers,
  };
}

export function findEpisodeByExternalKeys(episodes: Episode[], workspace: WorkspaceState, keys: string[]) {
  const normalized = keys.map(normalizeExternalId).filter(Boolean);
  for (const key of normalized) {
    const id = workspace.episodeAliases?.[key];
    if (id) {
      const episode = episodes.find((item) => item.id === id);
      if (episode) return episode;
    }
  }
  for (const episode of episodes) {
    const episodeKeys = episodeExternalKeys(episode);
    if (normalized.some((key) => episodeKeys.includes(key))) return episode;
  }
  return null;
}

export function effectiveEpisode(episode: Episode, override?: MetadataOverride, linkOverride?: LinkOverride): Episode {
  const withMetadata = { ...episode, title: override?.title?.trim() || episode.title, publishedDate: override?.publishedDate || episode.publishedDate };
  if (!linkOverride) return withMetadata;
  const overrideSources = (linkOverride.sources ?? []).map(normalizeExternalVideoSource).filter((item): item is ExternalVideoSource => item !== null);
  const genericOverride = linkOverride.sources !== undefined;
  const legacyYoutubeUrl = linkOverride.youtubeUrl !== undefined ? (linkOverride.youtubeUrl ?? '') : episode.youtube.url ?? '';
  const legacyBilibiliUrl = linkOverride.bilibiliUrl !== undefined ? (linkOverride.bilibiliUrl ?? '') : episode.bilibili.url;
  const links = genericOverride
    ? (overrideSources.length ? sourcesToLinks(overrideSources) : { youtubeUrl: '', bilibiliUrl: '', youtubeVideoId: null })
    : {
      youtubeUrl: legacyYoutubeUrl,
      bilibiliUrl: legacyBilibiliUrl,
      youtubeVideoId: legacyYoutubeUrl ? extractYouTubeVideoId(legacyYoutubeUrl) : null,
    };
  const youtubeUrl = links.youtubeUrl || null;
  const bilibiliUrl = links.bilibiliUrl;
  const youtubeVideoId = links.youtubeVideoId;
  return {
    ...withMetadata,
    thumbnailUrl: youtubeVideoId ? `https://i.ytimg.com/vi/${youtubeVideoId}/hqdefault.jpg` : withMetadata.thumbnailUrl ?? null,
    ...(genericOverride ? { sources: overrideSources.length ? overrideSources : undefined, externalKeys: overrideSources.length ? sourceKeys(overrideSources) : undefined } : {}),
    youtube: {
      ...withMetadata.youtube,
      url: youtubeUrl,
      videoId: youtubeVideoId,
      status: youtubeUrl ? 'user-provided' : 'unverified',
      verification: youtubeUrl ? 'user-provided' : 'not-provided',
    },
    bilibili: { ...withMetadata.bilibili, url: bilibiliUrl ?? '', status: bilibiliUrl ? 'user-provided' : 'not-provided' },
  };
}

function hasWorkspaceFields(item: Partial<WorkspaceState>) {
  return Array.isArray(item.customVideos)
    && !!item.studyAttempts && typeof item.studyAttempts === 'object'
    && !!item.activeAttemptIds && typeof item.activeAttemptIds === 'object'
    && !!item.legacyRecalls && typeof item.legacyRecalls === 'object'
    && !!item.metadataOverrides && typeof item.metadataOverrides === 'object'
    && !!item.transcriptOverrides && typeof item.transcriptOverrides === 'object'
    && Array.isArray(item.highlights)
    && !!item.completions && typeof item.completions === 'object'
    && Array.isArray(item.reports)
    && !!item.activeSessions && typeof item.activeSessions === 'object'
    && !!item.preferences && ['light', 'dark', 'system'].includes(item.preferences.theme ?? '');
}

function isAiConversation(value: unknown): value is AiConversationEntry[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Partial<AiConversationEntry>;
    return typeof item.id === 'string' && !!item.id
      && (item.role === 'user' || item.role === 'assistant')
      && typeof item.content === 'string' && !!item.content.trim()
      && (item.kind === 'conversation' || item.kind === 'status' || item.kind === 'live-practice' || item.kind === 'ai-report')
      && typeof item.createdAt === 'string' && !!item.createdAt;
  });
}

function isAiConversations(value: unknown): value is Record<string, AiConversationEntry[]> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && Object.entries(value as Record<string, unknown>).every(([episodeId, conversation]) => !!episodeId && isAiConversation(conversation));
}

function isAiReports(value: unknown): value is StoredAiAssistantReport[] {
  return Array.isArray(value) && value.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const item = entry as Partial<StoredAiAssistantReport>;
    return typeof item.episodeId === 'string' && !!item.episodeId
      && typeof item.importedAt === 'string' && !!item.importedAt
      && typeof item.updatedAt === 'string' && !!item.updatedAt
      && typeof item.fingerprint === 'string' && !!item.fingerprint
      && !!item.report && typeof item.report === 'object';
  });
}

export function isWorkspaceState(value: unknown): value is WorkspaceState {
  if (!value || typeof value !== 'object') return false;
  const item = value as Partial<WorkspaceState>;
  return item.schemaVersion === 6 && hasWorkspaceFields(item) && isAiConversations(item.aiConversations) && isAiReports(item.aiReports);
}

function migratedConversations(value: AiConversationEntry[]): Record<string, AiConversationEntry[]> {
  return value.length ? { [LEGACY_AI_CONVERSATION_KEY]: value } : {};
}

type WorkspaceV5 = Omit<WorkspaceState, 'schemaVersion' | 'aiConversations'> & {
  schemaVersion: 5;
  aiConversation: AiConversationEntry[];
};

type WorkspaceV4 = Omit<WorkspaceState, 'schemaVersion' | 'aiConversations' | 'aiReports'> & {
  schemaVersion: 4;
  aiConversation: AiConversationEntry[];
};

type WorkspaceV3 = Omit<WorkspaceState, 'schemaVersion' | 'aiConversations' | 'aiReports'> & {
  schemaVersion: 3;
};

export function migrateWorkspace(value: unknown): WorkspaceState | null {
  if (isWorkspaceState(value)) return value;
  if (!value || typeof value !== 'object') return null;
  const legacy = value as Record<string, unknown>;
  if (legacy.schemaVersion === 5 && hasWorkspaceFields(legacy as Partial<WorkspaceState>) && isAiConversation(legacy.aiConversation) && isAiReports(legacy.aiReports)) {
    const { aiConversation, ...version5 } = legacy as unknown as WorkspaceV5;
    return { ...version5, schemaVersion: 6, aiConversations: migratedConversations(aiConversation), linkOverrides: (version5 as unknown as WorkspaceState).linkOverrides ?? {}, hiddenEpisodeIds: (version5 as unknown as WorkspaceState).hiddenEpisodeIds ?? [], episodeAliases: {}, episodeAliasHistory: {}, episodeKeywords: {}, questionLedgers: {} };
  }
  if (legacy.schemaVersion === 4 && hasWorkspaceFields(legacy as Partial<WorkspaceState>) && isAiConversation(legacy.aiConversation)) {
    const { aiConversation, ...version4 } = legacy as unknown as WorkspaceV4;
    return { ...version4, schemaVersion: 6, aiReports: [], aiConversations: migratedConversations(aiConversation), linkOverrides: (version4 as unknown as WorkspaceState).linkOverrides ?? {}, hiddenEpisodeIds: (version4 as unknown as WorkspaceState).hiddenEpisodeIds ?? [], episodeAliases: {}, episodeAliasHistory: {}, episodeKeywords: {}, questionLedgers: {} };
  }
  if (legacy.schemaVersion === 3 && hasWorkspaceFields(legacy as Partial<WorkspaceState>)) {
    const { aiConversation: _unused, ...version3 } = legacy as unknown as WorkspaceV3 & { aiConversation?: unknown };
    return { ...version3, schemaVersion: 6, aiConversations: {}, aiReports: [], linkOverrides: (version3 as unknown as WorkspaceState).linkOverrides ?? {}, hiddenEpisodeIds: (version3 as unknown as WorkspaceState).hiddenEpisodeIds ?? [], episodeAliases: {}, episodeAliasHistory: {}, episodeKeywords: {}, questionLedgers: {} };
  }
  if (legacy.schemaVersion !== 1 && legacy.schemaVersion !== 2) return null;
  if (!Array.isArray(legacy.customVideos) || !legacy.recalls || !legacy.metadataOverrides || !legacy.transcriptOverrides || !Array.isArray(legacy.highlights) || !legacy.completions || !legacy.preferences) return null;
  return {
    schemaVersion: 6,
    customVideos: legacy.customVideos as Episode[],
    studyAttempts: {},
    activeAttemptIds: {},
    legacyRecalls: legacy.recalls as Record<string, LegacyRecall>,
    metadataOverrides: legacy.metadataOverrides as Record<string, MetadataOverride>,
    linkOverrides: {},
    hiddenEpisodeIds: [],
    transcriptOverrides: legacy.transcriptOverrides as Record<string, TranscriptOverride>,
    highlights: legacy.highlights as Highlight[],
    completions: legacy.completions as Record<string, Completion>,
    reports: Array.isArray(legacy.reports) ? legacy.reports as StoredLearningReport[] : [],
    aiReports: [],
    activeSessions: legacy.activeSessions && typeof legacy.activeSessions === 'object' ? legacy.activeSessions as Record<string, string> : {},
    aiConversations: {},
    episodeAliases: {},
    episodeAliasHistory: {},
    episodeKeywords: {},
    questionLedgers: {},
    preferences: legacy.preferences as { theme: Theme },
  };
}

function localDate(value: string | Date) {
  const date = typeof value === 'string' ? new Date(value) : value;
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export type ProgressStats = {
  completed: number;
  totalMinutes: number;
  videoMinutes: number;
  gptSessions: number;
  gptMinutes: number;
  unknownDurationSessions: number;
  latestReportDate: string | null;
  todayCount: number;
  streak: number;
  longestStreak: number;
  studyDays: number;
  weekCount: number;
  weekMinutes: number;
  bestWeek: number;
  sevenDays: Array<{ date: string; videoMinutes: number; gptMinutes: number; count: number; gptSessions: number }>;
  heatmap: Array<{ date: string; count: number }>;
};

export function calculateProgress(episodes: Episode[], completions: Record<string, Completion>, reports: StoredLearningReport[] = [], now = new Date()): ProgressStats {
  const episodeById = new Map(episodes.map((episode) => [episode.id, episode]));
  const events = Object.entries(completions).map(([id, item]) => ({ id, date: localDate(item.completedAt), duration: episodeById.get(id)?.durationSeconds ?? 0 }));
  const byDay = new Map<string, { count: number; videoMinutes: number; gptSessions: number; gptMinutes: number }>();
  for (const event of events) {
    const current = byDay.get(event.date) ?? { count: 0, videoMinutes: 0, gptSessions: 0, gptMinutes: 0 };
    current.count += 1;
    current.videoMinutes += event.duration / 60;
    byDay.set(event.date, current);
  }
  for (const stored of reports) {
    const current = byDay.get(stored.sessionDate) ?? { count: 0, videoMinutes: 0, gptSessions: 0, gptMinutes: 0 };
    current.gptSessions += 1;
    current.gptMinutes += stored.durationMinutes ?? 0;
    byDay.set(stored.sessionDate, current);
  }
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  const dayAt = (offset: number) => { const date = new Date(today); date.setDate(date.getDate() + offset); return localDate(date); };
  const sevenDays = Array.from({ length: 7 }, (_, index) => {
    const date = dayAt(index - 6); const day = byDay.get(date); return { date, videoMinutes: Math.round(day?.videoMinutes ?? 0), gptMinutes: day?.gptMinutes ?? 0, count: day?.count ?? 0, gptSessions: day?.gptSessions ?? 0 };
  });
  const heatmap = Array.from({ length: 84 }, (_, index) => {
    const date = dayAt(index - 83); const day = byDay.get(date); return { date, count: (day?.count ?? 0) + (day?.gptSessions ?? 0) };
  });
  const activeDates = [...byDay.keys()].sort();
  let longestStreak = 0;
  let running = 0;
  let previous = '';
  for (const date of activeDates) {
    const expected = previous ? new Date(`${previous}T12:00:00`) : null;
    if (expected) expected.setDate(expected.getDate() + 1);
    running = expected && localDate(expected) === date ? running + 1 : 1;
    longestStreak = Math.max(longestStreak, running);
    previous = date;
  }
  let streak = 0;
  const startOffset = byDay.has(dayAt(0)) ? 0 : -1;
  for (let offset = startOffset; byDay.has(dayAt(offset)); offset -= 1) streak += 1;
  const weekStart = new Date(today); weekStart.setDate(today.getDate() - ((today.getDay() + 6) % 7));
  const weekDates = Array.from({ length: 7 }, (_, index) => { const date = new Date(weekStart); date.setDate(date.getDate() + index); return localDate(date); });
  const weekCount = weekDates.reduce((sum, date) => sum + (byDay.get(date)?.count ?? 0), 0);
  const weekMinutes = Math.round(weekDates.reduce((sum, date) => sum + (byDay.get(date)?.videoMinutes ?? 0), 0));
  const weekly = new Map<string, number>();
  for (const event of events) {
    const date = new Date(`${event.date}T12:00:00`); date.setDate(date.getDate() - ((date.getDay() + 6) % 7));
    const key = localDate(date); weekly.set(key, (weekly.get(key) ?? 0) + 1);
  }
  return {
    completed: events.length,
    totalMinutes: Math.round(events.reduce((sum, event) => sum + event.duration / 60, 0)),
    videoMinutes: Math.round(events.reduce((sum, event) => sum + event.duration / 60, 0)),
    gptSessions: reports.length,
    gptMinutes: reports.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0),
    unknownDurationSessions: reports.filter((item) => item.durationMinutes === null).length,
    latestReportDate: reports.length ? [...reports].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0].sessionDate : null,
    todayCount: byDay.get(dayAt(0))?.count ?? 0,
    streak,
    longestStreak,
    studyDays: byDay.size,
    weekCount,
    weekMinutes,
    bestWeek: Math.max(0, ...weekly.values()),
    sevenDays,
    heatmap,
  };
}
