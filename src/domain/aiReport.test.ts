import { describe, expect, it } from 'vitest';
import {
  aiReportFingerprint, createAiReportTemplate, createStoredAiReport, parseAiReportJson,
  validateAiAssistantReport,
} from './aiReport';

const episode = { id: 'teded-p934', title: 'Monster duel' };

describe('AI assistant report contract', () => {
  it('accepts the strict template and keeps fingerprints stable', () => {
    const report = createAiReportTemplate(episode, new Date('2026-08-07T04:00:00.000Z'));
    const validation = validateAiAssistantReport(report);
    expect(validation.valid).toBe(true);
    expect(aiReportFingerprint(report)).toBe(aiReportFingerprint(structuredClone(report)));
    expect(createStoredAiReport(report, undefined, '2026-08-07T05:00:00.000Z').episodeId).toBe(episode.id);
  });

  it('ignores display title changes when detecting the same report', () => {
    const report = createAiReportTemplate(episode, new Date('2026-08-07T04:00:00.000Z'));
    report.materialAnalysis.summary = 'A concise explanation of a test concept.';
    report.limitations = [];
    expect(aiReportFingerprint(report)).toBe(aiReportFingerprint({ ...report, episodeTitle: 'Monster duel (renamed)' }));
  });

  it('rejects arrays, Markdown fences, contract fields and identity gaps', () => {
    const report = createAiReportTemplate(episode, new Date('2026-08-07T04:00:00.000Z'));
    expect(parseAiReportJson(JSON.stringify([report])).errors[0]).toContain('一次只导入');
    expect(parseAiReportJson(`\`\`\`json\n${JSON.stringify(report)}\n\`\`\``).errors[0]).toContain('代码围栏');
    expect(validateAiAssistantReport({ ...report, unexpected: true }).valid).toBe(false);
    expect(validateAiAssistantReport({ ...report, episodeId: '' }).valid).toBe(false);
    expect(validateAiAssistantReport({ ...report, reportType: 'gpt_live' }).valid).toBe(false);
  });

  it('warns when no active questions or difficulty evidence exists', () => {
    const validation = validateAiAssistantReport(createAiReportTemplate(episode));
    expect(validation.valid && validation.warnings).toEqual(expect.arrayContaining([
      expect.stringContaining('主动问题'),
      expect.stringContaining('字幕难度未知'),
    ]));
  });
});
