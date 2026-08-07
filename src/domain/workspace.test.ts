import { describe, expect, it } from 'vitest';
import { emptyWorkspace, effectiveEpisode, episodeAliasIndex, findEpisodeByExternalKeys, isWorkspaceState, migrateEpisodeIdentity, migrateWorkspace } from './workspace';
import type { Episode } from './learning';

const episode: Episode = {
  id: 'teded-p1',
  source: 'catalog',
  partNumber: 1,
  title: 'Original title',
  publishedDate: '2026-01-01',
  durationSeconds: 300,
  youtube: {
    url: 'https://www.youtube.com/watch?v=abc123',
    videoId: 'abc123',
    status: 'verified',
    title: null,
    publishedDate: null,
    matchScore: 1,
    verification: 'official',
  },
  bilibili: { url: 'https://www.bilibili.com/video/BV1xx?p=1', status: 'source-provided' },
  englishTranscript: '',
  chineseTranscript: '',
};

describe('workspace identity and link overrides', () => {
  it('keeps the episode id stable when title, date and links change', () => {
    const updated = effectiveEpisode(
      episode,
      { title: 'New title', publishedDate: '2026-02-01' },
      { youtubeUrl: 'https://youtu.be/xyz789', bilibiliUrl: null, updatedAt: '2026-08-07T00:00:00.000Z' },
    );
    expect(updated.id).toBe('teded-p1');
    expect(updated.title).toBe('New title');
    expect(updated.publishedDate).toBe('2026-02-01');
    expect(updated.youtube.url).toBe('https://youtu.be/xyz789');
    expect(updated.youtube.videoId).toBe('xyz789');
    expect(updated.youtube.status).toBe('user-provided');
    expect(updated.bilibili.url).toBe('');
    expect(updated.bilibili.status).toBe('not-provided');
    expect(updated.thumbnailUrl).toBe('https://i.ytimg.com/vi/xyz789/hqdefault.jpg');
  });

  it('applies a generic external source override instead of a fixed youtube/bilibili pair', () => {
    const updated = effectiveEpisode(episode, undefined, { sources: [{ platform: 'other', id: 'custom-9', url: 'https://example.com/custom-9' }], updatedAt: '2026-08-07T00:00:00.000Z' });
    expect(updated.sources?.[0]).toMatchObject({ platform: 'other', id: 'custom-9' });
    expect(updated.externalKeys).toContain('other:custom-9');
    expect(updated.youtube.url).toBeNull();
    expect(updated.bilibili.url).toBe('');
  });

  it('keeps old v6 backups readable without linkOverrides', () => {
    const legacy = { ...emptyWorkspace, linkOverrides: undefined };
    expect(isWorkspaceState(legacy)).toBe(true);
    expect(effectiveEpisode(episode, { title: 'T' }).id).toBe('teded-p1');
  });

  it('adds a linkOverrides container when migrating old workspaces', () => {
    const migrated = migrateWorkspace({
      schemaVersion: 1,
      customVideos: [],
      recalls: {},
      metadataOverrides: {},
      transcriptOverrides: {},
      highlights: [],
      completions: {},
      preferences: { theme: 'system' },
    });
    expect(migrated?.linkOverrides).toEqual({});
    expect(migrated?.hiddenEpisodeIds).toEqual([]);
  });

  it('builds generic external aliases from catalog sources and custom keys', () => {
    const indexed = episodeAliasIndex([episode, { ...episode, id: 'custom-1', source: 'custom', youtube: { ...episode.youtube, videoId: 'xyz789', url: 'https://youtu.be/xyz789' }, externalKeys: ['netflix:abc123'] }]);
    expect(indexed.aliases['youtube:abc123']).toBe('teded-p1');
    expect(indexed.aliases['netflix:abc123']).toBe('custom-1');
    expect(indexed.history['teded-p1']).toContain('bilibili-url:https://www.bilibili.com/video/BV1xx?p=1');
  });

  it('migrates reports and learning records to the new episode id after a catalog rebuild', () => {
    const oldEpisode = { ...episode, id: 'teded-p1000' };
    const oldAliases = episodeAliasIndex([oldEpisode]);
    const workspace = {
      ...emptyWorkspace,
      episodeAliases: oldAliases.aliases,
      episodeAliasHistory: oldAliases.history,
      reports: [{
        sessionId: 'live-1', episodeId: 'teded-p1000', sessionDate: '2026-08-07', durationMinutes: null, durationSource: 'unknown' as const,
        importedAt: '2026-08-07T00:00:00.000Z', updatedAt: '2026-08-07T00:00:00.000Z', fingerprint: 'f1',
        report: { schemaVersion: 'luma-live-report/v2' as const, reportType: 'gpt_live' as const, sessionId: 'live-1', episodeId: 'teded-p1000', episodeTitle: 'T', sessionDate: '2026-08-07', durationMinutes: null, durationSource: 'unknown' as const, summary: 's', gist: { status: 'not_assessed' as const, evidence: '', missingConcepts: [] }, details: [], promptUsage: [], keywordOutcomes: [], retelling: { factAccuracy: 'not_assessed' as const, structure: 'not_assessed' as const, languageFindings: [] }, transfer: { status: 'not_assessed' as const, evidence: '' }, strengths: [], gaps: [], nextFocus: 'n', assessmentBasis: 'mixed' as const, assessmentConfidence: 'medium' as const, limitations: [] },
      }],
      completions: { 'teded-p1000': { completedAt: '2026-08-07T00:00:00.000Z' } },
    };
    const next = episodeAliasIndex([episode]);
    const migrated = migrateEpisodeIdentity(workspace, [episode]);
    expect(migrated.reports[0].episodeId).toBe('teded-p1');
    expect(migrated.reports[0].report.episodeId).toBe('teded-p1');
    expect(migrated.completions['teded-p1']).toBeDefined();
    expect(migrated.episodeAliases?.['youtube:abc123']).toBe('teded-p1');
    expect(migrated.episodeAliasHistory?.['teded-p1000']).toContain('youtube:abc123');
    expect(next.aliases['youtube:abc123']).toBe('teded-p1');
  });

  it('finds an existing episode by external keys through the alias index', () => {
    const workspace = { ...emptyWorkspace, episodeAliases: { 'youtube:abc123': 'teded-p1' } };
    expect(findEpisodeByExternalKeys([episode], workspace, ['youtube:abc123'])?.id).toBe('teded-p1');
    expect(findEpisodeByExternalKeys([episode], workspace, ['missing-key'])).toBeNull();
  });
});
