import { useEffect, useId, useState } from 'react';
import { BookOpenCheck, FileText, Save, Trash2, X } from 'lucide-react';
import { questionKindLabels, type AiAssistantReport, type QuestionKind, type StoredAiAssistantReport } from '../domain/aiReport';

export type AccumulationEditorTarget =
  | { kind: 'question'; stored: StoredAiAssistantReport; questionKey: string }
  | { kind: 'vocabulary'; stored: StoredAiAssistantReport; term: string }
  | { kind: 'grammar'; stored: StoredAiAssistantReport; pattern: string };

type SaveResult = { ok: boolean; message?: string };

type Props = {
  target: AccumulationEditorTarget | null;
  onClose: () => void;
  onSave: (stored: StoredAiAssistantReport, report: AiAssistantReport) => SaveResult;
};

const questionKinds = Object.keys(questionKindLabels) as QuestionKind[];

export function AccumulationEditorDialog({ target, onClose, onSave }: Props) {
  const titleId = useId();
  const [label, setLabel] = useState('');
  const [kind, setKind] = useState<QuestionKind>('other');
  const [question, setQuestion] = useState('');
  const [answerSummary, setAnswerSummary] = useState('');
  const [sourceQuote, setSourceQuote] = useState('');
  const [term, setTerm] = useState('');
  const [meaning, setMeaning] = useState('');
  const [example, setExample] = useState('');
  const [pattern, setPattern] = useState('');
  const [explanation, setExplanation] = useState('');
  const [reason, setReason] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!target) return;
    setError('');
    if (target.kind === 'question') {
      const item = target.stored.report.userQuestions.find((entry) => entry.questionKey === target.questionKey);
      setLabel(item?.label ?? '');
      setKind(item?.kind ?? 'other');
      setQuestion(item?.question ?? '');
      setAnswerSummary(item?.answerSummary ?? '');
      setSourceQuote(item?.sourceQuote ?? '');
      return;
    }
    if (target.kind === 'vocabulary') {
      const item = target.stored.report.recommendations.vocabulary.find((entry) => entry.term === target.term);
      setTerm(item?.term ?? '');
      setMeaning(item?.meaning ?? '');
      setExample(item?.example ?? '');
      setReason(item?.reason ?? '');
      return;
    }
    const item = target.stored.report.recommendations.grammar.find((entry) => entry.pattern === target.pattern);
    setPattern(item?.pattern ?? '');
    setExplanation(item?.explanation ?? '');
    setExample(item?.example ?? '');
    setReason(item?.reason ?? '');
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, target]);

  if (!target) return null;

  const isQuestion = target.kind === 'question';
  const isVocabulary = target.kind === 'vocabulary';
  const sourceEpisode = target.stored.report.episodeTitle;

  function save() {
    const current = target;
    if (!current) return;
    const report = current.stored.report;
    if (current.kind === 'question') {
      if (!label.trim() || !question.trim() || !answerSummary.trim()) {
        setError('学习内容、最近问题和答案摘要均不能为空。');
        return;
      }
      const index = report.userQuestions.findIndex((item) => item.questionKey === current.questionKey);
      if (index < 0) { setError('来源报告已更新，请关闭后重新打开。'); return; }
      const userQuestions = [...report.userQuestions];
      userQuestions[index] = {
        ...userQuestions[index],
        label: label.trim(),
        kind,
        question: question.trim(),
        answerSummary: answerSummary.trim(),
        sourceQuote: sourceQuote.trim(),
      };
      const result = onSave(current.stored, { ...report, userQuestions });
      if (!result.ok) { setError(result.message ?? '来源报告保存失败。'); return; }
    } else if (current.kind === 'vocabulary') {
      if (!term.trim() || !meaning.trim() || !reason.trim()) {
        setError('单词、中文释义和学习提示均不能为空。');
        return;
      }
      const index = report.recommendations.vocabulary.findIndex((item) => item.term === current.term);
      if (index < 0) { setError('来源报告已更新，请关闭后重新打开。'); return; }
      const vocabulary = [...report.recommendations.vocabulary];
      vocabulary[index] = { term: term.trim(), meaning: meaning.trim(), example: example.trim(), reason: reason.trim() };
      const result = onSave(current.stored, { ...report, recommendations: { ...report.recommendations, vocabulary } });
      if (!result.ok) { setError(result.message ?? '来源报告保存失败。'); return; }
    } else {
      if (!pattern.trim() || !explanation.trim() || !reason.trim()) {
        setError('语法结构、用法说明和学习提示均不能为空。');
        return;
      }
      const index = report.recommendations.grammar.findIndex((item) => item.pattern === current.pattern);
      if (index < 0) { setError('来源报告已更新，请关闭后重新打开。'); return; }
      const grammar = [...report.recommendations.grammar];
      grammar[index] = { pattern: pattern.trim(), explanation: explanation.trim(), example: example.trim(), reason: reason.trim() };
      const result = onSave(current.stored, { ...report, recommendations: { ...report.recommendations, grammar } });
      if (!result.ok) { setError(result.message ?? '来源报告保存失败。'); return; }
    }
    onClose();
  }

  function remove() {
    const current = target;
    if (!current || !window.confirm('删除这条学习积累？来源 AI 报告中的对应内容也会同步删除。')) return;
    const report = current.stored.report;
    let nextReport: AiAssistantReport;
    if (current.kind === 'question') {
      const index = report.userQuestions.findIndex((item) => item.questionKey === current.questionKey);
      if (index < 0) { setError('来源报告已更新，请关闭后重新打开。'); return; }
      const userQuestions = [...report.userQuestions];
      userQuestions.splice(index, 1);
      nextReport = { ...report, userQuestions };
    } else if (current.kind === 'vocabulary') {
      const index = report.recommendations.vocabulary.findIndex((item) => item.term === current.term);
      if (index < 0) { setError('来源报告已更新，请关闭后重新打开。'); return; }
      const vocabulary = [...report.recommendations.vocabulary];
      vocabulary.splice(index, 1);
      nextReport = { ...report, recommendations: { ...report.recommendations, vocabulary } };
    } else {
      const index = report.recommendations.grammar.findIndex((item) => item.pattern === current.pattern);
      if (index < 0) { setError('来源报告已更新，请关闭后重新打开。'); return; }
      const grammar = [...report.recommendations.grammar];
      grammar.splice(index, 1);
      nextReport = { ...report, recommendations: { ...report.recommendations, grammar } };
    }
    const result = onSave(current.stored, nextReport);
    if (!result.ok) { setError(result.message ?? '来源报告删除失败。'); return; }
    onClose();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="report-dialog accumulation-editor-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div><small>学习积累</small><h2 id={titleId}>{isQuestion ? '编辑问题记录' : isVocabulary ? '编辑词汇记录' : '编辑语法记录'}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭学习积累编辑"><X size={19} /></button>
        </header>
        <div className="report-import-body accumulation-editor-body">
          <p className="dialog-intro">保存后会校验并回写来源 AI 报告，学习积累与成长统计会立即同步更新。</p>
          <div className="accumulation-source"><FileText size={16} /><div><span>来源视频</span><strong>{sourceEpisode}</strong></div></div>
          {isQuestion ? <div className="accumulation-editor-fields">
            <label><span>学习内容</span><input value={label} maxLength={200} onChange={(event) => { setLabel(event.target.value); setError(''); }} /></label>
            <label><span>类型</span><select value={kind} onChange={(event) => { setKind(event.target.value as QuestionKind); setError(''); }}>{questionKinds.map((item) => <option value={item} key={item}>{questionKindLabels[item]}</option>)}</select></label>
            <label className="span-two"><span>最近问题</span><textarea value={question} maxLength={1000} onChange={(event) => { setQuestion(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>答案摘要</span><textarea value={answerSummary} maxLength={1000} onChange={(event) => { setAnswerSummary(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>来源 / 原文（可选）</span><textarea value={sourceQuote} maxLength={500} onChange={(event) => { setSourceQuote(event.target.value); setError(''); }} /></label>
          </div> : isVocabulary ? <div className="accumulation-editor-fields">
            <label className="span-two"><span>单词</span><input value={term} maxLength={100} onChange={(event) => { setTerm(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>中文释义</span><textarea value={meaning} maxLength={500} onChange={(event) => { setMeaning(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>例句（可选）</span><textarea value={example} maxLength={500} onChange={(event) => { setExample(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>学习提示</span><textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); setError(''); }} /></label>
          </div> : <div className="accumulation-editor-fields">
            <label className="span-two"><span>语法结构</span><input value={pattern} maxLength={200} onChange={(event) => { setPattern(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>用法说明</span><textarea value={explanation} maxLength={700} onChange={(event) => { setExplanation(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>例句（可选）</span><textarea value={example} maxLength={500} onChange={(event) => { setExample(event.target.value); setError(''); }} /></label>
            <label className="span-two"><span>学习提示</span><textarea value={reason} maxLength={500} onChange={(event) => { setReason(event.target.value); setError(''); }} /></label>
          </div>}
          {error && <p className="form-error accumulation-editor-error" role="alert">{error}</p>}
        </div>
        <footer className="dialog-footer"><p>{isQuestion ? <><FileText size={15} />稳定视频身份不会在这里修改。</> : <><BookOpenCheck size={15} />推荐项修改会同步回来源报告。</>}</p><div><button className="icon-button danger" type="button" onClick={remove} aria-label="删除这条学习积累" title="删除并同步"><Trash2 size={16} /></button><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" onClick={save}><Save size={16} />保存并同步</button></div></footer>
      </section>
    </div>
  );
}
