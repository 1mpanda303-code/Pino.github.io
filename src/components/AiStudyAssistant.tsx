import { useEffect, useMemo, useRef, useState } from 'react';
import { Bot, CheckCircle2, ChevronDown, Download, FileDown, FileInput, FileJson, LoaderCircle, MessageCircle, RefreshCw, Send, Sparkles, Trash2, X } from 'lucide-react';
import { AiClientError, requestAi } from '../aiClient';
import { reportCapabilityDecisionFromOverride } from '../domain/aiProvider';
import {
  aiFocusSourceKey, aiReportQuestion, aiReportRetryQuestion, buildLearningFile, checkGeneratedAiReport, conversationRevision, createAiRequest, learningFileSummary, livePracticeQuestion,
  missingEvidenceQuestion, missingLearningEvidence, validateAiLiveFocusMarkdown,
  type AiAction, type AiConversationEntry, type AiLearningFile, type AiMessage,
} from '../domain/aiStudy';
import { buildLiveMarkdown, safeFileStem, type Episode, type EpisodeTranscript, type Highlight, type LegacyRecall, type StudyAttempt } from '../domain/learning';
import { downloadTextFile } from '../download';
import type { AiAssistantReport, QuestionLedgerEntry, StoredAiAssistantReport, TranscriptSource } from '../domain/aiReport';
import type { AiProviderOverride } from '../domain/aiProvider';

type Props = {
  episode: Episode;
  transcript: EpisodeTranscript;
  attempt: StudyAttempt;
  keywords: string[];
  highlights: Highlight[];
  legacyRecall?: LegacyRecall;
  conversation: AiConversationEntry[];
  aiReports: StoredAiAssistantReport[];
  questionLedger?: QuestionLedgerEntry[];
  transcriptSource?: TranscriptSource;
  onSaveAiReport: (report: AiAssistantReport) => 'added' | 'duplicate';
  onAppendConversation: (message: AiConversationEntry) => void;
  onClearConversation: () => void;
  onEnsureSession: () => string;
  onNotice: (message: string) => void;
  provider?: AiProviderOverride;
};

type AiFocusDraft = { messageId: string; markdown: string; sourceKey: string };
type ComposerIntent = AiAction;

const welcome: AiConversationEntry = {
  id: 'ai-welcome',
  role: 'assistant',
  kind: 'status',
  content: '可以直接问我英语学习中的问题。需要结合本集字幕和学习记录时，可载入本集学习资料。',
  createdAt: 'welcome',
};

function entry(role: AiMessage['role'], content: string, kind: AiConversationEntry['kind'] = 'conversation'): AiConversationEntry {
  const id = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
  return { id: `ai-message-${id}`, role, content, kind, createdAt: new Date().toISOString() };
}

export function AiStudyAssistant({
  episode, transcript, attempt, keywords, highlights, legacyRecall,
  conversation, aiReports, questionLedger, transcriptSource, onSaveAiReport, onAppendConversation, onClearConversation, onEnsureSession, onNotice,
  provider,
}: Props) {
  const [question, setQuestion] = useState('');
  const [composerIntent, setComposerIntent] = useState<ComposerIntent>('chat');
  const [learningFile, setLearningFile] = useState<AiLearningFile | null>(null);
  const [busyAction, setBusyAction] = useState<AiAction | null>(null);
  const [error, setError] = useState('');
  const [expanded, setExpanded] = useState(true);
  const [aiFocusDraft, setAiFocusDraft] = useState<AiFocusDraft | null>(null);
  const scopeKey = `${episode.id}:${attempt.attemptId}`;
  const previousScope = useRef(scopeKey);
  const logRef = useRef<HTMLDivElement>(null);
  const composerRef = useRef<HTMLTextAreaElement>(null);
  const messages = conversation.length ? conversation : [welcome];
  const latestAiReport = aiReports[0];

  function currentLearningFile(importedAt?: string) {
    return buildLearningFile({
      episode, transcript, attempt, keywords, highlights, legacyRecall, conversation,
      questionLedger, transcriptSource, importedAt, sessionId: learningFile?.sessionId ?? onEnsureSession(),
    });
  }

  const requestHistory = useMemo(() => conversation
    .filter((item) => item.kind !== 'status')
    .map(({ role, content }) => ({ role, content })), [conversation]);
  const reportHistory = useMemo(() => conversation
    .filter((item) => item.kind === 'conversation')
    .map(({ role, content }) => ({ role, content })), [conversation]);
  const currentRevision = conversationRevision(conversation);
  const aiFocusIsCurrent = !!aiFocusDraft && !!learningFile
    && aiFocusDraft.sourceKey === aiFocusSourceKey(currentLearningFile(learningFile.importedAt), currentRevision);

  useEffect(() => {
    if (previousScope.current === scopeKey) return;
    previousScope.current = scopeKey;
    setLearningFile(null);
    setAiFocusDraft(null);
    setComposerIntent('chat');
    setQuestion('');
    setError('');
  }, [scopeKey]);

  useEffect(() => {
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }, [messages, busyAction]);

  function importCurrentFile() {
    const file = currentLearningFile();
    setLearningFile(file);
    setAiFocusDraft(null);
    setError('');
    onAppendConversation(entry('assistant', `已载入本集学习资料：${learningFileSummary(file)}`, 'status'));
  }

  function exportLearningDocument() {
    const file = currentLearningFile();
    setLearningFile(file);
    downloadTextFile(file.markdown, 'text/markdown;charset=utf-8', `${safeFileStem(episode.title)}-ai-learning.md`);
    onNotice('本集 AI 学习协作文档已导出。');
  }

  async function send(action: AiAction, prompt: string, attachedFile: AiLearningFile | null) {
    const trimmed = prompt.trim();
    if (!trimmed || busyAction) return false;
    const messageKind = action === 'generate_live_practice' ? 'live-practice' : action === 'generate_ai_report' ? 'ai-report' : 'conversation';
    const userEntry = entry('user', trimmed, messageKind);
    onAppendConversation(userEntry);
    setBusyAction(action);
    setError('');
    const requestScope = scopeKey;
    try {
      const request = createAiRequest({
        action,
        question: trimmed,
        history: action === 'generate_ai_report' ? reportHistory : requestHistory,
        learningFile: attachedFile ?? undefined,
        provider,
      });
      let response = await requestAi(request);
      if (action === 'generate_ai_report') {
        let check = checkGeneratedAiReport(response.text, episode.id);
        if (response.finishReason === 'length' || !check.valid) {
          const issue = response.finishReason === 'length'
            ? '模型达到单次输出上限，JSON 被截断。'
            : check.valid ? '报告结束原因异常。' : check.error;
          response = await requestAi(createAiRequest({
            action,
            question: aiReportRetryQuestion(trimmed, issue),
            history: reportHistory,
            learningFile: attachedFile ?? undefined,
            provider,
          }));
          check = checkGeneratedAiReport(response.text, episode.id);
          if (response.finishReason === 'length' || !check.valid) {
            const retryIssue = response.finishReason === 'length'
              ? '模型再次达到单次输出上限。'
              : check.valid ? '报告结束原因异常。' : check.error;
            throw new Error(`AI 报告自动重试后仍不完整：${retryIssue}`);
          }
        }
      }
      if (previousScope.current !== requestScope) return false;
      const assistantEntry = entry('assistant', response.text, messageKind);
      onAppendConversation(assistantEntry);
      if (action === 'generate_live_practice' && attachedFile) {
        const validation = validateAiLiveFocusMarkdown(response.text);
        if (validation.valid) {
          const nextRevision = conversationRevision([...conversation, userEntry, assistantEntry]);
          setAiFocusDraft({ messageId: assistantEntry.id, markdown: validation.markdown, sourceKey: aiFocusSourceKey(attachedFile, nextRevision) });
        } else {
          setAiFocusDraft(null);
          setError(validation.error);
        }
      }
      return true;
    } catch (cause) {
      const message = cause instanceof AiClientError ? cause.message : cause instanceof Error ? cause.message : 'AI 请求失败，请稍后重试。';
      setError(message);
      return false;
    } finally {
      setBusyAction(null);
    }
  }

  function focusComposer(cursorAt: number) {
    requestAnimationFrame(() => {
      composerRef.current?.focus();
      composerRef.current?.setSelectionRange(cursorAt, cursorAt);
    });
  }

  function prepareComposer(intent: Exclude<ComposerIntent, 'chat'>) {
    const file = currentLearningFile();
    setLearningFile(file);
    if (intent === 'generate_live_practice') setAiFocusDraft(null);
    const reportDecision = reportCapabilityDecisionFromOverride(provider);
    if (intent === 'generate_ai_report' && !reportDecision.allowed) {
      setComposerIntent('chat');
      setQuestion('');
      setError(reportDecision.reason);
      return;
    }
    const prompt = intent === 'generate_live_practice' ? livePracticeQuestion() : aiReportQuestion({ compact: reportDecision.allowed && reportDecision.compact });
    setComposerIntent(intent);
    setQuestion(prompt);
    setError('');
    focusComposer(prompt.length);
  }

  async function submitComposer() {
    if (composerIntent === 'chat') {
      if (await send('chat', question, learningFile)) setQuestion('');
      return;
    }
    const file = currentLearningFile();
    setLearningFile(file);
    if (composerIntent === 'generate_live_practice') {
      const missing = missingLearningEvidence(file);
      if (missing.length) {
        const clarification = missingEvidenceQuestion(missing);
        const clarificationIndex = conversation.map((message) => message.content).lastIndexOf(clarification);
        const answeredInChat = clarificationIndex >= 0 && conversation.slice(clarificationIndex + 1).some((message) => message.role === 'user' && message.kind === 'conversation');
        if (!answeredInChat) {
          if (clarificationIndex < 0) onAppendConversation(entry('assistant', clarification, 'conversation'));
          setComposerIntent('chat');
          setQuestion('');
          setError('');
          focusComposer(0);
          return;
        }
      }
    }
    if (composerIntent === 'generate_ai_report') {
      const decision = reportCapabilityDecisionFromOverride(provider);
      if (!decision.allowed) {
        setError(decision.reason);
        setComposerIntent('chat');
        setQuestion('');
        return;
      }
    }
    if (await send(composerIntent, question, file)) {
      setComposerIntent('chat');
      setQuestion('');
    }
  }

  function reportFromMessage(message: AiConversationEntry) {
    const check = checkGeneratedAiReport(message.content, episode.id);
    if (!check.valid) throw new Error(check.error);
    return check.report;
  }

  function downloadAiReport(message: AiConversationEntry) {
    try {
      const report = reportFromMessage(message);
      downloadTextFile(`${JSON.stringify(report, null, 2)}\n`, 'application/json;charset=utf-8', `${safeFileStem(episode.title)}-ai-assistant-report.json`);
      setError('');
      onNotice('AI 助手报告 JSON 已下载。');
    } catch (cause) {
      setError(`AI 报告无法下载：${cause instanceof Error ? cause.message : '格式校验失败。'}`);
    }
  }

  function importGeneratedAiReport(message: AiConversationEntry) {
    try {
      const report = reportFromMessage(message);
      const status = onSaveAiReport(report);
      const statusText = status === 'duplicate' ? '完全相同的 AI 报告已经存在，没有重复保存。' : `AI 报告已导入，本集现有 ${aiReports.length + 1} 份。`;
      setError('');
      onAppendConversation(entry('assistant', statusText, 'status'));
      onNotice(statusText);
    } catch (cause) {
      setError(`AI 报告无法导入：${cause instanceof Error ? cause.message : '格式校验失败。'}`);
    }
  }

  function downloadAiVersion() {
    if (!aiFocusDraft || !learningFile || !aiFocusIsCurrent) {
      setError('对话或学习记录已更新，请重新生成 Live 练习文档。');
      return;
    }
    try {
      const sessionId = onEnsureSession();
      const markdown = buildLiveMarkdown({
        episode, transcript, attempt, keywords, highlights, sessionId, legacyRecall,
        aiFocusMarkdown: aiFocusDraft.markdown,
      });
      downloadTextFile(markdown, 'text/markdown;charset=utf-8', `${safeFileStem(episode.title)}-gpt-live-ai-${sessionId.slice(-8)}.md`);
      onNotice('AI 优化版 GPT Live 文档已下载。');
    } catch {
      setError('AI 优化版下载失败，请重新生成后再试。');
    }
  }

  function clearConversation() {
    if (!conversation.length || busyAction || !window.confirm(`确定清空《${episode.title}》的 AI 对话记录吗？此操作会同步到云端，但不会影响其他视频。`)) return;
    onClearConversation();
    setLearningFile(null);
    setAiFocusDraft(null);
    setComposerIntent('chat');
    setQuestion('');
    setError('');
  }

  function aiReportActions(message: AiConversationEntry) {
    const check = checkGeneratedAiReport(message.content, episode.id);
    if (!check.valid) return <div className="ai-artifact-actions invalid"><small>这份旧回复不是完整可导入的 JSON。</small><button className="secondary-button" type="button" onClick={() => prepareComposer('generate_ai_report')}><RefreshCw size={14} />重新生成报告</button></div>;
    return <div className="ai-artifact-actions">
      <button className="secondary-button ai-download-button" type="button" onClick={() => downloadAiReport(message)} aria-label="下载 AI 助手报告 JSON"><Download size={14} />下载报告</button>
      <button className="secondary-button ai-download-button" type="button" onClick={() => importGeneratedAiReport(message)} aria-label="导入此 AI 助手报告"><FileInput size={14} />导入报告</button>
    </div>;
  }

  return (
    <section className={`ai-assistant${expanded ? ' expanded' : ' collapsed'}`} aria-label="AI 英语助手">
      <header className="ai-assistant-header">
        <div className="ai-assistant-title"><span className="ai-assistant-icon"><Bot size={17} /></span><div><strong>AI 英语助手</strong><small>{provider ? `${provider.label} · ${provider.model}` : '服务端默认 · 未配置网页配置'} · {conversation.length ? `${conversation.length} 条已保存` : '对话自动保存'}</small></div></div>
        <div className="ai-assistant-header-actions">
          <button className="secondary-button ai-clear-button" type="button" disabled={!!busyAction || !conversation.length} onClick={clearConversation} aria-label="清空当前视频 AI 对话记录" title="清空当前视频对话"><Trash2 size={15} />清空对话</button>
          <button className="icon-button" type="button" onClick={() => setExpanded((value) => !value)} aria-expanded={expanded} aria-label={expanded ? '收起 AI 助手' : '展开 AI 助手'} title={expanded ? '收起' : '展开'}>{expanded ? <ChevronDown size={17} /> : <MessageCircle size={17} />}</button>
        </div>
      </header>
      {expanded && <>
        <div className="ai-context-actions">
          <div className="ai-primary-actions">
            <button className="secondary-button" type="button" disabled={!!busyAction} onClick={importCurrentFile}><FileInput size={16} />载入本集学习资料</button>
            <button className="secondary-button ai-live-button" type="button" disabled={!!busyAction} onClick={() => prepareComposer('generate_live_practice')}><Sparkles size={16} />生成 Live 练习文档</button>
            <button className="secondary-button" type="button" disabled={!!busyAction} onClick={() => prepareComposer('generate_ai_report')}><FileJson size={16} />生成 AI 报告</button>
          </div>
          <div className="ai-secondary-actions"><button className="secondary-button" type="button" disabled={!!busyAction} onClick={exportLearningDocument}><FileDown size={16} />导出学习文档</button></div>
        </div>
        <div className={`ai-report-status${latestAiReport ? ' ready' : ''}`}>
          {latestAiReport ? <CheckCircle2 size={15} /> : <FileJson size={15} />}
          <span>{latestAiReport ? `本集已保存 ${aiReports.length} 份 AI 报告 · 最近 ${latestAiReport.report.materialAnalysis.subtitleDifficulty} · ${latestAiReport.report.userQuestions.length} 个主动问题` : '本集尚未保存 AI 助手报告'}</span>
        </div>
        {learningFile && <div className="ai-context-chip"><FileInput size={14} /><span>{learningFileSummary(learningFile)} · 导入于 {new Date(learningFile.importedAt).toLocaleString()}</span></div>}
        <div className="ai-chat-log" ref={logRef} aria-live="polite" aria-busy={!!busyAction}>
          {messages.map((message) => <div className={`ai-message ${message.role} ${message.kind}`} key={message.id}>
            <span>{message.role === 'assistant' ? <Bot size={14} /> : '你'}</span>
            <div className="ai-message-body">
              <p>{message.content}</p>
              {message.role === 'assistant' && message.kind === 'live-practice' && aiFocusDraft?.messageId === message.id && (
                <div className="ai-artifact-actions">
                  {aiFocusIsCurrent
                    ? <button className="secondary-button ai-download-button" type="button" onClick={downloadAiVersion} aria-label="下载 AI 优化版 Markdown" title="下载 AI 优化版 Markdown"><Download size={14} />下载 AI 优化版</button>
                    : <small>对话或学习记录已更新，请重新生成。</small>}
                </div>
              )}
              {message.role === 'assistant' && message.kind === 'ai-report' && aiReportActions(message)}
            </div>
          </div>)}
          {busyAction && <div className="ai-busy"><LoaderCircle size={15} /><span>{busyAction === 'generate_live_practice' ? '正在生成 Live 练习文档…' : busyAction === 'generate_ai_report' ? '正在生成 AI 报告…' : '正在等待回复…'}</span></div>}
        </div>
        <div className="ai-controls">
          {composerIntent !== 'chat' && <div className="ai-composer-intent"><span>{composerIntent === 'generate_live_practice' ? 'Live 练习文档草稿' : 'AI 报告草稿'}</span><button className="icon-button" type="button" onClick={() => { setComposerIntent('chat'); setQuestion(''); setError(''); }} aria-label="取消生成草稿" title="取消草稿"><X size={14} /></button></div>}
          <div className="ai-composer">
            <textarea
              ref={composerRef}
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void submitComposer();
                }
              }}
              placeholder={composerIntent === 'chat' ? '输入英语学习问题…' : '编辑生成要求…'}
              rows={3}
              maxLength={64000}
              disabled={!!busyAction}
            />
            <button className="primary-button ai-send-button" type="button" disabled={!!busyAction || !question.trim()} onClick={() => void submitComposer()} aria-label={composerIntent === 'chat' ? '发送问题' : '发送生成要求'} title="发送"><Send size={17} /></button>
          </div>
          {error && <p className="ai-error" role="alert">{error}</p>}
        </div>
      </>}
    </section>
  );
}
