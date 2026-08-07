import { describe, expect, it } from 'vitest';
import {
  aiFocusSourceKey, aiReportQuestion, aiReportRetryQuestion, buildBlankIntegratedLearningMarkdown, buildLearningFile, checkGeneratedAiReport, conversationRevision, createAiRequest, livePracticeQuestion,
  missingEvidenceQuestion, missingLearningEvidence, parseGeneratedAiReportJson, validateAiLiveFocusMarkdown,
} from './aiStudy';
import { createAiReportTemplate } from './aiReport';
import type { Episode, EpisodeTranscript, StudyAttempt } from './learning';

const episode: Episode = {
  id: 'teded-p1', source: 'catalog', partNumber: 1, title: 'A test episode', publishedDate: '2026-08-07', durationSeconds: 300,
  youtube: { url: 'https://www.youtube.com/watch?v=test', videoId: 'test', status: 'verified', title: null, publishedDate: null, matchScore: 1, verification: 'test' },
  bilibili: { url: 'https://www.bilibili.com/video/test?p=1', status: 'verified' },
};

const transcript: EpisodeTranscript = {
  episodeId: episode.id,
  englishTranscript: 'English transcript.',
  chineseTranscript: '中文字幕。',
  englishSegments: ['English transcript.'],
  chineseSegments: ['中文字幕。'],
};

const attempt: StudyAttempt = {
  attemptId: 'attempt-1', episodeId: episode.id, createdAt: '2026-08-07T00:00:00.000Z',
  passes: {
    audioOnly: { completedAt: null, comprehension: 2, captured: ['words'], fragments: 'a phrase' },
    visualNoCaptions: { completedAt: null, comprehension: 3, visualHelp: 'some', confirmed: ['topic'], gistGuess: 'a guess' },
    transcriptStudy: { completedAt: null, reviewConfirmed: false, transcriptCoverage: 'complete', replayedWithoutCaptions: null, postReplayComprehension: 4 },
  },
  recall: { mode: 'oral', oralCompleted: true, retelling: '', gist: 'gist', outline: 'outline', checks: ['gist'], independence: 'with-outline', completedAt: null },
};

describe('AI assistant request contract', () => {
  it('builds the current learning file with bilingual material and learning evidence', () => {
    const file = buildLearningFile({
      episode, transcript, attempt, keywords: ['phrase', 'phrase', ' grammar '],
      highlights: [{ id: 'h1', episodeId: episode.id, language: 'en', segmentIndex: 0, startOffset: 0, endOffset: 7, quote: 'English', type: 'question', note: 'meaning?', createdAt: '2026-08-07T00:00:00.000Z' }],
      importedAt: '2026-08-07T01:00:00.000Z',
    });
    expect(file.episode.links.youtube).toContain('youtube.com');
    expect(file.schemaVersion).toBe(2);
    expect(file.attemptId).toBe('attempt-1');
    expect(file.transcript).toEqual({ english: 'English transcript.', chinese: '中文字幕。', coverage: 'complete' });
    expect(file.transcriptSource).toBe('catalog');
    expect(file.classification).toEqual({ primaryTopic: 'other', contentForm: 'other', subtitleDifficulty: 'unknown', informationDensity: 'unknown' });
    expect(file.keywords).toEqual(['phrase', 'grammar']);
    expect(file.highlights[0]).toEqual({ language: 'en', type: 'question', quote: 'English', note: 'meaning?' });
    expect(file.evidence.passes.audioOnly.comprehension).toBe(2);
    expect(file.evidence.recall.independence).toBe('with-outline');
    expect(file.markdown).toContain('# Luma 英语视频学习协作文档：A test episode');
    expect(file.markdown).toContain('luma-integrated-ai-learning-markdown/v3');
    expect(file.markdown).toContain('## 视频分类');
    expect(file.markdown).toContain('## 字幕来源');
    expect(file.markdown).toContain('## 结构化问题台账');
    expect(file.markdown).toContain('## 学习回填包输出规则');
    expect(file.markdown).toContain('luma-learning-return-package/v1');
    expect(file.markdown).toContain('## AI 助手报告 JSON 模板');
    expect(file.markdown).toContain('"schemaVersion": "luma-ai-assistant-report/v1"');
    expect(file.markdown).toContain('## GPT Live 报告 JSON 模板');
    expect(file.markdown).toContain('"schemaVersion": "luma-live-report/v2"');
  });

  it('starts safely from a blank portable template and asks for the video first', () => {
    const markdown = buildBlankIntegratedLearningMarkdown('2026-08-07T01:00:00.000Z');
    expect(markdown).toContain('episodeId：pending-video');
    expect(markdown).toContain('第一条回复只能先询问“这次要学习什么视频？请提供标题或视频链接”');
    expect(markdown).toContain('不能伪造可导入 ID');
    expect(markdown).toContain('`episodeId` 是工作台稳定身份');
    expect(markdown).toContain('## 输出契约与成功标准');
    expect(markdown).toContain('## 学习回填包输出规则');
    expect(markdown).toContain('"schemaVersion": "luma-ai-assistant-report/v1"');
    expect(markdown).toContain('"schemaVersion": "luma-live-report/v2"');
  });

  it('preserves mid-stage evidence and learner questions without requiring optional notes', () => {
    const midStage = structuredClone(attempt);
    midStage.passes.audioOnly.completedAt = '2026-08-07T01:10:00.000Z';
    midStage.passes.audioOnly.comprehension = 3;
    midStage.passes.audioOnly.captured = [];
    midStage.passes.audioOnly.fragments = '';
    const markdown = buildLearningFile({
      episode, transcript, attempt: midStage, keywords: [], highlights: [], importedAt: '2026-08-07T01:20:00.000Z',
      conversation: [
        { id: 'q1', role: 'user', kind: 'conversation', content: 'Does "odds" mean probability here?', createdAt: '2026-08-07T01:11:00.000Z' },
        { id: 'a1', role: 'assistant', kind: 'conversation', content: 'Yes, here it refers to the probability of winning.', createdAt: '2026-08-07T01:12:00.000Z' },
      ],
    }).markdown;
    expect(markdown).toContain('"comprehension": 3');
    expect(markdown).toContain('Does "odds" mean probability here?');
    expect(markdown).toContain('听到的词、片段或大意都是可选记录');
    expect(markdown).toContain('一句主旨猜测属于可选记录');
    expect(markdown).toContain('未确认的字段保留原空值、null、空数组');
    expect(markdown).toContain('标题与旧报告不同不代表换了视频');
  });

  it('defines a completed workflow with separate AI and actual GPT Live outputs', () => {
    const completed = structuredClone(attempt);
    const completedAt = '2026-08-07T02:00:00.000Z';
    completed.passes.audioOnly.completedAt = completedAt;
    completed.passes.visualNoCaptions.completedAt = completedAt;
    completed.passes.transcriptStudy.completedAt = completedAt;
    completed.recall.completedAt = completedAt;
    const markdown = buildLearningFile({ episode, transcript, attempt: completed, keywords: [], highlights: [], importedAt: completedAt }).markdown;
    expect(markdown).toContain('## GPT Live 教练协议');
    expect(markdown).toContain('只有本次 Live 中真实发生的回答、提示、复述和迁移任务才能进入 GPT Live 报告');
    expect(markdown).toContain('“导出两份报告”');
    expect(markdown).toContain('两份对象不得合并成数组，也不得互相借用证据');
    expect(markdown).toContain('## AI 助手报告 JSON 模板');
    expect(markdown).toContain('## GPT Live 报告 JSON 模板');
    expect(markdown).toContain('## 视频分类');
  });

  it('retains the complete conversation history without truncating messages', () => {
    const history = Array.from({ length: 36 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `message-${index}` }));
    const request = createAiRequest({ action: 'chat', question: 'new question', history });
    expect(request.history).toHaveLength(36);
    expect(request.history[0].content).toBe('message-0');
    expect(request.history.at(-1)?.content).toBe('message-35');
  });

  it('does not shorten the content of earlier messages', () => {
    const content = `start-${'x'.repeat(4000)}-end`;
    const request = createAiRequest({ action: 'chat', question: 'new question', history: [{ role: 'user', content }] });
    expect(request.history[0].content).toBe(content);
  });

  it('creates a Live practice request that carries conversation history and the current learning file', () => {
    const file = buildLearningFile({ episode, transcript, attempt, keywords: [], highlights: [], importedAt: '2026-08-07T01:00:00.000Z' });
    const request = createAiRequest({
      action: 'generate_live_practice', question: livePracticeQuestion(),
      history: [{ role: 'user', content: '中文翻译里的时态对吗？' }, { role: 'assistant', content: '这里应使用过去完成时。' }], learningFile: file,
    });
    expect(request.action).toBe('generate_live_practice');
    expect(request.history).toHaveLength(2);
    expect(request.learningFile).toMatchObject({ schemaVersion: 3, format: 'markdown', episodeId: episode.id, attemptId: attempt.attemptId });
    expect(request.learningFile?.content).toContain('## 中文字幕（可能有误）');
    expect(request.learningFile?.content).toContain('中文字幕。');
    expect(request.question).toContain('AI 优化练习重点');
  });

  it('passes the selected provider override through to the request', () => {
    const request = createAiRequest({
      action: 'chat',
      question: 'what does this mean?',
      history: [],
      provider: {
        providerId: 'p1',
        label: 'Test API',
        protocol: 'openai-compatible-chat',
        baseUrl: 'https://api.test.example',
        model: 'test-model',
        apiKey: 'sk-test',
        maxOutputTokens: 2048,
      },
    });
    expect(request.provider).toMatchObject({
      providerId: 'p1',
      label: 'Test API',
      protocol: 'openai-compatible-chat',
      baseUrl: 'https://api.test.example',
      model: 'test-model',
      apiKey: 'sk-test',
      maxOutputTokens: 2048,
    });
    const withoutProvider = createAiRequest({ action: 'chat', question: 'hello', history: [] });
    expect(withoutProvider.provider).toBeUndefined();
  });

  it('creates an AI report request with the Markdown attachment and complete conversation', () => {
    const file = buildLearningFile({ episode, transcript, attempt, keywords: [], highlights: [], importedAt: '2026-08-07T01:00:00.000Z' });
    const history = Array.from({ length: 42 }, (_, index) => ({ role: index % 2 ? 'assistant' as const : 'user' as const, content: `report-message-${index}` }));
    const request = createAiRequest({ action: 'generate_ai_report', question: aiReportQuestion(), history, learningFile: file });
    expect(request.action).toBe('generate_ai_report');
    expect(request.history).toHaveLength(42);
    expect(request.learningFile?.format).toBe('markdown');
    expect(request.learningFile?.content).toContain('luma-ai-assistant-report/v1');
    expect(request.learningFile?.content).toContain('## AI 助手报告填写要求');
    expect(request.learningFile?.content).toContain('已提供，必须完成主题、形式、CEFR 难度和信息密度分类');
    expect(request.question).toContain('不得用 other / unknown 逃避判断');
    expect(request.question).toContain('questionKey、label、kind、depth、question、answerSummary、sourceQuote');
    expect(request.question).toContain('数组中不能放字符串');
    expect(request.question).toContain('没有 confidence、tags、learningProfile、notes 等额外键');
  });

  it('adds a compact generation instruction when the model output budget is low', () => {
    expect(aiReportQuestion({ compact: true })).toContain('当前模型输出上限较低');
  });

  it('requires an empty userQuestions array when the ordinary conversation has no real learner question', () => {
    const prompt = aiReportQuestion();
    expect(prompt.length).toBeLessThan(4000);
    expect(prompt).toContain('报告生成要求本身不算问题');
    expect(prompt).toContain('没有真实问题时必须是 []');
    expect(prompt).toContain('没有把 AI 推荐伪装成用户问题');
  });

  it('allows unknown material fields only when the English transcript is unavailable', () => {
    const missingTranscript = { ...transcript, englishTranscript: '', englishSegments: [] };
    const file = buildLearningFile({ episode, transcript: missingTranscript, attempt, keywords: [], highlights: [], importedAt: '2026-08-07T01:00:00.000Z' });
    expect(file.markdown).toContain('未提供，可对无法判断的难度和密度使用 unknown');
    expect(file.markdown).toContain('只在没有可用英文字幕时使用 unknown');
  });

  it('unwraps only a single complete JSON fence for generated AI reports', () => {
    const json = '{"schemaVersion":"luma-ai-assistant-report/v1"}';
    expect(parseGeneratedAiReportJson(`\`\`\`json\n${json}\n\`\`\``)).toEqual({ value: { schemaVersion: 'luma-ai-assistant-report/v1' }, errors: [] });
    expect(parseGeneratedAiReportJson(`说明\n\`\`\`json\n${json}\n\`\`\``).errors).not.toEqual([]);
  });

  it('accepts a complete generated AI report before it reaches the import action', () => {
    const report = createAiReportTemplate(episode, new Date('2026-08-07T02:00:00.000Z'));
    report.materialAnalysis = { primaryTopic: 'science_technology', contentForm: 'explainer', subtitleDifficulty: 'B1', informationDensity: 'medium', summary: 'A concise explanation of a test concept.' };
    report.limitations = [];
    expect(checkGeneratedAiReport(JSON.stringify(report), episode.id)).toMatchObject({ valid: true, report: { episodeId: episode.id } });
  });

  it('detects an unterminated JSON string as a retryable generation failure', () => {
    const check = checkGeneratedAiReport('{"schemaVersion":"luma-ai-assistant-report/v1","reportType":"ai_assistant","episodeId":"teded-p1","summary":"unfinished', episode.id);
    expect(check).toMatchObject({ valid: false });
    if (!check.valid) expect(check.error).toContain('JSON 语法错误');
  });

  it('rejects a complete report for another video and builds a compact retry instruction', () => {
    const report = createAiReportTemplate({ ...episode, id: 'teded-p2' }, new Date('2026-08-07T02:00:00.000Z'));
    report.materialAnalysis.summary = 'A complete report for a different episode.';
    report.limitations = [];
    expect(checkGeneratedAiReport(JSON.stringify(report), episode.id)).toMatchObject({ valid: false, error: expect.stringContaining('当前视频') });
    const retry = aiReportRetryQuestion(aiReportQuestion(), '模型达到单次输出上限');
    expect(retry).toContain('保留全部真实 userQuestions');
    expect(retry).toContain('必须闭合所有字符串、数组和对象');
    expect(retry).toContain('lookup / usage / analysis / comparison / transfer 中的一个英文代码');
    expect(retry).toContain('最后强制校验');
    expect(retry.lastIndexOf('上一份失败原因')).toBeGreaterThan(retry.lastIndexOf('原生成要求如下'));
    expect(retry.length).toBeLessThan(4000);
  });

  it('lists missing learning evidence before AI optimization', () => {
    const file = buildLearningFile({ episode, transcript, attempt, keywords: [], highlights: [], importedAt: '2026-08-07T01:00:00.000Z' });
    const missing = missingLearningEvidence(file);
    expect(missing).toContain('第一遍纯听完成状态');
    expect(missing).toContain('第二遍看画面完成状态');
    expect(missing).toContain('第三遍字幕精听完成状态');
    expect(missing).toContain('最终回忆复述完成状态');
    expect(missing).not.toContain('第一遍听到的词、片段或大概内容');
    expect(missing).not.toContain('第二遍对主旨的猜测');
    expect(missing).not.toContain('最终回忆的一句话主旨');
    expect(missing).not.toContain('最终回忆的三点提纲');
    expect(missing).not.toContain('是否已完成口头复述');
    expect(missingEvidenceQuestion(missing)).toContain('直接在这里告诉我这些信息');
  });

  it('accepts a fully completed attempt even when optional notes are blank', () => {
    const completed = structuredClone(attempt);
    completed.passes.audioOnly.completedAt = '2026-08-07T01:01:00.000Z';
    completed.passes.visualNoCaptions.completedAt = '2026-08-07T01:02:00.000Z';
    completed.passes.transcriptStudy.completedAt = '2026-08-07T01:03:00.000Z';
    completed.recall.completedAt = '2026-08-07T01:04:00.000Z';
    completed.passes.audioOnly.captured = [];
    completed.passes.audioOnly.fragments = '';
    completed.passes.visualNoCaptions.confirmed = [];
    completed.passes.visualNoCaptions.gistGuess = '';
    completed.recall.gist = '';
    completed.recall.outline = '';
    const file = buildLearningFile({ episode, transcript, attempt: completed, keywords: [], highlights: [], importedAt: '2026-08-07T01:00:00.000Z' });
    expect(missingLearningEvidence(file)).toEqual([]);
  });

  it('validates only the controlled AI focus section', () => {
    const valid = [
      '## AI 优化练习重点',
      '### 本次目标',
      '- 能用英语解释关键因果关系，并完成一次简短迁移。',
      '### 已观察到的学习信号',
      '- 用户询问了时态，并在复述中标记了一个仍不确定的细节。',
      '### 优先问题',
      '1. 问题：检查因果连接。\n   - 为什么优先：来自真实疑问。\n   - 先问什么（英语）：Why did it change?\n   - 如回答困难，给什么英文提示：Focus on the cause.\n   - 中文支架触发条件：英文提示后仍无法回答。',
      '### 建议练习顺序',
      '1. 开场追问\n2. 主旨或逻辑检查\n3. 关键词语境\n4. 英文复述\n5. 迁移任务',
      '### 教练注意事项',
      '- 不要重复已经解决的问题。\n- 不要把不确定的推断写成学习事实。',
    ].join('\n\n');
    expect(validateAiLiveFocusMarkdown(valid)).toEqual({ valid: true, markdown: valid });
    expect(validateAiLiveFocusMarkdown(`${valid}\n\n## 严格 JSON 学习报告模板`)).toMatchObject({ valid: false });
    expect(validateAiLiveFocusMarkdown(`前言\n${valid}`)).toMatchObject({ valid: false });
  });

  it('changes the AI source key when the conversation changes', () => {
    const file = buildLearningFile({ episode, transcript, attempt, keywords: [], highlights: [], importedAt: '2026-08-07T01:00:00.000Z' });
    const first = [{ id: 'm1', role: 'user' as const, kind: 'conversation' as const, content: 'question', createdAt: '2026-08-07T01:00:00.000Z' }];
    const second = [...first, { id: 'm2', role: 'assistant' as const, kind: 'conversation' as const, content: 'answer', createdAt: '2026-08-07T01:00:01.000Z' }];
    expect(aiFocusSourceKey(file, conversationRevision(first))).not.toBe(aiFocusSourceKey(file, conversationRevision(second)));
  });
});
