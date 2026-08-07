import type { Episode } from './learning';

export const REPORT_SCHEMA = 'luma-live-report/v2' as const;
export const LEGACY_REPORT_SCHEMA = 'luma-learning-report/v1' as const;
export const OLDEST_REPORT_SCHEMA = 'teded-learning-report/v1' as const;

export type EvidenceStatus = 'independent' | 'after_question' | 'after_english_hint' | 'after_chinese_support' | 'not_demonstrated' | 'not_assessed';
export type AssessmentConfidence = 'low' | 'medium' | 'high';
export type Finding = { findingKey: string; label: string; evidence: string };
export type DetailOutcome = Finding & { status: EvidenceStatus };
export type KeywordOutcome = { term: string; status: EvidenceStatus; evidence: string };
export type PromptUsage = { type: 'question' | 'english_hint' | 'chinese_support' | 'answer_reveal'; target: string; outcome: string };

export type LearningReportV1 = {
  schemaVersion: typeof REPORT_SCHEMA | typeof LEGACY_REPORT_SCHEMA | typeof OLDEST_REPORT_SCHEMA;
  reportType?: 'gpt_live';
  sessionId: string;
  episodeId: string;
  episodeTitle?: string;
  sessionDate: string;
  durationMinutes: number | null;
  durationSource: 'user_confirmed' | 'unknown';
  summary: string;
  gist: { status: EvidenceStatus; evidence: string; missingConcepts: string[] };
  details: DetailOutcome[];
  promptUsage: PromptUsage[];
  keywordOutcomes: KeywordOutcome[];
  retelling: {
    factAccuracy: 'accurate' | 'mostly_accurate' | 'partly_accurate' | 'inaccurate' | 'not_assessed';
    structure: 'clear' | 'partial' | 'unclear' | 'not_assessed';
    languageFindings: string[];
  };
  transfer: { status: EvidenceStatus; evidence: string };
  strengths: Finding[];
  gaps: Finding[];
  nextFocus: string;
  assessmentBasis: 'recall' | 'questions' | 'retelling' | 'transfer' | 'mixed';
  assessmentConfidence: AssessmentConfidence;
  limitations: string[];
};

export type StoredLearningReport = {
  sessionId: string;
  episodeId: string;
  sessionDate: string;
  durationMinutes: number | null;
  durationSource: 'user_confirmed' | 'unknown';
  importedAt: string;
  updatedAt: string;
  durationUpdatedAt?: string;
  fingerprint: string;
  report: LearningReportV1;
};

export type ReportValidation = { valid: true; report: LearningReportV1; warnings: string[] } | { valid: false; errors: string[] };

const evidenceStatuses: EvidenceStatus[] = ['independent', 'after_question', 'after_english_hint', 'after_chinese_support', 'not_demonstrated', 'not_assessed'];
const reportKeys = ['schemaVersion', 'reportType', 'sessionId', 'episodeId', 'episodeTitle', 'sessionDate', 'durationMinutes', 'durationSource', 'summary', 'gist', 'details', 'promptUsage', 'keywordOutcomes', 'retelling', 'transfer', 'strengths', 'gaps', 'nextFocus', 'assessmentBasis', 'assessmentConfidence', 'limitations'];

function objectAt(value: unknown, path: string, errors: string[]): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path} 必须是对象。`); return null; }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} 是契约外字段。`);
}

function requiredString(value: unknown, path: string, errors: string[], max = 1200) {
  if (typeof value !== 'string' || !value.trim()) { errors.push(`${path} 必须是非空字符串。`); return ''; }
  if (value.length > max) errors.push(`${path} 不能超过 ${max} 个字符。`);
  return value;
}

function stringArray(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) { errors.push(`${path} 必须是字符串数组。`); return []; }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`, errors, 500));
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) { errors.push(`${path} 必须是 ${allowed.join(' / ')} 之一。`); return allowed[0]; }
  return value as T;
}

function findingArray(value: unknown, path: string, errors: string[], withStatus = false) {
  if (!Array.isArray(value)) { errors.push(`${path} 必须是数组。`); return []; }
  return value.map((item, index) => {
    const itemPath = `${path}[${index}]`;
    const object = objectAt(item, itemPath, errors) ?? {};
    exactKeys(object, withStatus ? ['findingKey', 'label', 'evidence', 'status'] : ['findingKey', 'label', 'evidence'], itemPath, errors);
    return {
      findingKey: requiredString(object.findingKey, `${itemPath}.findingKey`, errors, 120),
      label: requiredString(object.label, `${itemPath}.label`, errors, 300),
      evidence: typeof object.evidence === 'string' ? object.evidence.slice(0, 500) : '',
      ...(withStatus ? { status: enumValue(object.status, evidenceStatuses, `${itemPath}.status`, errors) } : {}),
    };
  });
}

function validLocalDate(value: string) {
  return /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(new Date(`${value}T12:00:00`).getTime());
}

export function validateLearningReport(value: unknown, now = new Date()): ReportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const object = objectAt(value, '$', errors);
  if (!object) return { valid: false, errors };
  exactKeys(object, reportKeys, '$', errors);
  const schemaVersion = enumValue(object.schemaVersion, [REPORT_SCHEMA, LEGACY_REPORT_SCHEMA, OLDEST_REPORT_SCHEMA], '$.schemaVersion', errors);
  const reportType = object.reportType === undefined ? undefined : enumValue(object.reportType, ['gpt_live'] as const, '$.reportType', errors);
  if (schemaVersion === REPORT_SCHEMA && reportType !== 'gpt_live') errors.push('$.reportType 在 Live v2 报告中必须是 gpt_live。');
  const sessionId = requiredString(object.sessionId, '$.sessionId', errors, 128);
  if (sessionId && !/^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$/.test(sessionId)) errors.push('$.sessionId 格式无效，只能使用字母、数字、点、下划线、冒号和连字符。');
  const episodeId = requiredString(object.episodeId, '$.episodeId', errors, 128);
  const episodeTitle = object.episodeTitle === undefined ? undefined : requiredString(object.episodeTitle, '$.episodeTitle', errors, 300);
  const sessionDate = requiredString(object.sessionDate, '$.sessionDate', errors, 10);
  if (sessionDate && !validLocalDate(sessionDate)) errors.push('$.sessionDate 必须是有效的 YYYY-MM-DD 日期。');
  const tomorrow = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 2);
  if (validLocalDate(sessionDate) && new Date(`${sessionDate}T12:00:00`) >= tomorrow) errors.push('$.sessionDate 不能明显晚于当前日期。');
  const durationMinutes = object.durationMinutes === null ? null : Number(object.durationMinutes);
  if (durationMinutes !== null && (!Number.isInteger(durationMinutes) || durationMinutes < 1 || durationMinutes > 600)) errors.push('$.durationMinutes 必须是 1-600 的整数或 null。');
  const durationSource = enumValue(object.durationSource, ['user_confirmed', 'unknown'] as const, '$.durationSource', errors);
  if (durationMinutes === null && durationSource !== 'unknown') errors.push('时长为空时 $.durationSource 必须是 unknown。');
  if (durationMinutes !== null && durationSource !== 'user_confirmed') errors.push('有确认时长时 $.durationSource 必须是 user_confirmed。');
  if (durationMinutes === null) warnings.push('本次 GPT 巩固时长未知，导入后可以补录。');

  const gistObject = objectAt(object.gist, '$.gist', errors) ?? {};
  exactKeys(gistObject, ['status', 'evidence', 'missingConcepts'], '$.gist', errors);
  const gist = {
    status: enumValue(gistObject.status, evidenceStatuses, '$.gist.status', errors),
    evidence: typeof gistObject.evidence === 'string' ? gistObject.evidence.slice(0, 500) : '',
    missingConcepts: stringArray(gistObject.missingConcepts, '$.gist.missingConcepts', errors),
  };

  const promptUsage = Array.isArray(object.promptUsage) ? object.promptUsage.map((item, index) => {
    const path = `$.promptUsage[${index}]`; const entry = objectAt(item, path, errors) ?? {};
    exactKeys(entry, ['type', 'target', 'outcome'], path, errors);
    return { type: enumValue(entry.type, ['question', 'english_hint', 'chinese_support', 'answer_reveal'] as const, `${path}.type`, errors), target: requiredString(entry.target, `${path}.target`, errors, 300), outcome: requiredString(entry.outcome, `${path}.outcome`, errors, 500) };
  }) : (errors.push('$.promptUsage 必须是数组。'), []);

  const keywordOutcomes = Array.isArray(object.keywordOutcomes) ? object.keywordOutcomes.map((item, index) => {
    const path = `$.keywordOutcomes[${index}]`; const entry = objectAt(item, path, errors) ?? {};
    exactKeys(entry, ['term', 'status', 'evidence'], path, errors);
    return { term: requiredString(entry.term, `${path}.term`, errors, 100), status: enumValue(entry.status, evidenceStatuses, `${path}.status`, errors), evidence: typeof entry.evidence === 'string' ? entry.evidence.slice(0, 500) : '' };
  }) : (errors.push('$.keywordOutcomes 必须是数组。'), []);

  const retellingObject = objectAt(object.retelling, '$.retelling', errors) ?? {};
  exactKeys(retellingObject, ['factAccuracy', 'structure', 'languageFindings'], '$.retelling', errors);
  const retelling = {
    factAccuracy: enumValue(retellingObject.factAccuracy, ['accurate', 'mostly_accurate', 'partly_accurate', 'inaccurate', 'not_assessed'] as const, '$.retelling.factAccuracy', errors),
    structure: enumValue(retellingObject.structure, ['clear', 'partial', 'unclear', 'not_assessed'] as const, '$.retelling.structure', errors),
    languageFindings: stringArray(retellingObject.languageFindings, '$.retelling.languageFindings', errors),
  };
  const transferObject = objectAt(object.transfer, '$.transfer', errors) ?? {};
  exactKeys(transferObject, ['status', 'evidence'], '$.transfer', errors);
  const transfer = { status: enumValue(transferObject.status, evidenceStatuses, '$.transfer.status', errors), evidence: typeof transferObject.evidence === 'string' ? transferObject.evidence.slice(0, 500) : '' };

  const report: LearningReportV1 = {
    schemaVersion, ...(reportType ? { reportType } : {}), sessionId, episodeId, ...(episodeTitle ? { episodeTitle } : {}), sessionDate,
    durationMinutes: durationMinutes !== null && Number.isFinite(durationMinutes) ? durationMinutes : null,
    durationSource,
    summary: requiredString(object.summary, '$.summary', errors, 800),
    gist,
    details: findingArray(object.details, '$.details', errors, true) as DetailOutcome[],
    promptUsage,
    keywordOutcomes,
    retelling,
    transfer,
    strengths: findingArray(object.strengths, '$.strengths', errors) as Finding[],
    gaps: findingArray(object.gaps, '$.gaps', errors) as Finding[],
    nextFocus: requiredString(object.nextFocus, '$.nextFocus', errors, 500),
    assessmentBasis: enumValue(object.assessmentBasis, ['recall', 'questions', 'retelling', 'transfer', 'mixed'] as const, '$.assessmentBasis', errors),
    assessmentConfidence: enumValue(object.assessmentConfidence, ['low', 'medium', 'high'] as const, '$.assessmentConfidence', errors),
    limitations: stringArray(object.limitations, '$.limitations', errors),
  };
  return errors.length ? { valid: false, errors } : { valid: true, report, warnings };
}

export function parseReportJson(text: string) {
  if (/```/.test(text)) return { values: [] as unknown[], errors: ['报告包含 Markdown 代码围栏，请删除围栏后再校验。'] };
  try {
    const parsed = JSON.parse(text) as unknown;
    return { values: Array.isArray(parsed) ? parsed : [parsed], errors: [] as string[] };
  } catch (error) {
    return { values: [] as unknown[], errors: [`JSON 语法错误：${error instanceof Error ? error.message : '无法解析'}`] };
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function reportFingerprint(report: LearningReportV1) {
  const text = stableStringify(report);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createStoredReport(report: LearningReportV1, existing?: StoredLearningReport, now = new Date().toISOString()): StoredLearningReport {
  return {
    sessionId: report.sessionId, episodeId: report.episodeId, sessionDate: report.sessionDate,
    durationMinutes: report.durationMinutes, durationSource: report.durationSource,
    importedAt: existing?.importedAt ?? now, updatedAt: now,
    fingerprint: reportFingerprint(report), report,
  };
}

export function createReportTemplate(sessionId: string, episode: Pick<Episode, 'id' | 'title'>, today = new Date()): LearningReportV1 {
  const date = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  return {
    schemaVersion: REPORT_SCHEMA, reportType: 'gpt_live', sessionId, episodeId: episode.id, episodeTitle: episode.title, sessionDate: date,
    durationMinutes: null, durationSource: 'unknown', summary: '用一句话总结本次巩固中真实表现出的理解。',
    gist: { status: 'not_assessed', evidence: '', missingConcepts: [] }, details: [], promptUsage: [], keywordOutcomes: [],
    retelling: { factAccuracy: 'not_assessed', structure: 'not_assessed', languageFindings: [] },
    transfer: { status: 'not_assessed', evidence: '' }, strengths: [], gaps: [],
    nextFocus: '写出下一次可以直接执行的一项练习。', assessmentBasis: 'mixed', assessmentConfidence: 'medium', limitations: [],
  };
}

export type EvidenceTrend = '证据不足' | '有改善' | '稳定' | '反复困难' | '最近回落';
const evidenceRank: Record<EvidenceStatus, number | null> = { independent: 5, after_question: 4, after_english_hint: 3, after_chinese_support: 2, not_demonstrated: 1, not_assessed: null };

function average(values: Array<number | null>) { const known = values.filter((value): value is number => value !== null); return known.length ? known.reduce((sum, value) => sum + value, 0) / known.length : null; }

function reportDimension(report: LearningReportV1, dimension: 'gist' | 'details' | 'keywords' | 'retelling' | 'transfer') {
  if (dimension === 'gist') return evidenceRank[report.gist.status];
  if (dimension === 'details') return average(report.details.map((item) => evidenceRank[item.status]));
  if (dimension === 'keywords') return average(report.keywordOutcomes.map((item) => evidenceRank[item.status]));
  if (dimension === 'transfer') return evidenceRank[report.transfer.status];
  const accuracy = { accurate: 5, mostly_accurate: 4, partly_accurate: 3, inaccurate: 1, not_assessed: null }[report.retelling.factAccuracy];
  const structure = { clear: 5, partial: 3, unclear: 1, not_assessed: null }[report.retelling.structure];
  return average([accuracy, structure]);
}

const evidenceScore: Record<EvidenceStatus, number | null> = {
  independent: 100,
  after_question: 80,
  after_english_hint: 60,
  after_chinese_support: 40,
  not_demonstrated: 20,
  not_assessed: null,
};

export function liveReportScore(report: LearningReportV1) {
  const retellingAccuracy = { accurate: 100, mostly_accurate: 80, partly_accurate: 55, inaccurate: 20, not_assessed: null }[report.retelling.factAccuracy];
  const retellingStructure = { clear: 100, partial: 60, unclear: 20, not_assessed: null }[report.retelling.structure];
  const dimensions = [
    evidenceScore[report.gist.status],
    average(report.details.map((item) => evidenceScore[item.status])),
    average(report.keywordOutcomes.map((item) => evidenceScore[item.status])),
    average([retellingAccuracy, retellingStructure]),
    evidenceScore[report.transfer.status],
  ];
  const score = average(dimensions);
  return score === null ? null : Math.round(score);
}

export function calculateEvidenceTrends(reports: StoredLearningReport[]) {
  const dimensions = ['gist', 'details', 'keywords', 'retelling', 'transfer'] as const;
  const labels = { gist: '主旨理解', details: '关键细节与因果', keywords: '关键词语境', retelling: '英文复述', transfer: '新语境迁移' };
  const ordered = [...reports].sort((a, b) => a.sessionDate.localeCompare(b.sessionDate));
  return dimensions.map((dimension) => {
    const values = ordered.filter((item) => item.report.assessmentConfidence !== 'low').map((item) => reportDimension(item.report, dimension)).filter((value): value is number => value !== null);
    let status: EvidenceTrend = '证据不足';
    if (values.length >= 2) {
      const previous = values.at(-2)!; const latest = values.at(-1)!; const difference = latest - previous;
      if (difference >= 0.75) status = '有改善'; else if (difference <= -0.75) status = '最近回落'; else if (latest <= 3) status = '反复困难'; else status = '稳定';
    }
    return { dimension, label: labels[dimension], status, samples: values.length };
  });
}

export function repeatedFindings(reports: StoredLearningReport[]) {
  const counts = new Map<string, { label: string; count: number; latest: string }>();
  for (const stored of reports) {
    if (stored.report.assessmentConfidence === 'low') continue;
    const findings = [
      ...stored.report.gaps,
      ...stored.report.details.filter((item) => item.status === 'not_demonstrated' || item.status === 'after_chinese_support'),
      ...stored.report.keywordOutcomes.filter((item) => ['not_demonstrated', 'after_chinese_support'].includes(item.status)).map((item) => ({ findingKey: `keyword:${item.term.normalize('NFKC').toLowerCase()}`, label: item.term, evidence: item.evidence })),
    ];
    for (const item of findings) {
      const current = counts.get(item.findingKey) ?? { label: item.label, count: 0, latest: stored.sessionDate };
      current.count += 1; if (stored.sessionDate >= current.latest) { current.latest = stored.sessionDate; current.label = item.label; }
      counts.set(item.findingKey, current);
    }
  }
  return [...counts.entries()].filter(([, item]) => item.count >= 2).sort((a, b) => b[1].count - a[1].count || b[1].latest.localeCompare(a[1].latest)).map(([findingKey, item]) => ({ findingKey, ...item }));
}

export function buildStageReport(episodes: Episode[], reports: StoredLearningReport[], completions: Record<string, { completedAt: string }>, fromDate: string, toDate: string) {
  const selectedReports = reports.filter((item) => item.sessionDate >= fromDate && item.sessionDate <= toDate);
  const completedIds = Object.entries(completions).filter(([, item]) => item.completedAt.slice(0, 10) >= fromDate && item.completedAt.slice(0, 10) <= toDate).map(([id]) => id);
  const episodeById = new Map(episodes.map((item) => [item.id, item]));
  const videoMinutes = Math.round(completedIds.reduce((sum, id) => sum + (episodeById.get(id)?.durationSeconds ?? 0) / 60, 0));
  const liveMinutes = selectedReports.reduce((sum, item) => sum + (item.durationMinutes ?? 0), 0);
  const unknownDurationCount = selectedReports.filter((item) => item.durationMinutes === null).length;
  const trends = calculateEvidenceTrends(selectedReports);
  const repeated = repeatedFindings(selectedReports);
  const title = selectedReports.length < 2 ? '学习记录摘要' : '进步阶段报告';
  const nextFocus = [...selectedReports].sort((a, b) => b.sessionDate.localeCompare(a.sessionDate))[0]?.report.nextFocus;
  const payload = { schemaVersion: 'luma-stage-report/v1', title, range: { from: fromDate, to: toDate }, coverage: { completedVideos: completedIds.length, gptSessions: selectedReports.length, unknownDurationSessions: unknownDurationCount }, time: { videoContentMinutes: videoMinutes, confirmedGptMinutes: liveMinutes }, evidenceTrends: trends, repeatedFindings: repeated, nextFocus: nextFocus ? [nextFocus] : [], limitations: [selectedReports.length < 2 ? 'GPT 报告少于 2 份，只能生成学习记录摘要。' : null, unknownDurationCount ? `${unknownDurationCount} 份 GPT 报告缺少确认时长。` : null].filter(Boolean) };
  const markdown = [`# ${title}`, '', `- 时间范围：${fromDate} 至 ${toDate}`, `- 完成视频：${completedIds.length} 集`, `- 已完成视频内容时长：${videoMinutes} 分钟`, `- GPT 巩固：${selectedReports.length} 次`, `- 已确认 GPT 巩固时长：${liveMinutes} 分钟`, `- 时长未知：${unknownDurationCount} 次`, '', '## 能力证据', '', ...trends.map((item) => `- ${item.label}：${item.status}（${item.samples} 份可比较证据）`), '', '## 反复出现的问题', '', ...(repeated.length ? repeated.map((item) => `- ${item.label}：${item.count} 次`) : ['- 暂无足够重复证据']), '', '## 下一阶段重点', '', nextFocus ? `- ${nextFocus}` : '- 继续下一集', '', '## 数据限制', '', ...(payload.limitations.length ? payload.limitations.map((item) => `- ${item}`) : ['- 当前范围内数据完整。']), ''].join('\n');
  return { payload, markdown };
}
