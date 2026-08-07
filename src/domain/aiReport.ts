import type { Episode } from './learning';

export const AI_REPORT_SCHEMA = 'luma-ai-assistant-report/v1' as const;

export const topicLabels = {
  science_technology: '科学与技术',
  history_culture: '历史与文化',
  society_economy: '社会与经济',
  psychology_health: '心理与健康',
  mathematics_logic: '数学与逻辑',
  arts_literature: '艺术与文学',
  environment_nature: '环境与自然',
  other: '其他',
} as const;

export const contentFormLabels = {
  explainer: '知识讲解',
  story: '故事叙事',
  puzzle: '谜题与问题',
  opinion: '人物观点',
  biography: '人物经历',
  other: '其他',
} as const;

export const questionKindLabels = {
  vocabulary: '词汇',
  grammar: '语法',
  expression: '表达',
  comprehension: '理解',
  translation: '翻译',
  other: '其他',
} as const;

export type TopicId = keyof typeof topicLabels;
export type ContentFormId = keyof typeof contentFormLabels;
export type SubtitleDifficulty = 'A1' | 'A2' | 'B1' | 'B2' | 'C1' | 'C2' | 'unknown';
export type InformationDensity = 'low' | 'medium' | 'high' | 'unknown';
export type QuestionKind = keyof typeof questionKindLabels;
export type QuestionDepth = 'lookup' | 'usage' | 'analysis' | 'comparison' | 'transfer';
export type QuestionLedgerStage = 'preparation' | 'audio-only' | 'visual-no-captions' | 'transcript-study' | 'recall' | 'live' | 'other';
export type QuestionLedgerStatus = 'open' | 'resolved';
export type TranscriptSource = 'catalog' | 'user-provided' | 'ai-collected' | 'workbench' | 'not-provided';

export type QuestionLedgerEntry = {
  questionKey: string;
  label: string;
  kind: QuestionKind;
  depth: QuestionDepth;
  question: string;
  answerSummary: string;
  sourceQuote: string;
  stage: QuestionLedgerStage;
  status: QuestionLedgerStatus;
};

export type AiAssistantReport = {
  schemaVersion: typeof AI_REPORT_SCHEMA;
  reportType: 'ai_assistant';
  episodeId: string;
  episodeTitle: string;
  generatedAt: string;
  materialAnalysis: {
    primaryTopic: TopicId;
    contentForm: ContentFormId;
    subtitleDifficulty: SubtitleDifficulty;
    informationDensity: InformationDensity;
    summary: string;
  };
  userQuestions: Array<{
    questionKey: string;
    label: string;
    kind: QuestionKind;
    depth: QuestionDepth;
    question: string;
    answerSummary: string;
    sourceQuote: string;
  }>;
  recommendations: {
    vocabulary: Array<{ term: string; meaning: string; reason: string }>;
    grammar: Array<{ pattern: string; explanation: string; reason: string }>;
  };
  limitations: string[];
};

export type StoredAiAssistantReport = {
  episodeId: string;
  importedAt: string;
  updatedAt: string;
  fingerprint: string;
  report: AiAssistantReport;
};

export type AiReportValidation = { valid: true; report: AiAssistantReport; warnings: string[] } | { valid: false; errors: string[] };

function objectAt(value: unknown, path: string, errors: string[]) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) { errors.push(`${path} 必须是对象。`); return null; }
  return value as Record<string, unknown>;
}

function exactKeys(value: Record<string, unknown>, allowed: string[], path: string, errors: string[]) {
  for (const key of Object.keys(value)) if (!allowed.includes(key)) errors.push(`${path}.${key} 是契约外字段。`);
}

function requiredString(value: unknown, path: string, errors: string[], max: number) {
  if (typeof value !== 'string' || !value.trim()) { errors.push(`${path} 必须是非空字符串。`); return ''; }
  if (value.length > max) errors.push(`${path} 不能超过 ${max} 个字符。`);
  return value.trim();
}

function optionalString(value: unknown, path: string, errors: string[], max: number) {
  if (typeof value !== 'string') { errors.push(`${path} 必须是字符串。`); return ''; }
  if (value.length > max) errors.push(`${path} 不能超过 ${max} 个字符。`);
  return value.trim();
}

function enumValue<T extends string>(value: unknown, allowed: readonly T[], path: string, errors: string[]) {
  if (typeof value !== 'string' || !allowed.includes(value as T)) { errors.push(`${path} 必须是 ${allowed.join(' / ')} 之一。`); return allowed[0]; }
  return value as T;
}

function stringArray(value: unknown, path: string, errors: string[]) {
  if (!Array.isArray(value)) { errors.push(`${path} 必须是字符串数组。`); return []; }
  return value.map((item, index) => requiredString(item, `${path}[${index}]`, errors, 500));
}

export function validateAiAssistantReport(value: unknown): AiReportValidation {
  const errors: string[] = [];
  const warnings: string[] = [];
  const object = objectAt(value, '$', errors);
  if (!object) return { valid: false, errors };
  exactKeys(object, ['schemaVersion', 'reportType', 'episodeId', 'episodeTitle', 'generatedAt', 'materialAnalysis', 'userQuestions', 'recommendations', 'limitations'], '$', errors);

  const schemaVersion = enumValue(object.schemaVersion, [AI_REPORT_SCHEMA] as const, '$.schemaVersion', errors);
  const reportType = enumValue(object.reportType, ['ai_assistant'] as const, '$.reportType', errors);
  const episodeId = requiredString(object.episodeId, '$.episodeId', errors, 128);
  const episodeTitle = requiredString(object.episodeTitle, '$.episodeTitle', errors, 300);
  const generatedAt = requiredString(object.generatedAt, '$.generatedAt', errors, 40);
  if (generatedAt && Number.isNaN(new Date(generatedAt).getTime())) errors.push('$.generatedAt 必须是有效的 ISO 日期时间。');

  const material = objectAt(object.materialAnalysis, '$.materialAnalysis', errors) ?? {};
  exactKeys(material, ['primaryTopic', 'contentForm', 'subtitleDifficulty', 'informationDensity', 'summary'], '$.materialAnalysis', errors);
  const materialAnalysis = {
    primaryTopic: enumValue(material.primaryTopic, Object.keys(topicLabels) as TopicId[], '$.materialAnalysis.primaryTopic', errors),
    contentForm: enumValue(material.contentForm, Object.keys(contentFormLabels) as ContentFormId[], '$.materialAnalysis.contentForm', errors),
    subtitleDifficulty: enumValue(material.subtitleDifficulty, ['A1', 'A2', 'B1', 'B2', 'C1', 'C2', 'unknown'] as const, '$.materialAnalysis.subtitleDifficulty', errors),
    informationDensity: enumValue(material.informationDensity, ['low', 'medium', 'high', 'unknown'] as const, '$.materialAnalysis.informationDensity', errors),
    summary: requiredString(material.summary, '$.materialAnalysis.summary', errors, 800),
  };

  const userQuestions = Array.isArray(object.userQuestions) ? object.userQuestions.map((item, index) => {
    const path = `$.userQuestions[${index}]`;
    const entry = objectAt(item, path, errors) ?? {};
    exactKeys(entry, ['questionKey', 'label', 'kind', 'depth', 'question', 'answerSummary', 'sourceQuote'], path, errors);
    return {
      questionKey: requiredString(entry.questionKey, `${path}.questionKey`, errors, 120),
      label: requiredString(entry.label, `${path}.label`, errors, 200),
      kind: enumValue(entry.kind, Object.keys(questionKindLabels) as QuestionKind[], `${path}.kind`, errors),
      depth: enumValue(entry.depth, ['lookup', 'usage', 'analysis', 'comparison', 'transfer'] as const, `${path}.depth`, errors),
      question: requiredString(entry.question, `${path}.question`, errors, 1000),
      answerSummary: requiredString(entry.answerSummary, `${path}.answerSummary`, errors, 1000),
      sourceQuote: optionalString(entry.sourceQuote, `${path}.sourceQuote`, errors, 500),
    };
  }) : (errors.push('$.userQuestions 必须是数组。'), []);

  const recommendationsObject = objectAt(object.recommendations, '$.recommendations', errors) ?? {};
  exactKeys(recommendationsObject, ['vocabulary', 'grammar'], '$.recommendations', errors);
  const vocabulary = Array.isArray(recommendationsObject.vocabulary) ? recommendationsObject.vocabulary.map((item, index) => {
    const path = `$.recommendations.vocabulary[${index}]`;
    const entry = objectAt(item, path, errors) ?? {};
    exactKeys(entry, ['term', 'meaning', 'reason'], path, errors);
    return {
      term: requiredString(entry.term, `${path}.term`, errors, 100),
      meaning: requiredString(entry.meaning, `${path}.meaning`, errors, 500),
      reason: requiredString(entry.reason, `${path}.reason`, errors, 500),
    };
  }) : (errors.push('$.recommendations.vocabulary 必须是数组。'), []);
  const grammar = Array.isArray(recommendationsObject.grammar) ? recommendationsObject.grammar.map((item, index) => {
    const path = `$.recommendations.grammar[${index}]`;
    const entry = objectAt(item, path, errors) ?? {};
    exactKeys(entry, ['pattern', 'explanation', 'reason'], path, errors);
    return {
      pattern: requiredString(entry.pattern, `${path}.pattern`, errors, 200),
      explanation: requiredString(entry.explanation, `${path}.explanation`, errors, 700),
      reason: requiredString(entry.reason, `${path}.reason`, errors, 500),
    };
  }) : (errors.push('$.recommendations.grammar 必须是数组。'), []);

  if (!userQuestions.length) warnings.push('报告没有用户主动问题；学习积累和主动探究维度不会增加证据。');
  if (materialAnalysis.primaryTopic === 'other') warnings.push('材料主题仍为 other；内容画像会显示为“其他”，建议确认 AI 已根据字幕完成分类。');
  if (materialAnalysis.contentForm === 'other') warnings.push('内容形式仍为 other；内容画像会显示为“其他”，建议确认 AI 已根据字幕完成分类。');
  if (materialAnalysis.subtitleDifficulty === 'unknown') warnings.push('字幕难度未知；挑战水平将只使用其他可用材料证据。');
  if (materialAnalysis.informationDensity === 'unknown') warnings.push('信息密度未知；挑战水平将只使用其他可用材料证据。');
  if (/^根据当前学习文件概括本集材料/.test(materialAnalysis.summary)) warnings.push('材料摘要仍像模板占位文字；建议重新生成后再导入。');

  const report: AiAssistantReport = {
    schemaVersion,
    reportType,
    episodeId,
    episodeTitle,
    generatedAt,
    materialAnalysis,
    userQuestions,
    recommendations: { vocabulary, grammar },
    limitations: stringArray(object.limitations, '$.limitations', errors),
  };
  return errors.length ? { valid: false, errors } : { valid: true, report, warnings };
}

export function parseAiReportJson(text: string) {
  if (/```/.test(text)) return { value: null as unknown, errors: ['报告包含 Markdown 代码围栏，请删除围栏后再校验。'] };
  try {
    const value = JSON.parse(text) as unknown;
    if (Array.isArray(value)) return { value: null as unknown, errors: ['AI 助手报告一次只导入当前视频的一份 JSON 对象。'] };
    return { value, errors: [] as string[] };
  } catch (error) {
    return { value: null as unknown, errors: [`JSON 语法错误：${error instanceof Error ? error.message : '无法解析'}`] };
  }
}

function stableStringify(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(',')}]`;
  if (value && typeof value === 'object') return `{${Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`;
  return JSON.stringify(value);
}

export function aiReportFingerprint(report: AiAssistantReport) {
  const { episodeTitle: _episodeTitle, ...content } = report;
  const text = stableStringify(content);
  let hash = 2166136261;
  for (let index = 0; index < text.length; index += 1) { hash ^= text.charCodeAt(index); hash = Math.imul(hash, 16777619); }
  return `fnv1a-${(hash >>> 0).toString(16).padStart(8, '0')}`;
}

export function createStoredAiReport(report: AiAssistantReport, existing?: StoredAiAssistantReport, now = new Date().toISOString()): StoredAiAssistantReport {
  return { episodeId: report.episodeId, importedAt: existing?.importedAt ?? now, updatedAt: now, fingerprint: aiReportFingerprint(report), report };
}

export function sortAiReportsNewest(reports: StoredAiAssistantReport[]) {
  return [...reports].sort((a, b) => b.report.generatedAt.localeCompare(a.report.generatedAt) || b.importedAt.localeCompare(a.importedAt));
}

export function createAiReportTemplate(episode: Pick<Episode, 'id' | 'title'>, now = new Date()): AiAssistantReport {
  return {
    schemaVersion: AI_REPORT_SCHEMA,
    reportType: 'ai_assistant',
    episodeId: episode.id,
    episodeTitle: episode.title,
    generatedAt: now.toISOString(),
    materialAnalysis: {
      primaryTopic: 'other',
      contentForm: 'other',
      subtitleDifficulty: 'unknown',
      informationDensity: 'unknown',
      summary: '根据当前学习文件概括本集材料，不评价学习者是否理解。',
    },
    userQuestions: [],
    recommendations: { vocabulary: [], grammar: [] },
    limitations: ['模板尚未由 AI 根据当前学习文件和对话填充。'],
  };
}
