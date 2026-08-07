import { describe, expect, it } from 'vitest';
import { createAiReportTemplate } from './aiReport';
import type { Episode } from './learning';
import {
  applyLearningReturnPackage, createReturnEpisode, LEARNING_RETURN_PACKAGE_SCHEMA, planLearningReturnPackage,
  validateLearningReturnPackage, type LearningReturnPackage,
} from './learningReturn';
import { createReportTemplate } from './report';
import { emptyWorkspace, episodeAliasIndex, migrateEpisodeIdentity } from './workspace';

const episode: Episode = {
  id: 'teded-p1',
  source: 'catalog',
  partNumber: 1,
  title: 'Existing video',
  publishedDate: '2026-08-07',
  durationSeconds: 300,
  youtube: { url: 'https://www.youtube.com/watch?v=abc123', videoId: 'abc123', status: 'verified', title: null, publishedDate: null, matchScore: 1, verification: 'official' },
  bilibili: { url: 'https://www.bilibili.com/video/BV1xx?p=1', status: 'source-provided' },
};

function validPackage(overrides: Partial<LearningReturnPackage> = {}): LearningReturnPackage {
  const base: LearningReturnPackage = {
    schemaVersion: LEARNING_RETURN_PACKAGE_SCHEMA,
    packageType: 'learning-return',
    video: {
      episodeId: null,
      title: 'Returned video',
      publishedDate: '2026-08-07',
      durationSeconds: 330,
      sources: [{ platform: 'youtube', id: 'dream456', url: 'https://www.youtube.com/watch?v=dream456' }],
    },
    transcript: { english: 'English return.', chinese: '中文回填。', source: 'ai-collected' },
    keywords: ['return', 'ledger'],
    highlights: [{ language: 'en', type: 'key', quote: 'English return', note: 'backfilled' }],
    questionLedger: [{
      questionKey: 'meaning-of-return',
      label: 'return 的含义',
      kind: 'vocabulary',
      depth: 'usage',
      question: 'What does return mean here?',
      answerSummary: 'It means coming back.',
      sourceQuote: 'English return.',
      stage: 'transcript-study',
      status: 'resolved',
    }],
    classification: { primaryTopic: 'science_technology', contentForm: 'explainer', subtitleDifficulty: 'B1', informationDensity: 'medium' },
    attempt: {
      createdAt: '2026-08-07T01:00:00.000Z',
      passes: {
        audioOnly: { completedAt: '2026-08-07T01:05:00.000Z', comprehension: 3, captured: ['phrases'], fragments: 'return' },
        visualNoCaptions: { completedAt: '2026-08-07T01:10:00.000Z', comprehension: 4, visualHelp: 'some', confirmed: ['topic'], gistGuess: 'return topic' },
        transcriptStudy: { completedAt: '2026-08-07T01:20:00.000Z', reviewConfirmed: true, transcriptCoverage: 'complete', replayedWithoutCaptions: false, postReplayComprehension: 5 },
      },
      recall: { mode: 'written', oralCompleted: false, retelling: 'It returns.', gist: 'return', outline: 'one\ntwo', checks: ['gist'], independence: 'independent', completedAt: '2026-08-07T01:30:00.000Z' },
    },
    aiReports: [],
    liveReports: [],
    meta: { generatedBy: 'test-ai', returnedAt: '2026-08-07T02:00:00.000Z', notes: '' },
  };
  return { ...base, ...overrides };
}

describe('learning return package', () => {
  it('validates a complete package and keeps structured ledger entries', () => {
    const validation = validateLearningReturnPackage(validPackage());
    expect(validation.valid).toBe(true);
    if (!validation.valid) return;
    expect(validation.package.questionLedger[0].stage).toBe('transcript-study');
    expect(validation.package.attempt.recall.independence).toBe('independent');
    expect(validation.warnings.some((item) => item.includes('AI 收集'))).toBe(true);
  });

  it('rejects missing identity, invalid enums and contract fields', () => {
    expect(validateLearningReturnPackage(validPackage({ video: { ...validPackage().video, title: '' } })).valid).toBe(false);
    const bad = validPackage();
    (bad.attempt.passes.audioOnly as { comprehension: number }).comprehension = 9;
    expect(validateLearningReturnPackage(bad).valid).toBe(false);
    const extra = validPackage({ ...({} as Partial<LearningReturnPackage>) }) as unknown as Record<string, unknown>;
    extra.unexpected = true;
    expect(validateLearningReturnPackage(extra).valid).toBe(false);
  });

  it('plans a new custom video and then creates it with transcript, attempt, ledger and reports', () => {
    const pkg = validPackage();
    pkg.aiReports = [createAiReportTemplate({ id: 'pending-video', title: 'Returned video' }, new Date('2026-08-07T02:00:00.000Z'))];
    pkg.liveReports = [createReportTemplate('live-return-1', { id: 'pending-video', title: 'Returned video' }, new Date('2026-08-07T02:00:00.000Z'))];
    const plan = planLearningReturnPackage(pkg, [episode], emptyWorkspace);
    expect(plan.match).toMatchObject({ kind: 'new' });
    const result = applyLearningReturnPackage(emptyWorkspace, pkg, { newEpisodeId: 'custom-return-1', markCompleted: true, now: '2026-08-07T02:00:00.000Z' });
    expect(result.episodeId).toBe('custom-return-1');
    expect(result.summary.createdVideo).toBe(true);
    expect(result.summary.attemptsWritten).toBe(1);
    expect(result.summary.aiReportsAdded).toBe(1);
    expect(result.summary.liveReportsAdded).toBe(1);
    expect(result.summary.markedCompleted).toBe(true);
    expect(result.workspace.customVideos[0].englishTranscript).toContain('English return');
    expect(result.workspace.studyAttempts['custom-return-1'][0].recall.independence).toBe('independent');
    expect(result.workspace.questionLedgers?.['custom-return-1']).toHaveLength(1);
    expect(result.workspace.episodeKeywords?.['custom-return-1']).toContain('return');
    expect(result.workspace.aiReports[0].episodeId).toBe('custom-return-1');
    expect(result.workspace.reports[0].episodeId).toBe('custom-return-1');
  });

  it('matches an existing episode by generic external alias before creating a new video', () => {
    const pkg = validPackage({ video: { ...validPackage().video, episodeId: 'teded-p1' } });
    const workspace = { ...emptyWorkspace, episodeAliases: episodeAliasIndex([episode]).aliases };
    const plan = planLearningReturnPackage(pkg, [episode], workspace);
    expect(plan.match).toMatchObject({ kind: 'existing', confidence: 'episodeId' });
    const result = applyLearningReturnPackage(workspace, pkg, { existingEpisodes: [episode], now: '2026-08-07T02:00:00.000Z' });
    expect(result.summary.createdVideo).toBe(false);
    expect(result.workspace.transcriptOverrides['teded-p1']).toMatchObject({ englishTranscript: 'English return.' });
  });

  it('migrates reports after a catalog rebuild using the persisted alias history', () => {
    const oldEpisode: Episode = { ...episode, id: 'teded-p900' };
    const oldIndex = episodeAliasIndex([oldEpisode]);
    const workspace = {
      ...emptyWorkspace,
      episodeAliases: oldIndex.aliases,
      episodeAliasHistory: oldIndex.history,
      aiReports: [{
        episodeId: 'teded-p900', importedAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z', fingerprint: 'f1',
        report: { ...createAiReportTemplate(oldEpisode, new Date('2026-08-07T00:00:00.000Z')), episodeId: 'teded-p900' },
      }],
    };
    const migrated = migrateEpisodeIdentity(workspace, [episode]);
    expect(migrated.aiReports[0].episodeId).toBe('teded-p1');
    expect(migrated.aiReports[0].report.episodeId).toBe('teded-p1');
  });

  it('builds a custom episode with generic sources and no fabricated bilibili url', () => {
    const created = createReturnEpisode(validPackage({ video: { ...validPackage().video, sources: [{ platform: 'bilibili', id: 'BV1xx', url: 'https://www.bilibili.com/video/BV1xx?p=1' }] } }), 'custom-2');
    expect(created.sources?.[0]).toMatchObject({ platform: 'bilibili', id: 'BV1xx' });
    expect(created.bilibili.url).toBe('https://www.bilibili.com/video/BV1xx?p=1');
    expect(created.youtube.url).toBeNull();
  });
});
