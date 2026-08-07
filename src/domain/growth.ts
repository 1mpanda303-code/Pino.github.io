import type { AiAssistantReport, StoredAiAssistantReport, QuestionKind, TopicId, ContentFormId, SubtitleDifficulty } from './aiReport';
import type { Episode, StudyAttempt } from './learning';
import { liveReportScore, type StoredLearningReport } from './report';
import type { Completion } from './workspace';

export type GrowthRange = '7' | '30' | 'all';
export type GrowthDimensionId = 'challenge' | 'practice' | 'questions' | 'understanding';

export type GrowthDimension = {
  id: GrowthDimensionId;
  label: string;
  source: string;
  weight: number;
  score: number | null;
  samples: number;
  summary: string;
};

export type LearningAccumulation = {
  questionKey: string;
  sourceReportFingerprint: string;
  label: string;
  kind: QuestionKind;
  latestQuestion: string;
  answerSummary: string;
  latestDate: string;
  episodeIds: string[];
  count: number;
};

export type VocabularyAccumulation = {
  sourceReportFingerprint: string;
  term: string;
  meaning: string;
  reason: string;
  latestDate: string;
  episodeIds: string[];
  count: number;
};

export type GrowthArchiveEntry = {
  episode: Episode;
  completedAt?: string;
  aiReport?: StoredAiAssistantReport;
  aiReports: StoredAiAssistantReport[];
  liveReports: StoredLearningReport[];
  latestDate: string;
};

export type GrowthModel = {
  bounds: { from: string | null; to: string };
  dimensions: GrowthDimension[];
  overallScore: number | null;
  previousScore: number | null;
  delta: number | null;
  coverageWeight: number;
  completedCount: number;
  liveCount: number;
  aiReportCount: number;
  aiVideoCount: number;
  studyDays: number;
  topics: Array<{ id: TopicId; count: number }>;
  forms: Array<{ id: ContentFormId; count: number }>;
  difficulties: Array<{ id: SubtitleDifficulty; count: number }>;
  accumulations: LearningAccumulation[];
  vocabulary: VocabularyAccumulation[];
  archive: GrowthArchiveEntry[];
};

function localDate(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

export function growthBounds(range: GrowthRange, now = new Date()) {
  const to = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (range === 'all') return { from: null, to: localDate(to), previousFrom: null, previousTo: null };
  const days = Number(range);
  const from = new Date(to); from.setDate(from.getDate() - days + 1);
  const previousTo = new Date(from); previousTo.setDate(previousTo.getDate() - 1);
  const previousFrom = new Date(previousTo); previousFrom.setDate(previousFrom.getDate() - days + 1);
  return { from: localDate(from), to: localDate(to), previousFrom: localDate(previousFrom), previousTo: localDate(previousTo) };
}

function inBounds(date: string, from: string | null, to: string) {
  const normalized = date.slice(0, 10);
  return normalized <= to && (from === null || normalized >= from);
}

function average(values: number[]) {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

const difficultyScore: Record<SubtitleDifficulty, number | null> = { A1: 20, A2: 35, B1: 50, B2: 70, C1: 85, C2: 100, unknown: null };
const densityScore = { low: 40, medium: 65, high: 90, unknown: null } as const;
const depthScore = { lookup: 1, usage: 2, analysis: 3, comparison: 4, transfer: 5 } as const;

function attemptDate(attempt: StudyAttempt) {
  return attempt.recall.completedAt
    ?? attempt.passes.transcriptStudy.completedAt
    ?? attempt.passes.visualNoCaptions.completedAt
    ?? attempt.passes.audioOnly.completedAt
    ?? attempt.createdAt;
}

function attemptHasEvidence(attempt: StudyAttempt) {
  return !!attempt.passes.audioOnly.completedAt
    || attempt.passes.audioOnly.comprehension !== null
    || !!attempt.passes.audioOnly.fragments.trim()
    || !!attempt.passes.visualNoCaptions.completedAt
    || attempt.passes.visualNoCaptions.comprehension !== null
    || attempt.passes.visualNoCaptions.visualHelp !== null
    || !!attempt.passes.transcriptStudy.completedAt
    || attempt.passes.transcriptStudy.reviewConfirmed
    || !!attempt.recall.completedAt
    || attempt.recall.oralCompleted
    || attempt.recall.independence !== null
    || !!attempt.recall.retelling.trim();
}

export function practiceAttemptScore(attempt: StudyAttempt) {
  let score = 0;
  if (attempt.passes.audioOnly.completedAt) score += 15;
  if (attempt.passes.visualNoCaptions.completedAt) score += 15;
  if (attempt.passes.transcriptStudy.completedAt) score += 25;
  if (attempt.recall.completedAt) score += 25;
  if (attempt.passes.audioOnly.comprehension !== null) score += 5;
  if (attempt.passes.visualNoCaptions.comprehension !== null && attempt.passes.visualNoCaptions.visualHelp !== null) score += 5;
  if (attempt.passes.transcriptStudy.reviewConfirmed && attempt.passes.transcriptStudy.transcriptCoverage !== 'none') score += 5;
  const recallEvidence = attempt.recall.mode === 'oral' ? attempt.recall.oralCompleted : !!attempt.recall.retelling.trim();
  if (attempt.recall.independence !== null && recallEvidence) score += 5;
  return score;
}

function dimensionsForBounds(
  studyAttempts: Record<string, StudyAttempt[]>,
  aiReports: StoredAiAssistantReport[],
  liveReports: StoredLearningReport[],
  from: string | null,
  to: string,
) {
  const selectedAi = aiReports.filter((item) => inBounds(item.report.generatedAt, from, to));
  const consolidatedAi = consolidatedReportsForActiveEpisodes(aiReports, selectedAi, to);
  const selectedAttempts = Object.values(studyAttempts).flat().filter((item) => attemptHasEvidence(item) && inBounds(attemptDate(item), from, to));
  const selectedLive = liveReports.filter((item) => inBounds(item.sessionDate, from, to));

  const challengeValues = consolidatedAi.flatMap((item) => {
    const difficulty = difficultyScore[item.report.materialAnalysis.subtitleDifficulty];
    const density = densityScore[item.report.materialAnalysis.informationDensity];
    const values = [difficulty, density].filter((value): value is number => value !== null);
    return values.length ? [difficulty !== null && density !== null ? difficulty * .75 + density * .25 : values[0]] : [];
  });
  const challenge = average(challengeValues);

  const practiceValues = selectedAttempts.map(practiceAttemptScore);
  const practice = average(practiceValues);

  const questionInstances = questionsPerEpisode(selectedAi);
  const kinds = new Set(questionInstances.map((item) => item.question.kind));
  const averageDepth = average(questionInstances.map((item) => depthScore[item.question.depth]));
  const questionScore = questionInstances.length
    ? Math.min(100, questionInstances.length * 10 + kinds.size * 8 + (averageDepth ?? 0) * 8)
    : null;

  const liveValues = selectedLive
    .filter((item) => item.report.assessmentConfidence !== 'low')
    .map((item) => liveReportScore(item.report))
    .filter((value): value is number => value !== null);
  const understanding = average(liveValues);

  return [
    {
      id: 'challenge', label: '挑战水平', source: 'AI 材料报告', weight: 15, score: challenge === null ? null : Math.round(challenge), samples: challengeValues.length,
      summary: challenge === null ? '尚无材料难度证据' : `基于 ${consolidatedAi.length} 个视频的合并材料画像，不重复计算同集报告`,
    },
    {
      id: 'practice', label: '三遍完成度', source: '工作台学习记录', weight: 30, score: practice === null ? null : Math.round(practice), samples: selectedAttempts.length,
      summary: practice === null ? '当前范围没有学习尝试' : `${selectedAttempts.length} 次学习尝试的流程与记录完整度`,
    },
    {
      id: 'questions', label: '主动探究', source: 'AI 助手报告', weight: 20, score: questionScore === null ? null : Math.round(questionScore), samples: questionInstances.length,
      summary: questionScore === null ? '尚未导入用户主动问题' : `${questionInstances.length} 个按视频去重的问题记录，覆盖 ${kinds.size} 类`,
    },
    {
      id: 'understanding', label: '理解表现', source: 'GPT Live 报告', weight: 35, score: understanding === null ? null : Math.round(understanding), samples: liveValues.length,
      summary: understanding === null ? '尚无可信 Live 表现证据' : `${liveValues.length} 份可比较 Live 报告`,
    },
  ] satisfies GrowthDimension[];
}

function overall(dimensions: GrowthDimension[]) {
  const available = dimensions.filter((item) => item.score !== null);
  if (available.length < 2) return { score: null, coverage: available.reduce((sum, item) => sum + item.weight, 0) };
  const weight = available.reduce((sum, item) => sum + item.weight, 0);
  return { score: Math.round(available.reduce((sum, item) => sum + item.score! * item.weight, 0) / weight), coverage: weight };
}

function countBy<T extends string>(values: T[]) {
  const counts = new Map<T, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + 1);
  return [...counts.entries()].map(([id, count]) => ({ id, count })).sort((a, b) => b.count - a.count || a.id.localeCompare(b.id));
}

function normalizeKey(value: string) {
  return value.trim().toLocaleLowerCase();
}

function reportOrder(a: StoredAiAssistantReport, b: StoredAiAssistantReport) {
  return a.report.generatedAt.localeCompare(b.report.generatedAt) || a.importedAt.localeCompare(b.importedAt);
}

function latestExplicit<T>(reports: StoredAiAssistantReport[], read: (report: AiAssistantReport) => T, placeholder: T) {
  return [...reports].reverse().map((item) => read(item.report)).find((value) => value !== placeholder) ?? read(reports.at(-1)!.report);
}

export function consolidateEpisodeAiReports(reports: StoredAiAssistantReport[]) {
  if (!reports.length) return undefined;
  const ordered = [...reports].sort(reportOrder);
  const latest = ordered.at(-1)!;
  const questions = new Map<string, AiAssistantReport['userQuestions'][number]>();
  const vocabulary = new Map<string, AiAssistantReport['recommendations']['vocabulary'][number]>();
  const grammar = new Map<string, AiAssistantReport['recommendations']['grammar'][number]>();
  for (const stored of ordered) {
    for (const item of stored.report.userQuestions) questions.set(item.questionKey, item);
    for (const item of stored.report.recommendations.vocabulary) vocabulary.set(normalizeKey(item.term), item);
    for (const item of stored.report.recommendations.grammar) grammar.set(normalizeKey(item.pattern), item);
  }
  const summary = [...ordered].reverse().map((item) => item.report.materialAnalysis.summary)
    .find((value) => !/^根据当前学习文件概括本集材料/.test(value)) ?? latest.report.materialAnalysis.summary;
  return {
    ...latest,
    report: {
      ...latest.report,
      materialAnalysis: {
        primaryTopic: latestExplicit(ordered, (report) => report.materialAnalysis.primaryTopic, 'other'),
        contentForm: latestExplicit(ordered, (report) => report.materialAnalysis.contentForm, 'other'),
        subtitleDifficulty: latestExplicit(ordered, (report) => report.materialAnalysis.subtitleDifficulty, 'unknown'),
        informationDensity: latestExplicit(ordered, (report) => report.materialAnalysis.informationDensity, 'unknown'),
        summary,
      },
      userQuestions: [...questions.values()],
      recommendations: { vocabulary: [...vocabulary.values()], grammar: [...grammar.values()] },
    },
  } satisfies StoredAiAssistantReport;
}

function groupReportsByEpisode(reports: StoredAiAssistantReport[]) {
  const grouped = new Map<string, StoredAiAssistantReport[]>();
  for (const report of reports) grouped.set(report.episodeId, [...(grouped.get(report.episodeId) ?? []), report]);
  return grouped;
}

function consolidatedReportsForActiveEpisodes(aiReports: StoredAiAssistantReport[], activeReports: StoredAiAssistantReport[], to: string) {
  const activeIds = new Set(activeReports.map((item) => item.episodeId));
  const histories = groupReportsByEpisode(aiReports.filter((item) => item.report.generatedAt.slice(0, 10) <= to && activeIds.has(item.episodeId)));
  return [...histories.values()].flatMap((items) => consolidateEpisodeAiReports(items) ?? []);
}

function questionsPerEpisode(aiReports: StoredAiAssistantReport[]) {
  const map = new Map<string, { stored: StoredAiAssistantReport; question: AiAssistantReport['userQuestions'][number] }>();
  for (const stored of [...aiReports].sort(reportOrder)) {
    for (const question of stored.report.userQuestions) map.set(`${stored.episodeId}\u0000${question.questionKey}`, { stored, question });
  }
  return [...map.values()];
}

function buildAccumulations(aiReports: StoredAiAssistantReport[]) {
  const map = new Map<string, LearningAccumulation>();
  for (const { stored, question } of questionsPerEpisode(aiReports)) {
    const date = stored.report.generatedAt.slice(0, 10);
    const existing = map.get(question.questionKey);
    if (!existing) {
      map.set(question.questionKey, {
        questionKey: question.questionKey,
        sourceReportFingerprint: stored.fingerprint,
        label: question.label,
        kind: question.kind,
        latestQuestion: question.question,
        answerSummary: question.answerSummary,
        latestDate: date,
        episodeIds: [stored.episodeId],
        count: 1,
      });
    } else {
      existing.count += 1;
      if (!existing.episodeIds.includes(stored.episodeId)) existing.episodeIds.push(stored.episodeId);
      if (date >= existing.latestDate) {
        existing.sourceReportFingerprint = stored.fingerprint;
        existing.label = question.label;
        existing.kind = question.kind;
        existing.latestQuestion = question.question;
        existing.answerSummary = question.answerSummary;
        existing.latestDate = date;
      }
    }
  }
  return [...map.values()].sort((a, b) => b.latestDate.localeCompare(a.latestDate) || b.count - a.count);
}

function buildVocabularyAccumulations(aiReports: StoredAiAssistantReport[]) {
  const map = new Map<string, VocabularyAccumulation>();
  for (const stored of [...aiReports].sort(reportOrder)) {
    const date = stored.report.generatedAt.slice(0, 10);
    for (const item of stored.report.recommendations.vocabulary) {
      const key = normalizeKey(item.term);
      const existing = map.get(key);
      if (!existing) {
      map.set(key, { sourceReportFingerprint: stored.fingerprint, term: item.term, meaning: item.meaning, reason: item.reason, latestDate: date, episodeIds: [stored.episodeId], count: 1 });
      } else {
        existing.count += 1;
        if (!existing.episodeIds.includes(stored.episodeId)) existing.episodeIds.push(stored.episodeId);
      if (date >= existing.latestDate) {
        existing.sourceReportFingerprint = stored.fingerprint;
        existing.term = item.term;
          existing.meaning = item.meaning;
          existing.reason = item.reason;
          existing.latestDate = date;
        }
      }
    }
  }
  return [...map.values()].sort((a, b) => b.latestDate.localeCompare(a.latestDate) || b.count - a.count);
}

export function buildGrowthModel(input: {
  episodes: Episode[];
  studyAttempts: Record<string, StudyAttempt[]>;
  completions: Record<string, Completion>;
  aiReports: StoredAiAssistantReport[];
  liveReports: StoredLearningReport[];
  range: GrowthRange;
  now?: Date;
}): GrowthModel {
  const bounds = growthBounds(input.range, input.now);
  const dimensions = dimensionsForBounds(input.studyAttempts, input.aiReports, input.liveReports, bounds.from, bounds.to);
  const currentOverall = overall(dimensions);
  const previousDimensions = bounds.previousFrom && bounds.previousTo
    ? dimensionsForBounds(input.studyAttempts, input.aiReports, input.liveReports, bounds.previousFrom, bounds.previousTo)
    : [];
  const previousScore = previousDimensions.length ? overall(previousDimensions).score : null;
  const selectedAi = input.aiReports.filter((item) => inBounds(item.report.generatedAt, bounds.from, bounds.to));
  const consolidatedAi = consolidatedReportsForActiveEpisodes(input.aiReports, selectedAi, bounds.to);
  const selectedLive = input.liveReports.filter((item) => inBounds(item.sessionDate, bounds.from, bounds.to));
  const completionEntries = Object.entries(input.completions).filter(([, item]) => inBounds(item.completedAt, bounds.from, bounds.to));
  const activeDates = new Set([
    ...completionEntries.map(([, item]) => item.completedAt.slice(0, 10)),
    ...selectedLive.map((item) => item.sessionDate),
    ...selectedAi.map((item) => item.report.generatedAt.slice(0, 10)),
  ]);
  const episodeById = new Map(input.episodes.map((item) => [item.id, item]));
  const completionByEpisode = new Map(completionEntries);
  const selectedAiByEpisode = groupReportsByEpisode(selectedAi);
  const allAiThroughRange = groupReportsByEpisode(input.aiReports.filter((item) => item.report.generatedAt.slice(0, 10) <= bounds.to));
  const liveByEpisode = new Map<string, StoredLearningReport[]>();
  for (const report of selectedLive) liveByEpisode.set(report.episodeId, [...(liveByEpisode.get(report.episodeId) ?? []), report]);
  const archiveIds = new Set([...completionByEpisode.keys(), ...selectedAiByEpisode.keys(), ...liveByEpisode.keys()]);
  const archive = [...archiveIds].flatMap((episodeId) => {
    const episode = episodeById.get(episodeId);
    if (!episode) return [];
    const completion = completionByEpisode.get(episodeId);
    const selectedAiReports = selectedAiByEpisode.get(episodeId) ?? [];
    const aiReports = [...(allAiThroughRange.get(episodeId) ?? [])].sort((a, b) => reportOrder(b, a));
    const aiReport = consolidateEpisodeAiReports(aiReports);
    const liveReports = (liveByEpisode.get(episodeId) ?? []).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate));
    const latestDate = [completion?.completedAt.slice(0, 10), ...selectedAiReports.map((item) => item.report.generatedAt.slice(0, 10)), liveReports[0]?.sessionDate].filter((value): value is string => !!value).sort().at(-1) ?? '';
    return [{ episode, ...(completion ? { completedAt: completion.completedAt } : {}), ...(aiReport ? { aiReport } : {}), aiReports, liveReports, latestDate }];
  }).sort((a, b) => b.latestDate.localeCompare(a.latestDate));

  return {
    bounds: { from: bounds.from, to: bounds.to },
    dimensions,
    overallScore: currentOverall.score,
    previousScore,
    delta: currentOverall.score !== null && previousScore !== null ? currentOverall.score - previousScore : null,
    coverageWeight: currentOverall.coverage,
    completedCount: completionEntries.length,
    liveCount: selectedLive.length,
    aiReportCount: selectedAi.length,
    aiVideoCount: consolidatedAi.length,
    studyDays: activeDates.size,
    topics: countBy(consolidatedAi.map((item) => item.report.materialAnalysis.primaryTopic)),
    forms: countBy(consolidatedAi.map((item) => item.report.materialAnalysis.contentForm)),
    difficulties: countBy(consolidatedAi.map((item) => item.report.materialAnalysis.subtitleDifficulty)),
    accumulations: buildAccumulations(selectedAi),
    vocabulary: buildVocabularyAccumulations(selectedAi),
    archive,
  };
}
