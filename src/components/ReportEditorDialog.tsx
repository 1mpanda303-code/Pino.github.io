import { useEffect, useId, useState } from 'react';
import { AlertTriangle, FileJson, Save, X } from 'lucide-react';
import { validateAiAssistantReport, type AiAssistantReport, type StoredAiAssistantReport } from '../domain/aiReport';
import { validateLearningReport, type LearningReportV1, type StoredLearningReport } from '../domain/report';

export type ReportEditorTarget =
  | { kind: 'ai'; stored: StoredAiAssistantReport }
  | { kind: 'live'; stored: StoredLearningReport };

type SaveResult = { ok: boolean; message?: string };

type Props = {
  target: ReportEditorTarget | null;
  onClose: () => void;
  onSaveAiReport: (stored: StoredAiAssistantReport, report: AiAssistantReport) => SaveResult;
  onSaveLiveReport: (stored: StoredLearningReport, report: LearningReportV1) => SaveResult;
};

export function ReportEditorDialog({ target, onClose, onSaveAiReport, onSaveLiveReport }: Props) {
  const titleId = useId();
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  useEffect(() => {
    if (!target) return;
    setText(`${JSON.stringify(target.stored.report, null, 2)}\n`);
    setErrors([]);
  }, [target]);

  useEffect(() => {
    if (!target) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, target]);

  if (!target) return null;

  function save() {
    const current = target;
    if (!current) return;
    let value: unknown;
    try {
      value = JSON.parse(text);
    } catch (error) {
      setErrors([`JSON 语法错误：${error instanceof Error ? error.message : '无法解析'}`]);
      return;
    }

    if (current.kind === 'ai') {
      const validation = validateAiAssistantReport(value);
      if (!validation.valid) { setErrors(validation.errors); return; }
      if (validation.report.episodeId !== current.stored.episodeId) {
        setErrors(['编辑器不能改变报告所属视频。请在正确视频下重新导入报告。']);
        return;
      }
      const result = onSaveAiReport(current.stored, validation.report);
      if (!result.ok) { setErrors([result.message ?? 'AI 报告保存失败。']); return; }
    } else {
      const validation = validateLearningReport(value);
      if (!validation.valid) { setErrors(validation.errors); return; }
      if (validation.report.episodeId !== current.stored.episodeId || validation.report.sessionId !== current.stored.sessionId) {
        setErrors(['编辑器不能改变 Live 报告所属视频或 sessionId。请以新的报告记录重新导入。']);
        return;
      }
      const result = onSaveLiveReport(current.stored, validation.report);
      if (!result.ok) { setErrors([result.message ?? 'GPT Live 报告保存失败。']); return; }
    }

    onClose();
  }

  const kindLabel = target.kind === 'ai' ? 'AI 助手报告' : 'GPT Live 报告';
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="report-dialog report-editor-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div><small>导入记录</small><h2 id={titleId}>编辑{kindLabel}</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭报告编辑"><X size={19} /></button>
        </header>
        <div className="report-import-body">
          <p className="dialog-intro">修改后会重新校验报告契约并更新成长统计；原始导入时间保持不变。稳定身份不能在此修改。</p>
          <label className="report-json-field"><span><FileJson size={15} />报告 JSON</span><textarea value={text} onChange={(event) => { setText(event.target.value); setErrors([]); }} spellCheck={false} aria-label={`编辑${kindLabel} JSON`} /></label>
          {!!errors.length && <div className="validation-errors" role="alert">{errors.map((error) => <p key={error}><AlertTriangle size={15} />{error}</p>)}</div>}
        </div>
        <footer className="dialog-footer"><p className="form-error">{errors.length ? '请先修正报告内容。' : ''}</p><div><button className="secondary-button" type="button" onClick={onClose}>取消</button><button className="primary-button" type="button" onClick={save}><Save size={16} />保存修改</button></div></footer>
      </section>
    </div>
  );
}
