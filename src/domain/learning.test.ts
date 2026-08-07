import { describe, expect, it } from 'vitest';
import {
  buildLiveMarkdown, buildLivePackage, buildStudyMarkdown, createCustomVideo, createStudyAttempt, episodeExternalKeys,
  externalVideoSourceKey, extractYouTubeVideoId, formatDuration, normalizeExternalVideoSource, safeFileStem, sourceKeys, sourcesToLinks, splitTranscript, suggestKeywords,
  type Episode, type EpisodeTranscript, type Highlight,
} from './learning';
import {
  buildStageReport, createReportTemplate, createStoredReport, parseReportJson, reportFingerprint,
  validateLearningReport,
} from './report';
import { calculateProgress, emptyWorkspace, isWorkspaceState, LEGACY_AI_CONVERSATION_KEY, migrateWorkspace } from './workspace';

const episode: Episode = {
  id: 'teded-p934', source: 'catalog', partNumber: 934,
  title: 'Can you solve the monster duel riddle - Alex Gendler', publishedDate: '2020-12-04', durationSeconds: 336,
  youtube: { url: 'https://youtube.test', videoId: 'abcdefghijk', status: 'verified', title: 'Title', publishedDate: null, matchScore: 1, verification: 'official' },
  bilibili: { url: 'https://bilibili.test', status: 'source-provided' },
};
const transcript: EpisodeTranscript = {
  episodeId: episode.id,
  englishTranscript: 'The monster challenges the champion. The monster guards the bridge.',
  chineseTranscript: '怪物向勇士发起挑战。',
  englishSegments: [], chineseSegments: [],
};
const highlight: Highlight = {
  id: 'h1', episodeId: episode.id, language: 'en', segmentIndex: 0, startOffset: 4, endOffset: 11,
  quote: 'monster', type: 'question', note: 'Why this word?', createdAt: '2026-08-06T00:00:00+08:00',
};

describe('learning helpers', () => {
  it('formats known and unknown durations', () => {
    expect(formatDuration(336)).toBe('5:36');
    expect(formatDuration(null)).toBe('时长待补充');
  });

  it('suggests repeated content words and segments transcripts', () => {
    expect(suggestKeywords(transcript.englishTranscript, 2)).toEqual(['monster', 'challenges']);
    expect(splitTranscript('第一句。第二句。', 'zh')).toEqual(['第一句。第二句。']);
  });

  it('extracts a YouTube id from a timestamped link', () => {
    expect(extractYouTubeVideoId('https://www.youtube.com/watch?v=-61qDRPG3to&t=86s')).toBe('-61qDRPG3to');
  });

  it('normalizes generic external video sources without assuming a platform pair', () => {
    const source = normalizeExternalVideoSource({ platform: 'Netflix', id: 'AbC123', url: 'https://example.com/AbC123' });
    expect(source).toMatchObject({ platform: 'Netflix', id: 'AbC123' });
    expect(externalVideoSourceKey(source!)).toBe('netflix:AbC123');
    expect(normalizeExternalVideoSource({ platform: '', id: 'x' })).toBeNull();
    expect(sourceKeys([source!])).toContain('netflix:AbC123');
  });

  it('derives episode aliases from youtube, bilibili and explicit keys', () => {
    const keys = episodeExternalKeys({ ...episode, sources: [{ platform: 'other', id: 'custom-id' }], externalKeys: ['archive:old-id'] });
    expect(keys).toContain('youtube:abcdefghijk');
    expect(keys).toContain('bilibili-url:https://bilibili.test');
    expect(keys).toContain('other:custom-id');
    expect(keys).toContain('archive:old-id');
  });

  it('creates a video without requiring transcripts', () => {
    const result = createCustomVideo({ title: 'New lesson', publishedDate: '2026-08-06', youtubeUrl: 'https://youtu.be/-61qDRPG3to', bilibiliUrl: '' }, 'custom-1', '2026-08-06T00:00:00+08:00');
    expect(result.source).toBe('custom');
    expect(result.youtube.videoId).toBe('-61qDRPG3to');
    expect(result.englishTranscript).toBe('');
  });

  it('creates and edits videos with generic external sources instead of a fixed platform pair', () => {
    const links = sourcesToLinks([{ platform: 'youtube', id: 'abc123' }, { platform: 'other', id: 'custom-9', url: 'https://example.com/custom-9' }]);
    expect(links).toMatchObject({ youtubeUrl: 'https://www.youtube.com/watch?v=abc123', youtubeVideoId: 'abc123', bilibiliUrl: '' });
    const result = createCustomVideo({ title: 'Generic source video', publishedDate: '2026-08-07', youtubeUrl: '', bilibiliUrl: '', sources: [{ platform: 'other', id: 'custom-9', url: 'https://example.com/custom-9' }] }, 'custom-2', '2026-08-07T00:00:00.000Z');
    expect(result.sources?.[0]).toMatchObject({ platform: 'other', id: 'custom-9' });
    expect(result.externalKeys).toContain('other:custom-9');
    expect(result.youtube.url).toBeNull();
  });

  it('exports highlights in JSON and Markdown', () => {
    const attempt = createStudyAttempt(episode, 'attempt-1', '2026-08-06T00:00:00+08:00');
    attempt.passes.audioOnly = { completedAt: '2026-08-06T00:05:00+08:00', comprehension: 2, captured: ['words'], fragments: 'monster' };
    attempt.passes.visualNoCaptions = { completedAt: '2026-08-06T00:10:00+08:00', comprehension: 4, visualHelp: 'strong', confirmed: ['cause'], gistGuess: 'A duel at a bridge' };
    attempt.passes.transcriptStudy = { ...attempt.passes.transcriptStudy, completedAt: '2026-08-06T00:20:00+08:00', reviewConfirmed: true };
    attempt.recall = { ...attempt.recall, oralCompleted: true, gist: 'A duel', outline: 'bridge', independence: 'with-outline', completedAt: '2026-08-06T00:25:00+08:00' };
    const legacyRecall = { gist: 'Old gist', details: 'Old detail', unclear: 'Old question', confidence: 3, completed: true };
    const payload = buildLivePackage(episode, transcript, attempt, ['monster'], [highlight], '2026-08-06-teded-p934-01', legacyRecall);
    expect(payload.material.highlights[0]).toEqual({ language: 'en', type: 'question', quote: 'monster', note: 'Why this word?' });
    expect(payload.schemaVersion).toBe(4);
    expect(payload.learningEvidence.passes.audioOnly.comprehension).toBe(2);
    expect(payload.learningEvidence.legacyRecall?.note).toContain('历史参考');
    expect(payload.outputContract.reportTemplate.sessionId).toBe('2026-08-06-teded-p934-01');
    const markdown = buildStudyMarkdown(episode, transcript, attempt, ['monster'], [highlight], legacyRecall);
    expect(markdown).toContain('纯听理解自评: 2/5');
    expect(markdown).toContain('看画面理解自评: 4/5');
    expect(markdown).toContain('## Highlight');
    expect(markdown).toContain('Why this word?');
    expect(safeFileStem('A/B: test?')).toBe('A B test');

    const liveMarkdown = buildLiveMarkdown({
      episode, transcript, attempt, keywords: ['monster'], highlights: [highlight],
      sessionId: '2026-08-06-teded-p934-01', legacyRecall, exportedAt: '2026-08-06T09:30:00.000Z',
    });
    expect(liveMarkdown).toContain(`# GPT Live 学习文档：${episode.title}`);
    expect(liveMarkdown).toContain('> 文档版本：luma-gpt-live-markdown/v1');
    expect(liveMarkdown).toContain('## 给 GPT Live 的固定提示词');
    expect(liveMarkdown).toContain('## AI 优化练习重点');
    expect(liveMarkdown).toContain('未使用网页 AI 优化');
    expect(liveMarkdown).toContain('## GPT Live 严格 JSON 报告模板');
    expect(liveMarkdown).toContain('"reportType": "gpt_live"');
    expect(liveMarkdown).toContain('"sessionId": "2026-08-06-teded-p934-01"');
    const template = JSON.parse(liveMarkdown.match(/```json\n([\s\S]*?)\n```/)?.[1] ?? '{}');
    expect(validateLearningReport(template, new Date('2026-08-07T00:00:00.000Z')).valid).toBe(true);
  });
});

describe('workspace helpers', () => {
  it('validates a complete versioned workspace', () => {
    expect(isWorkspaceState(emptyWorkspace)).toBe(true);
    expect(isWorkspaceState({
      ...emptyWorkspace,
      aiConversations: { [episode.id]: [{ id: 'report-message', role: 'assistant', kind: 'ai-report', content: '{"schemaVersion":"luma-ai-assistant-report/v1"}', createdAt: '2026-08-07T00:00:00.000Z' }] },
    })).toBe(true);
    expect(isWorkspaceState({ schemaVersion: 1 })).toBe(false);
    const legacyRecall = { gist: 'Old gist', details: 'Old detail', unclear: 'Old question', confidence: 3, completed: true };
    const legacy = { ...emptyWorkspace, schemaVersion: 2, recalls: { [episode.id]: legacyRecall }, studyAttempts: undefined, activeAttemptIds: undefined, legacyRecalls: undefined };
    const migrated = migrateWorkspace(legacy);
    expect(migrated?.schemaVersion).toBe(6);
    expect(migrated?.legacyRecalls[episode.id]).toEqual(legacyRecall);
    expect(migrated?.studyAttempts).toEqual({});
    expect(migrated?.aiConversations).toEqual({});
    expect(migrated?.aiReports).toEqual([]);
  });

  it('migrates a version 3 workspace and initializes cloud-synced AI history', () => {
    const version3 = { ...emptyWorkspace, schemaVersion: 3, aiConversations: undefined, aiConversation: undefined };
    const migrated = migrateWorkspace(version3);
    expect(migrated?.schemaVersion).toBe(6);
    expect(migrated?.aiConversations).toEqual({});
    expect(migrated?.aiReports).toEqual([]);
  });

  it('migrates a version 4 workspace and initializes AI reports', () => {
    const version4 = { ...emptyWorkspace, schemaVersion: 4, aiConversations: undefined, aiConversation: [], aiReports: undefined };
    const migrated = migrateWorkspace(version4);
    expect(migrated?.schemaVersion).toBe(6);
    expect(migrated?.aiReports).toEqual([]);
  });

  it('migrates the version 5 global conversation into a one-time legacy bucket', () => {
    const messages = [{ id: 'legacy-message', role: 'user', kind: 'conversation', content: 'What does odds mean?', createdAt: '2026-08-07T00:00:00.000Z' }];
    const version5 = { ...emptyWorkspace, schemaVersion: 5, aiConversations: undefined, aiConversation: messages };
    const migrated = migrateWorkspace(version5);
    expect(migrated?.schemaVersion).toBe(6);
    expect(migrated?.aiConversations[LEGACY_AI_CONVERSATION_KEY]).toEqual(messages);
  });

  it('recalculates progress when completion entries change', () => {
    const now = new Date('2026-08-06T12:00:00+08:00');
    const stats = calculateProgress([episode], { [episode.id]: { completedAt: '2026-08-06T10:00:00+08:00' } }, [], now);
    expect(stats.completed).toBe(1);
    expect(stats.todayCount).toBe(1);
    expect(stats.totalMinutes).toBe(6);
    expect(calculateProgress([episode], {}, [], now).completed).toBe(0);
  });
});

describe('GPT learning report contract', () => {
  const valid = createReportTemplate('2026-08-06-teded-p934-01', episode, new Date('2026-08-06T12:00:00+08:00'));

  it('accepts the strict template and produces stable fingerprints', () => {
    const parsed = validateLearningReport(valid, new Date('2026-08-06T12:00:00+08:00'));
    expect(parsed.valid).toBe(true);
    expect(reportFingerprint(valid)).toBe(reportFingerprint(structuredClone(valid)));
    const changed = { ...valid, summary: 'Changed evidence.' };
    expect(reportFingerprint(changed)).not.toBe(reportFingerprint(valid));
    expect(createStoredReport(valid).durationMinutes).toBeNull();
  });

  it('rejects Markdown fences and accepts report arrays', () => {
    expect(parseReportJson(`\`\`\`json\n${JSON.stringify(valid)}\n\`\`\``).errors[0]).toContain('代码围栏');
    expect(parseReportJson(JSON.stringify([valid, valid])).values).toHaveLength(2);
  });

  it('rejects at least ten contract violations with field paths', () => {
    const invalidCases: unknown[] = [
      { ...valid, schemaVersion: 'unknown/v1' },
      { ...valid, sessionId: 'short' },
      { ...valid, episodeId: '' },
      { ...valid, sessionDate: '2099-01-01' },
      { ...valid, durationMinutes: 0, durationSource: 'user_confirmed' },
      { ...valid, durationMinutes: null, durationSource: 'user_confirmed' },
      { ...valid, unexpected: true },
      { ...valid, gist: { ...valid.gist, status: 'guessed' } },
      { ...valid, promptUsage: [{ type: 'magic', target: 'gist', outcome: 'done' }] },
      { ...valid, nextFocus: '' },
    ];
    expect(invalidCases).toHaveLength(10);
    for (const value of invalidCases) expect(validateLearningReport(value, new Date('2026-08-06T12:00:00+08:00')).valid).toBe(false);
  });

  it('keeps GPT time separate and creates a cautious one-report summary', () => {
    const stored = createStoredReport({ ...valid, durationMinutes: 24, durationSource: 'user_confirmed' });
    const stats = calculateProgress([episode], { [episode.id]: { completedAt: '2026-08-06T10:00:00+08:00' } }, [stored], new Date('2026-08-06T12:00:00+08:00'));
    expect(stats.videoMinutes).toBe(6);
    expect(stats.gptMinutes).toBe(24);
    expect(stats.studyDays).toBe(1);
    const stage = buildStageReport([episode], [stored], { [episode.id]: { completedAt: '2026-08-06T10:00:00+08:00' } }, '2026-08-01', '2026-08-07');
    expect(stage.payload.title).toBe('学习记录摘要');
    expect(stage.markdown).toContain('已确认 GPT 巩固时长：24 分钟');
  });
});
