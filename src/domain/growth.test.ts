import { describe, expect, it } from 'vitest';
import { createAiReportTemplate, createStoredAiReport } from './aiReport';
import { buildGrowthModel, practiceAttemptScore } from './growth';
import { createStudyAttempt, type Episode } from './learning';
import { createReportTemplate, createStoredReport } from './report';

const episode: Episode = {
  id: 'teded-p934', source: 'catalog', partNumber: 934, title: 'Monster duel', publishedDate: '2020-12-04', durationSeconds: 336,
  youtube: { url: null, videoId: null, status: 'not-found', title: null, publishedDate: null, matchScore: null, verification: 'unverified' },
  bilibili: { url: '', status: 'missing' },
};

describe('growth evidence model', () => {
  it('does not treat an automatically created empty attempt as zero-score evidence', () => {
    const attempt = createStudyAttempt(episode, 'attempt-empty', '2026-08-07T01:00:00.000Z');
    const model = buildGrowthModel({ episodes: [episode], studyAttempts: { [episode.id]: [attempt] }, completions: {}, aiReports: [], liveReports: [], range: 'all', now: new Date('2026-08-07T12:00:00.000Z') });
    expect(model.dimensions.find((item) => item.id === 'practice')).toMatchObject({ score: null, samples: 0 });
    expect(model.overallScore).toBeNull();
  });

  it('scores a complete practice attempt without using AI or Live evidence', () => {
    const attempt = createStudyAttempt(episode, 'attempt-1', '2026-08-07T01:00:00.000Z');
    attempt.passes.audioOnly = { completedAt: '2026-08-07T01:05:00.000Z', comprehension: 3, captured: [], fragments: '' };
    attempt.passes.visualNoCaptions = { completedAt: '2026-08-07T01:10:00.000Z', comprehension: 4, visualHelp: 'some', confirmed: [], gistGuess: '' };
    attempt.passes.transcriptStudy = { completedAt: '2026-08-07T01:20:00.000Z', reviewConfirmed: true, transcriptCoverage: 'complete', replayedWithoutCaptions: false, postReplayComprehension: null };
    attempt.recall = { mode: 'oral', gist: '', outline: '', retelling: '', oralCompleted: true, independence: 'independent', checks: [], completedAt: '2026-08-07T01:30:00.000Z' };
    expect(practiceAttemptScore(attempt)).toBe(100);
    const model = buildGrowthModel({ episodes: [episode], studyAttempts: { [episode.id]: [attempt] }, completions: {}, aiReports: [], liveReports: [], range: 'all', now: new Date('2026-08-07T12:00:00.000Z') });
    expect(model.overallScore).toBeNull();
    expect(model.dimensions.find((item) => item.id === 'practice')?.score).toBe(100);
  });

  it('shows a completed workbench-only episode in the archive without AI or Live reports', () => {
    const attempt = createStudyAttempt(episode, 'attempt-1', '2026-08-07T01:00:00.000Z');
    attempt.passes.audioOnly = { completedAt: '2026-08-07T01:05:00.000Z', comprehension: 3, captured: [], fragments: '' };
    attempt.passes.visualNoCaptions = { completedAt: '2026-08-07T01:10:00.000Z', comprehension: 4, visualHelp: 'some', confirmed: [], gistGuess: '' };
    attempt.passes.transcriptStudy = { completedAt: '2026-08-07T01:20:00.000Z', reviewConfirmed: true, transcriptCoverage: 'complete', replayedWithoutCaptions: false, postReplayComprehension: null };
    attempt.recall = { mode: 'oral', gist: '', outline: '', retelling: '', oralCompleted: true, independence: 'independent', checks: [], completedAt: '2026-08-07T01:30:00.000Z' };
    const model = buildGrowthModel({
      episodes: [episode],
      studyAttempts: { [episode.id]: [attempt] },
      completions: { [episode.id]: { completedAt: '2026-08-07T01:35:00.000Z' } },
      aiReports: [], liveReports: [], range: 'all', now: new Date('2026-08-07T12:00:00.000Z'),
    });
    expect(model.archive).toHaveLength(1);
    expect(model.archive[0]).toMatchObject({ completedAt: '2026-08-07T01:35:00.000Z', aiReports: [], liveReports: [] });
    expect(model.aiVideoCount).toBe(0);
    expect(model.overallScore).toBeNull();
    expect(model.dimensions.find((item) => item.id === 'practice')?.score).toBe(100);
  });

  it('keeps material analysis, active questions and Live understanding in separate dimensions', () => {
    const ai = createAiReportTemplate(episode, new Date('2026-08-07T02:00:00.000Z'));
    ai.materialAnalysis.subtitleDifficulty = 'B2';
    ai.materialAnalysis.informationDensity = 'high';
    ai.userQuestions = [{ questionKey: 'constraint-usage', label: 'constraint', kind: 'vocabulary', depth: 'usage', question: 'How do I use constraint?', answerSummary: 'A limiting condition.', sourceQuote: '' }];
    ai.recommendations.vocabulary = [{ term: 'champion', meaning: 'winner', reason: 'Key material word.' }];
    ai.recommendations.grammar = [{ pattern: 'if + clause', explanation: 'Use a condition to introduce a possible result.', reason: 'Useful for explaining the puzzle rules.' }];
    const live = createReportTemplate('2026-08-07-teded-p934-01', episode, new Date('2026-08-07T12:00:00.000Z'));
    live.gist.status = 'independent';
    live.details = [{ findingKey: 'condition', label: 'condition', evidence: 'Explained correctly.', status: 'after_question' }];
    live.retelling = { factAccuracy: 'mostly_accurate', structure: 'partial', languageFindings: [] };
    live.transfer.status = 'after_english_hint';
    const storedAi = createStoredAiReport(ai);
    const model = buildGrowthModel({
      episodes: [episode], studyAttempts: {}, completions: {},
      aiReports: [storedAi], liveReports: [createStoredReport(live)], range: 'all', now: new Date('2026-08-07T12:00:00.000Z'),
    });
    expect(model.overallScore).not.toBeNull();
    expect(model.dimensions.find((item) => item.id === 'challenge')?.source).toBe('AI 材料报告');
    expect(model.dimensions.find((item) => item.id === 'understanding')?.source).toBe('GPT Live 报告');
    expect(model.accumulations.map((item) => item.label)).toEqual(['constraint']);
    expect(model.accumulations.map((item) => item.label)).not.toContain('champion');
    expect(model.archive[0].aiReport?.episodeId).toBe(episode.id);
    expect(model.vocabulary.map((item) => item.term)).toEqual(['champion']);
    expect(model.vocabulary[0]).toMatchObject({ meaning: 'winner', count: 1, episodeIds: [episode.id] });
    expect(model.collectionEntries).toEqual(expect.arrayContaining([
      expect.objectContaining({ source: 'user_question', kind: 'vocabulary', label: 'constraint' }),
      expect.objectContaining({ source: 'ai_recommendation', kind: 'vocabulary', label: 'champion' }),
      expect.objectContaining({ source: 'ai_recommendation', kind: 'grammar', label: 'if + clause' }),
    ]));
    expect(model.accumulations[0].sourceReportFingerprint).toBe(storedAi.fingerprint);
    expect(model.vocabulary[0].sourceReportFingerprint).toBe(storedAi.fingerprint);
  });

  it('keeps multiple reports for one video but consolidates growth evidence once per video', () => {
    const first = createAiReportTemplate(episode, new Date('2026-08-06T02:00:00.000Z'));
    first.materialAnalysis = { primaryTopic: 'mathematics_logic', contentForm: 'puzzle', subtitleDifficulty: 'B1', informationDensity: 'low', summary: 'A conditional logic puzzle with a clear sequence of choices.' };
    first.userQuestions = [{ questionKey: 'conditional-choice', label: 'conditional choice', kind: 'grammar', depth: 'analysis', question: 'Why is would used here?', answerSummary: 'It marks a hypothetical result.', sourceQuote: 'would choose' }];
    const second = createAiReportTemplate(episode, new Date('2026-08-07T02:00:00.000Z'));
    second.materialAnalysis.summary = '根据当前学习文件概括本集材料，不评价学习者是否理解。';
    second.userQuestions = [
      { questionKey: 'conditional-choice', label: 'would in conditionals', kind: 'grammar', depth: 'transfer', question: 'Can I use would in another example?', answerSummary: 'Use it in the result clause of a hypothetical condition.', sourceQuote: 'would choose' },
      { questionKey: 'distinguish-usage', label: 'distinguish', kind: 'vocabulary', depth: 'usage', question: 'How do I use distinguish?', answerSummary: 'Use it for recognizing a difference.', sourceQuote: 'distinguish one monster' },
    ];
    const model = buildGrowthModel({
      episodes: [episode], studyAttempts: {}, completions: {},
      aiReports: [
        createStoredAiReport(first, undefined, '2026-08-06T03:00:00.000Z'),
        createStoredAiReport(second, undefined, '2026-08-07T03:00:00.000Z'),
      ],
      liveReports: [], range: 'all', now: new Date('2026-08-07T12:00:00.000Z'),
    });
    expect(model.aiReportCount).toBe(2);
    expect(model.aiVideoCount).toBe(1);
    expect(model.topics).toEqual([{ id: 'mathematics_logic', count: 1 }]);
    expect(model.forms).toEqual([{ id: 'puzzle', count: 1 }]);
    expect(model.dimensions.find((item) => item.id === 'challenge')).toMatchObject({ score: 48, samples: 1 });
    expect(model.dimensions.find((item) => item.id === 'questions')?.samples).toBe(2);
    expect(model.accumulations).toHaveLength(2);
    expect(model.accumulations.find((item) => item.questionKey === 'conditional-choice')).toMatchObject({ count: 1 });
    expect(model.accumulations.find((item) => item.questionKey === 'conditional-choice')?.answerSummary).toContain('result clause');
    expect(model.archive[0].aiReports).toHaveLength(2);
    expect(model.archive[0].aiReport?.report.materialAnalysis).toMatchObject({ primaryTopic: 'mathematics_logic', contentForm: 'puzzle', subtitleDifficulty: 'B1', informationDensity: 'low' });
    expect(model.archive[0].aiReport?.report.userQuestions).toHaveLength(2);
  });

  it('counts a repeated AI recommendation once per related video', () => {
    const secondEpisode = { ...episode, id: 'teded-p933', title: 'Power plant' };
    const first = createAiReportTemplate(episode, new Date('2026-08-06T02:00:00.000Z'));
    first.recommendations = {
      vocabulary: [{ term: 'outcome', meaning: 'result', reason: 'Subtitle term.' }],
      grammar: [{ pattern: 'if + clause', explanation: 'A condition.', reason: 'Subtitle structure.' }],
    };
    const revision = createAiReportTemplate(episode, new Date('2026-08-07T02:00:00.000Z'));
    revision.recommendations = {
      vocabulary: [{ term: 'outcome', meaning: 'result', reason: 'A refined note from the same video.' }],
      grammar: [{ pattern: 'if + clause', explanation: 'A refined condition note.', reason: 'The same structure from the same video.' }],
    };
    const related = createAiReportTemplate(secondEpisode, new Date('2026-08-08T02:00:00.000Z'));
    related.recommendations = {
      vocabulary: [{ term: 'outcome', meaning: 'result', reason: 'The term also appears in another video.' }],
      grammar: [{ pattern: 'if + clause', explanation: 'A condition in another video.', reason: 'The structure also appears in another video.' }],
    };
    const model = buildGrowthModel({
      episodes: [episode, secondEpisode], studyAttempts: {}, completions: {},
      aiReports: [
        createStoredAiReport(first, undefined, '2026-08-06T03:00:00.000Z'),
        createStoredAiReport(revision, undefined, '2026-08-07T03:00:00.000Z'),
        createStoredAiReport(related, undefined, '2026-08-08T03:00:00.000Z'),
      ],
      liveReports: [], range: 'all', now: new Date('2026-08-08T12:00:00.000Z'),
    });
    expect(model.vocabulary.find((item) => item.term === 'outcome')).toMatchObject({ count: 2, episodeIds: [episode.id, secondEpisode.id] });
    expect(model.collectionEntries.find((item) => item.id === 'grammar:if + clause')).toMatchObject({ count: 2, episodeIds: [episode.id, secondEpisode.id] });
  });

  it('uses the current library title in the archive after a title override', () => {
    const report = createAiReportTemplate(episode, new Date('2026-08-07T02:00:00.000Z'));
    report.materialAnalysis.summary = 'A concise explanation of a test concept.';
    report.limitations = [];
    const renamed = { ...episode, title: 'Monster duel (renamed)' };
    const model = buildGrowthModel({
      episodes: [renamed],
      studyAttempts: {},
      completions: {},
      aiReports: [createStoredAiReport(report)],
      liveReports: [],
      range: 'all',
      now: new Date('2026-08-07T12:00:00.000Z'),
    });
    expect(model.archive[0].episode.title).toBe('Monster duel (renamed)');
    expect(model.archive[0].aiReport?.report.episodeTitle).toBe('Monster duel');
  });
});
