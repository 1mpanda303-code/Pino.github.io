import {
  aiReportFingerprint, createStoredAiReport, validateAiAssistantReport,
  type AiAssistantReport, type ContentFormId, type InformationDensity, type QuestionDepth, type QuestionKind,
  type QuestionLedgerEntry, type QuestionLedgerStage, type QuestionLedgerStatus, type SubtitleDifficulty, type TopicId, type TranscriptSource,
} from './aiReport';
import {
  createCustomVideo, createStudyAttempt, normalizeExternalId, normalizeExternalVideoSource, sourceKeys,
  type Episode, type ExternalVideoSource, type Highlight, type HighlightType, type StudyAttempt,
} from './learning';
import { createStoredReport, reportFingerprint, validateLearningReport, type LearningReportV1 } from './report';
import { episodeAliasIndex, findEpisodeByExternalKeys, type WorkspaceState } from './workspace';

export const LEARNING_RETURN_PACKAGE_SCHEMA = 'luma-learning-return-package/v1' as const;

export type ReturnTranscriptSource = TranscriptSource;

export type ReturnAttemptData = {
  createdAt: string;
  passes: StudyAttempt['passes'];
  recall: StudyAttempt['recall'];
};

export type LearningReturnPackage = {
  schemaVersion: typeof LEARNING_RETURN_PACKAGE_SCHEMA;
  packageType: 'learning-return';
  video: {
    episodeId: string | null;
    title: string;
    publishedDate: string;
    durationSeconds: number | null;
    sources: ExternalVideoSource[];
  };
  transcript: {
    english: string;
    chinese: string;
    source: ReturnTranscriptSource;
  };
  keywords: string[];
  highlights: Array<Pick<Highlight, 'language' | 'type' | 'quote' | 'note'>>;
  questionLedger: QuestionLedgerEntry[];
  classification: {
    primaryTopic: TopicId;
    contentForm: ContentFormId;
    subtitleDifficulty: SubtitleDifficulty;
    informationDensity: InformationDensity;
  };
  attempt: ReturnAttemptData;
  aiReports: AiAssistantReport[];
  liveReports: LearningReportV1[];
  meta: {
    generatedBy: string;
    returnedAt: string;
    notes: string;
  };
};

export type ReturnPackageValidation = { valid: true; package: LearningReturnPackage; warnings: string[] } | { valid: false; errors: string[] };

const returnPackageKeys = ['schemaVersion', 'packageType', 'video', 'transcript', 'keywords', 'highlights', 'questionLedger', 'classification', 'attempt', 'aiReports', 'liveReports', 'meta'];
const videoKeys = ['episodeId', 'title', 'publishedDate', 'durationSeconds', 'sources'];
const transcriptKeys = ['english', 'chinese', 'source'];
const highlightKeys = ['language', 'type', 'quote', 'note'];
const ledgerKeys = ['questionKey', 'label', 'kind', 'depth', 'question', 'answerSummary', 'sourceQuote', 'stage', 'status'];
const classificationKeys = ['primaryTopic', 'contentForm', 'subtitleDifficulty', 'informationDensity'];
const attemptKeys = ['createdAt', 'passes', 'recall'];
const audioKeys = ['completedAt', 'comprehension', 'captured', 'fragments'];
const visualKeys = ['completedAt', 'comprehension', 'visualHelp', 'confirmed', 'gistGuess'];
const transcriptStudyKeys = ['completedAt', 'reviewConfirmed', 'transcriptCoverage', 'replayedWithoutCaptions', 'postReplayComprehension'];
const recallKeys = ['mode', 'oralCompleted', 'retelling', 'gist', 'outline', 'checks', 'independence', 'completedAt'];
const metaKeys = ['generatedBy', 'returnedAt', 'notes'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function objectAt(value: unknown, path: string, errors: string[]) {
  if (!isRecord(value)) { errors.push(`${path} 必须是对象。`); return null; }
  return value;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} 是契约外字段。`);
}

function requiredString(value: unknown, path: string, errors: string[], max = 1200) {
  if (typeof value !== 'string' || !value.trim()) { errors.push(`${path} 必须是非空字符串。`); return ''; }
  if (value.length > max) errors.push(`${path} 不能超过 ${max} 个字符。`);
  return value.trim();
}

function optionalString(value: unknown, path: string, errors: string[], max = 1200) {
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') { errors.push(`${path} 必须是字符串。`); return ''; }
  if (value.length > max) errors.push(`${path} 不能超过 ${max} 个字符。`);
  return value.trim();
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) { errors.push(`${path} 必须是 ${allowed.join(' / ')} 之一。`); return allowed[0]; }
  return value as T;
}

function enumNumber<T extends number>(value: unknown, allowed: readonly T[], path: string, errors: string[]) {
  if (typeof value !== 'number' || !(allowed as readonly number[]).includes(value)) { errors.push(`${path} 必须是 ${allowed.join(' / ')} 之一。`); return allowed[0]; }
  return value as T;
}

function booleanValue(value: unknown, path: string, errors: string[], fallback = false) {
  if (typeof value !== 'boolean') { errors.push(`${path} 必须是布尔值。`); return fallback; }
  return value;
}

function nullableInt(value: unknown, path: string, errors: string[], max = 1_000_000) {
  if (value === null || value === undefined) return null;
  const number = Number(value);
  if (!Number.isInteger(number) || number < 0 || number > max) { errors.push(`${path} 必须是 0-${max} 的整数或 null。`); return null; }
  return number;
}

function stringArray(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) { errors.push(`${path} 必须是字符串数组。`); return []; }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`, errors, 300)).filter(Boolean);
}

const comprehensionValues = [1, 2, 3, 4, 5] as const;
const audioCaptures = ['almost-nothing', 'words', 'phrases', 'topic', 'gist', 'details'] as const;
const visualConfirmations = ['actors', 'setting', 'topic', 'cause', 'example', 'conclusion'] as const;
const visualHelpValues = ['none', 'some', 'strong'] as const;
const coverageValues = ['none', 'partial', 'complete'] as const;
const recallChecks = ['gist', 'sequence', 'detail', 'relationship'] as const;
const independenceValues = ['not-yet', 'with-outline', 'independent'] as const;

function normalizeAttempt(value: unknown, path: string, errors: string[]): ReturnAttemptData | null {
  const object = objectAt(value, path, errors);
  if (!object) return null;
  exactKeys(object, attemptKeys, path, errors);
  const createdAt = optionalString(object.createdAt, `${path}.createdAt`, errors, 40) || new Date().toISOString();
  const passesObject = objectAt(object.passes, `${path}.passes`, errors) ?? {};
  exactKeys(passesObject, ['audioOnly', 'visualNoCaptions', 'transcriptStudy'], `${path}.passes`, errors);
  const audioObject = objectAt(passesObject.audioOnly, `${path}.passes.audioOnly`, errors) ?? {};
  exactKeys(audioObject, audioKeys, `${path}.passes.audioOnly`, errors);
  const visualObject = objectAt(passesObject.visualNoCaptions, `${path}.passes.visualNoCaptions`, errors) ?? {};
  exactKeys(visualObject, visualKeys, `${path}.passes.visualNoCaptions`, errors);
  const studyObject = objectAt(passesObject.transcriptStudy, `${path}.passes.transcriptStudy`, errors) ?? {};
  exactKeys(studyObject, transcriptStudyKeys, `${path}.passes.transcriptStudy`, errors);
  const recallObject = objectAt(object.recall, `${path}.recall`, errors) ?? {};
  exactKeys(recallObject, recallKeys, `${path}.recall`, errors);
  return {
    createdAt,
    passes: {
      audioOnly: {
        completedAt: optionalString(audioObject.completedAt, `${path}.passes.audioOnly.completedAt`, errors, 40) || null,
        comprehension: audioObject.comprehension === null || audioObject.comprehension === undefined ? null : enumNumber(audioObject.comprehension, comprehensionValues, `${path}.passes.audioOnly.comprehension`, errors),
        captured: Array.isArray(audioObject.captured) ? audioObject.captured.map((item, index) => enumValue(item, audioCaptures, `${path}.passes.audioOnly.captured[${index}]`, errors)) : (errors.push(`${path}.passes.audioOnly.captured 必须是数组。`), []),
        fragments: optionalString(audioObject.fragments, `${path}.passes.audioOnly.fragments`, errors, 3000),
      },
      visualNoCaptions: {
        completedAt: optionalString(visualObject.completedAt, `${path}.passes.visualNoCaptions.completedAt`, errors, 40) || null,
        comprehension: visualObject.comprehension === null || visualObject.comprehension === undefined ? null : enumNumber(visualObject.comprehension, comprehensionValues, `${path}.passes.visualNoCaptions.comprehension`, errors),
        visualHelp: visualObject.visualHelp === null || visualObject.visualHelp === undefined ? null : enumValue(visualObject.visualHelp, visualHelpValues, `${path}.passes.visualNoCaptions.visualHelp`, errors),
        confirmed: Array.isArray(visualObject.confirmed) ? visualObject.confirmed.map((item, index) => enumValue(item, visualConfirmations, `${path}.passes.visualNoCaptions.confirmed[${index}]`, errors)) : (errors.push(`${path}.passes.visualNoCaptions.confirmed 必须是数组。`), []),
        gistGuess: optionalString(visualObject.gistGuess, `${path}.passes.visualNoCaptions.gistGuess`, errors, 3000),
      },
      transcriptStudy: {
        completedAt: optionalString(studyObject.completedAt, `${path}.passes.transcriptStudy.completedAt`, errors, 40) || null,
        reviewConfirmed: booleanValue(studyObject.reviewConfirmed, `${path}.passes.transcriptStudy.reviewConfirmed`, errors),
        transcriptCoverage: enumValue(studyObject.transcriptCoverage ?? 'none', coverageValues, `${path}.passes.transcriptStudy.transcriptCoverage`, errors),
        replayedWithoutCaptions: studyObject.replayedWithoutCaptions === null || studyObject.replayedWithoutCaptions === undefined ? null : booleanValue(studyObject.replayedWithoutCaptions, `${path}.passes.transcriptStudy.replayedWithoutCaptions`, errors),
        postReplayComprehension: studyObject.postReplayComprehension === null || studyObject.postReplayComprehension === undefined ? null : enumNumber(studyObject.postReplayComprehension, comprehensionValues, `${path}.passes.transcriptStudy.postReplayComprehension`, errors),
      },
    },
    recall: {
      mode: enumValue(recallObject.mode ?? 'oral', ['oral', 'written'] as const, `${path}.recall.mode`, errors),
      oralCompleted: booleanValue(recallObject.oralCompleted, `${path}.recall.oralCompleted`, errors),
      retelling: optionalString(recallObject.retelling, `${path}.recall.retelling`, errors, 20_000),
      gist: optionalString(recallObject.gist, `${path}.recall.gist`, errors, 3000),
      outline: optionalString(recallObject.outline, `${path}.recall.outline`, errors, 8000),
      checks: Array.isArray(recallObject.checks) ? recallObject.checks.map((item, index) => enumValue(item, recallChecks, `${path}.recall.checks[${index}]`, errors)) : (errors.push(`${path}.recall.checks 必须是数组。`), []),
      independence: recallObject.independence === null || recallObject.independence === undefined ? null : enumValue(recallObject.independence, independenceValues, `${path}.recall.independence`, errors),
      completedAt: optionalString(recallObject.completedAt, `${path}.recall.completedAt`, errors, 40) || null,
    },
  };
}

function normalizeLedger(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) { errors.push(`${path} 必须是数组。`); return []; }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const object = objectAt(item, itemPath, errors) ?? {};
    exactKeys(object, ledgerKeys, itemPath, errors);
    return {
      questionKey: requiredString(object.questionKey, `${itemPath}.questionKey`, errors, 120),
      label: requiredString(object.label, `${itemPath}.label`, errors, 200),
      kind: enumValue(object.kind, ['vocabulary', 'grammar', 'expression', 'comprehension', 'translation', 'other'] as const, `${itemPath}.kind`, errors) as QuestionKind,
      depth: enumValue(object.depth, ['lookup', 'usage', 'analysis', 'comparison', 'transfer'] as const, `${itemPath}.depth`, errors) as QuestionDepth,
      question: requiredString(object.question, `${itemPath}.question`, errors, 1000),
      answerSummary: requiredString(object.answerSummary, `${itemPath}.answerSummary`, errors, 1000),
      sourceQuote: optionalString(object.sourceQuote, `${itemPath}.sourceQuote`, errors, 500),
      stage: enumValue(object.stage ?? 'other', ['preparation', 'audio-only', 'visual-no-captions', 'transcript-study', 'recall', 'live', 'other'] as const, `${itemPath}.stage`, errors) as QuestionLedgerStage,
      status: enumValue(object.status ?? 'open', ['open', 'resolved'] as const, `${itemPath}.status`, errors) as QuestionLedgerStatus,
    };
  });
}

function normalizeHighlights(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) { errors.push(`${path} 必须是数组。`); return []; }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const object = objectAt(item, itemPath, errors) ?? {};
    exactKeys(object, highlightKeys, itemPath, errors);
    return {
      language: enumValue(object.language, ['en', 'zh'] as const, `${itemPath}.language`, errors),
      type: enumValue(object.type, ['key', 'question', 'mastered'] as const, `${itemPath}.type`, errors) as HighlightType,
      quote: requiredString(object.quote, `${itemPath}.quote`, errors, 1000),
      note: optionalString(object.note, `${itemPath}.note`, errors, 2000),
    };
  });
}

export function validateLearningReturnPackage(value: unknown, now = new Date()): ReturnPackageValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const object = objectAt(value, '$', errors);
  if (!object) return { valid: false, errors };
  exactKeys(object, returnPackageKeys, '$', errors);
  const schemaVersion = enumValue(object.schemaVersion, [LEARNING_RETURN_PACKAGE_SCHEMA] as const, '$.schemaVersion', errors);
  const packageType = enumValue(object.packageType, ['learning-return'] as const, '$.packageType', errors);

  const videoObject = objectAt(object.video, '$.video', errors) ?? {};
  exactKeys(videoObject, videoKeys, '$.video', errors);
  const episodeId = typeof videoObject.episodeId === 'string' && videoObject.episodeId.trim() ? videoObject.episodeId.trim().slice(0, 128) : null;
  const video = {
    episodeId,
    title: requiredString(videoObject.title, '$.video.title', errors, 300),
    publishedDate: optionalString(videoObject.publishedDate, '$.video.publishedDate', errors, 20),
    durationSeconds: nullableInt(videoObject.durationSeconds, '$.video.durationSeconds', errors, 86_400),
    sources: Array.isArray(videoObject.sources) ? videoObject.sources.map((item, index) => normalizeExternalVideoSource(item) ?? (errors.push(`$.video.sources[${index}] 不是有效外部视频来源。`), null)).filter((item): item is ExternalVideoSource => item !== null) : (errors.push('$.video.sources 必须是数组。'), []),
  };

  const transcriptObject = objectAt(object.transcript, '$.transcript', errors) ?? {};
  exactKeys(transcriptObject, transcriptKeys, '$.transcript', errors);
  const transcript = {
    english: optionalString(transcriptObject.english, '$.transcript.english', errors, 100_000),
    chinese: optionalString(transcriptObject.chinese, '$.transcript.chinese', errors, 100_000),
    source: enumValue(transcriptObject.source ?? 'not-provided', ['ai-collected', 'user-provided', 'workbench', 'not-provided'] as const, '$.transcript.source', errors),
  };
  if (!transcript.english && !transcript.chinese) warnings.push('回填包没有字幕内容；导入后仍可在“核对”中补充。');
  if (transcript.source === 'ai-collected') warnings.push('字幕来源标记为 AI 收集；导入后应人工核对，中文不作为权威译文。');

  const classificationObject = objectAt(object.classification, '$.classification', errors) ?? {};
  exactKeys(classificationObject, classificationKeys, '$.classification', errors);
  const classification = {
    primaryTopic: enumValue(classificationObject.primaryTopic ?? 'other', ['science_technology', 'history_culture', 'society_economy', 'psychology_health', 'mathematics_logic', 'arts_literature', 'environment_nature', 'other'] as const, '$.classification.primaryTopic', errors) as TopicId,
    contentForm: enumValue(classificationObject.contentForm ?? 'other', ['explainer', 'story', 'puzzle', 'opinion', 'biography', 'other'] as const, '$.classification.contentForm', errors) as ContentFormId,
    subtitleDifficulty: enumValue(classificationObject.subtitleDifficulty ?? 'unknown', ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown'] as const, '$.classification.subtitleDifficulty', errors) as SubtitleDifficulty,
    informationDensity: enumValue(classificationObject.informationDensity ?? 'unknown', ['low', 'medium', 'high', 'unknown'] as const, '$.classification.informationDensity', errors) as InformationDensity,
  };

  const attempt = normalizeAttempt(object.attempt, '$.attempt', errors);
  const highlights = normalizeHighlights(object.highlights, '$.highlights', errors);
  const questionLedger = normalizeLedger(object.questionLedger, '$.questionLedger', errors);
  if (!questionLedger.length) warnings.push('结构化问题台账为空；外部 AI 没有回填用户问题记录。');
  const keywords = stringArray(object.keywords, '$.keywords', errors);

  const aiReports: AiAssistantReport[] = [];
  if (!Array.isArray(object.aiReports)) errors.push('$.aiReports 必须是数组。');
  else object.aiReports.forEach((item, index) => {
    const validation = validateAiAssistantReport(item);
    if (validation.valid) aiReports.push(validation.report);
    else validation.errors.forEach((error) => errors.push(`$.aiReports[${index}] ${error}`));
  });

  const liveReports: LearningReportV1[] = [];
  if (!Array.isArray(object.liveReports)) errors.push('$.liveReports 必须是数组。');
  else object.liveReports.forEach((item, index) => {
    const validation = validateLearningReport(item, now);
    if (validation.valid) liveReports.push(validation.report);
    else validation.errors.forEach((error) => errors.push(`$.liveReports[${index}] ${error}`));
  });

  const metaObject = objectAt(object.meta, '$.meta', errors) ?? {};
  exactKeys(metaObject, metaKeys, '$.meta', errors);
  const meta = {
    generatedBy: optionalString(metaObject.generatedBy, '$.meta.generatedBy', errors, 200),
    returnedAt: optionalString(metaObject.returnedAt, '$.meta.returnedAt', errors, 40),
    notes: optionalString(metaObject.notes, '$.meta.notes', errors, 2000),
  };
  if (!video.title && !episodeId) errors.push('回填包必须提供视频标题或真实 episodeId。');

  if (errors.length) return { valid: false, errors };
  return {
    valid: true,
    package: {
      schemaVersion, packageType, video, transcript, keywords, highlights, questionLedger, classification,
      attempt: attempt ?? {
        createdAt: new Date().toISOString(),
        passes: {
          audioOnly: { completedAt: null, comprehension: null, captured: [], fragments: '' },
          visualNoCaptions: { completedAt: null, comprehension: null, visualHelp: null, confirmed: [], gistGuess: '' },
          transcriptStudy: { completedAt: null, reviewConfirmed: false, transcriptCoverage: 'none', replayedWithoutCaptions: null, postReplayComprehension: null },
        },
        recall: { mode: 'oral', oralCompleted: false, retelling: '', gist: '', outline: '', checks: [], independence: null, completedAt: null },
      },
      aiReports, liveReports, meta,
    },
    warnings,
  };
}

export type ReturnPackagePlan = {
  match: { kind: 'existing' | 'new'; episode?: Episode; confidence: 'episodeId' | 'alias' | 'none' };
  warnings: string[];
  counts: { aiReports: number; liveReports: number; highlights: number; keywords: number; ledger: number; transcriptCharacters: number };
};

export function planLearningReturnPackage(pkg: LearningReturnPackage, episodes: Episode[], workspace: WorkspaceState): ReturnPackagePlan {
  const warnings: string[] = [];
  let matched: Episode | null = null;
  let confidence: ReturnPackagePlan['match']['confidence'] = 'none';
  if (pkg.video.episodeId) {
    matched = episodes.find((episode) => episode.id === pkg.video.episodeId) ?? null;
    if (matched) confidence = 'episodeId';
  }
  if (!matched) {
    const keys = sourceKeys(pkg.video.sources);
    matched = findEpisodeByExternalKeys(episodes, workspace, keys);
    if (matched) confidence = 'alias';
  }
  const transcriptCharacters = pkg.transcript.english.length + pkg.transcript.chinese.length;
  if (matched && pkg.video.episodeId && matched.id !== pkg.video.episodeId) warnings.push(`回填包写的 episodeId 是 ${pkg.video.episodeId}，但外部链接匹配到 ${matched.id}；将以外部链接为准。`);
  if (!matched && !pkg.video.title.trim() && !sourceKeys(pkg.video.sources).length) warnings.push('没有匹配到现有视频，且回填包缺少标题和外部链接；导入后会创建无链接占位视频。');
  if (!matched && confidence === 'none') warnings.push('将新建自定义视频，之后片库重建仍可通过外部链接自动迁移。');
  return {
    match: matched ? { kind: 'existing', episode: matched, confidence } : { kind: 'new', confidence: 'none' },
    warnings,
    counts: {
      aiReports: pkg.aiReports.length,
      liveReports: pkg.liveReports.length,
      highlights: pkg.highlights.length,
      keywords: pkg.keywords.length,
      ledger: pkg.questionLedger.length,
      transcriptCharacters,
    },
  };
}

function sourceUrl(sources: ExternalVideoSource[], platform: string) {
  const source = sources.find((item) => normalizeExternalId(item.platform).toLocaleLowerCase() === platform);
  if (!source) return '';
  if (source.url) return source.url;
  if (platform === 'youtube') return `https://www.youtube.com/watch?v=${encodeURIComponent(source.id)}`;
  return '';
}

export function createReturnEpisode(pkg: LearningReturnPackage, id: string, now = new Date().toISOString()): Episode {
  const youtubeUrl = sourceUrl(pkg.video.sources, 'youtube');
  const bilibiliUrl = sourceUrl(pkg.video.sources, 'bilibili');
  const created = createCustomVideo({
    title: pkg.video.title,
    publishedDate: pkg.video.publishedDate || now.slice(0, 10),
    youtubeUrl,
    bilibiliUrl,
  }, id, now);
  return {
    ...created,
    durationSeconds: pkg.video.durationSeconds,
    sources: pkg.video.sources,
    externalKeys: sourceKeys(pkg.video.sources),
    englishTranscript: pkg.transcript.english || '',
    chineseTranscript: pkg.transcript.chinese || '',
  };
}

function mergeLedger(existing: QuestionLedgerEntry[] | undefined, incoming: QuestionLedgerEntry[]) {
  const map = new Map<string, QuestionLedgerEntry>();
  for (const item of existing ?? []) map.set(item.questionKey, item);
  for (const item of incoming) map.set(item.questionKey, item);
  return [...map.values()];
}

export type ReturnImportSummary = {
  createdVideo: boolean;
  matchedEpisodeId: string;
  transcriptWritten: boolean;
  attemptsWritten: number;
  highlightsAdded: number;
  keywordsWritten: number;
  aiReportsAdded: number;
  liveReportsAdded: number;
  liveReportsUpdated: number;
  liveReportsDuplicates: number;
  ledgerEntries: number;
  markedCompleted: boolean;
};

export type ApplyReturnPackageOptions = {
  episodeId?: string;
  newEpisodeId?: string;
  markCompleted?: boolean;
  existingEpisodes?: Episode[];
  now?: string;
};

export function applyLearningReturnPackage(workspace: WorkspaceState, pkg: LearningReturnPackage, options: ApplyReturnPackageOptions = {}): { workspace: WorkspaceState; episodeId: string; summary: ReturnImportSummary } {
  const now = options.now ?? new Date().toISOString();
  const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
  const existing = options.existingEpisodes ?? [...workspace.customVideos];
  const planned = planLearningReturnPackage(pkg, existing, workspace);
  const targetId = options.episodeId ?? (planned.match.kind === 'existing' ? planned.match.episode!.id : undefined) ?? options.newEpisodeId ?? `custom-return-${token}`;
  const existingTarget = existing.find((episode) => episode.id === targetId) ?? null;
  const isNew = !existingTarget;
  const targetEpisode = existingTarget ?? createReturnEpisode(pkg, targetId, now);
  let customVideos = workspace.customVideos;
  if (isNew) customVideos = [targetEpisode, ...customVideos];

  const transcriptOverrides = { ...(workspace.transcriptOverrides ?? {}) };
  const transcriptWritten = Boolean(pkg.transcript.english || pkg.transcript.chinese);
  if (transcriptWritten && !isNew) {
    transcriptOverrides[targetId] = {
      englishTranscript: pkg.transcript.english,
      chineseTranscript: pkg.transcript.chinese,
    };
  }

  const attemptsWritten = pkg.attempt.passes.audioOnly.completedAt
    || pkg.attempt.passes.visualNoCaptions.completedAt
    || pkg.attempt.passes.transcriptStudy.completedAt
    || pkg.attempt.recall.completedAt
    || pkg.attempt.recall.oralCompleted
    || pkg.attempt.recall.retelling.trim()
    ? 1
    : 0;
  const studyAttempts = { ...workspace.studyAttempts };
  const activeAttemptIds = { ...workspace.activeAttemptIds };
  if (attemptsWritten) {
    const base = createStudyAttempt(targetEpisode, `attempt-${token}`, pkg.attempt.createdAt || now);
    const attempt: StudyAttempt = {
      ...base,
      episodeId: targetId,
      passes: pkg.attempt.passes,
      recall: pkg.attempt.recall,
    };
    studyAttempts[targetId] = [...(studyAttempts[targetId] ?? []), attempt];
    activeAttemptIds[targetId] = attempt.attemptId;
  }

  const highlights = [...workspace.highlights];
  let highlightsAdded = 0;
  const english = pkg.transcript.english || '';
  const chinese = pkg.transcript.chinese || '';
  pkg.highlights.forEach((item, index) => {
    const quote = item.quote;
    const search = item.language === 'en' ? english : chinese;
    const offset = search.indexOf(quote);
    const startOffset = offset >= 0 ? offset : 0;
    highlights.push({
      id: `highlight-${token}-${index}`,
      episodeId: targetId,
      language: item.language,
      segmentIndex: 0,
      startOffset,
      endOffset: startOffset + quote.length,
      quote,
      type: item.type,
      note: item.note,
      createdAt: now,
    });
    highlightsAdded += 1;
  });

  const episodeKeywords = { ...(workspace.episodeKeywords ?? {}) };
  const keywordsWritten = pkg.keywords.length ? [...new Set(pkg.keywords.map((item) => item.trim()).filter(Boolean))] : [];
  if (keywordsWritten.length) episodeKeywords[targetId] = keywordsWritten;

  const aiReports = [...workspace.aiReports];
  let aiReportsAdded = 0;
  for (const report of pkg.aiReports) {
    const normalizedReport = report.episodeId === targetId ? report : { ...report, episodeId: targetId };
    const fingerprint = aiReportFingerprint(normalizedReport);
    if (aiReports.some((item) => item.fingerprint === fingerprint)) continue;
    aiReports.push(createStoredAiReport(normalizedReport, undefined, now));
    aiReportsAdded += 1;
  }

  const liveReports = [...workspace.reports];
  let liveReportsAdded = 0;
  let liveReportsUpdated = 0;
  let liveReportsDuplicates = 0;
  for (const report of pkg.liveReports) {
    const normalizedReport = report.episodeId === targetId ? report : { ...report, episodeId: targetId };
    const index = liveReports.findIndex((item) => item.sessionId === normalizedReport.sessionId);
    const existingReport = index >= 0 ? liveReports[index] : undefined;
    if (existingReport?.fingerprint === reportFingerprint(normalizedReport)) liveReportsDuplicates += 1;
    else if (existingReport) { liveReports[index] = createStoredReport(normalizedReport, existingReport, now); liveReportsUpdated += 1; }
    else { liveReports.push(createStoredReport(normalizedReport, undefined, now)); liveReportsAdded += 1; }
  }

  const completions = { ...workspace.completions };
  const markCompleted = options.markCompleted === true && !completions[targetId];
  if (markCompleted) completions[targetId] = { completedAt: now };

  const questionLedgers = { ...(workspace.questionLedgers ?? {}) };
  questionLedgers[targetId] = mergeLedger(questionLedgers[targetId], pkg.questionLedger);

  const index = episodeAliasIndex([...customVideos, ...existing]);
  const workspaceNext: WorkspaceState = {
    ...workspace,
    customVideos,
    transcriptOverrides,
    studyAttempts,
    activeAttemptIds,
    highlights,
    episodeKeywords,
    aiReports,
    reports: liveReports,
    completions,
    questionLedgers,
    episodeAliases: { ...(workspace.episodeAliases ?? {}), ...index.aliases },
    episodeAliasHistory: { ...(workspace.episodeAliasHistory ?? {}), ...index.history },
  };
  return {
    workspace: workspaceNext,
    episodeId: targetId,
    summary: {
      createdVideo: isNew,
      matchedEpisodeId: targetId,
      transcriptWritten,
      attemptsWritten,
      highlightsAdded,
      keywordsWritten: keywordsWritten.length,
      aiReportsAdded,
      liveReportsAdded,
      liveReportsUpdated,
      liveReportsDuplicates,
      ledgerEntries: pkg.questionLedger.length,
      markedCompleted: markCompleted,
    },
  };
}
