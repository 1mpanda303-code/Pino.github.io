import { useEffect, useId, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Upload, X } from 'lucide-react';
import type { Episode } from '../domain/learning';
import {
  planLearningReturnPackage, validateLearningReturnPackage,
  type LearningReturnPackage, type ReturnImportSummary, type ReturnPackagePlan,
} from '../domain/learningReturn';
import type { WorkspaceState } from '../domain/workspace';

type Props = {
  open: boolean;
  episodes: Episode[];
  workspace: WorkspaceState;
  onClose: () => void;
  onCommit: (pkg: LearningReturnPackage, options: { episodeId?: string; markCompleted: boolean }) => ReturnImportSummary;
  onViewProgress: () => void;
};

function parseReturnPackage(text: string) {
  const trimmed = text.trim();
  const fenced = /^```(?:json)?\s*\r?\n([\s\S]*?)\r?\n```$/i.exec(trimmed);
  return JSON.parse(fenced ? fenced[1] : trimmed) as unknown;
}

export function LearningReturnImportDialog({ open, episodes, workspace, onClose, onCommit, onViewProgress }: Props) {
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [prepared, setPrepared] = useState<LearningReturnPackage | null>(null);
  const [plan, setPlan] = useState<ReturnPackagePlan | null>(null);
  const [selectedEpisodeId, setSelectedEpisodeId] = useState<string>('');
  const [markCompleted, setMarkCompleted] = useState(true);
  const [summary, setSummary] = useState<ReturnImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(''); setErrors([]); setWarnings([]); setPrepared(null); setPlan(null); setSelectedEpisodeId(''); setMarkCompleted(true); setSummary(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, open]);

  if (!open) return null;

  async function loadFile(file?: File) {
    if (!file) return;
    setText(await file.text()); setErrors([]); setWarnings([]); setPrepared(null); setPlan(null); setSummary(null);
  }

  function validate() {
    if (!text.trim()) { setErrors(['请粘贴学习回填包 JSON 或选择一个 JSON 文件。']); return; }
    let parsed: unknown;
    try {
      parsed = parseReturnPackage(text);
    } catch (error) {
      setErrors([`JSON 语法错误：${error instanceof Error ? error.message : '无法解析'}`]);
      setPrepared(null); setPlan(null);
      return;
    }
    const validation = validateLearningReturnPackage(parsed);
    if (!validation.valid) {
      setErrors(validation.errors); setWarnings([]); setPrepared(null); setPlan(null);
      return;
    }
    const nextPlan = planLearningReturnPackage(validation.package, episodes, workspace);
    const nextWarnings = [...validation.warnings, ...nextPlan.warnings];
    setErrors([]); setWarnings(nextWarnings); setPrepared(validation.package); setPlan(nextPlan);
    setSelectedEpisodeId(nextPlan.match.kind === 'existing' ? nextPlan.match.episode!.id : '');
  }

  function commit() {
    if (!prepared) return;
    setSummary(onCommit(prepared, { episodeId: selectedEpisodeId || undefined, markCompleted }));
  }

  const matchText = plan?.match.kind === 'existing' ? `关联到《${plan.match.episode!.title}》` : '将新建自定义视频';

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="report-dialog return-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div><small>外部 AI 学完一次后导回</small><h2 id={titleId}>导入学习回填包</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭回填包导入"><X size={19} /></button>
        </header>

        {summary ? (
          <div className="import-result">
            <CheckCircle2 size={38} />
            <h3>回填包已导入</h3>
            <p>{summary.createdVideo ? '已新建视频并写入字幕、三遍与回忆证据。' : `已写入《${plan?.match.kind === 'existing' ? plan.match.episode?.title : summary.matchedEpisodeId}》。`}</p>
            <span>新增 AI 报告 {summary.aiReportsAdded} 份 · Live 报告新增 {summary.liveReportsAdded} 份、更新 {summary.liveReportsUpdated} 份 · 问题台账 {summary.ledgerEntries} 条</span>
            {summary.markedCompleted && <span>本集已标记为完成。</span>}
            <div><button className="secondary-button" type="button" onClick={onClose}>关闭</button><button className="primary-button" type="button" onClick={onViewProgress}>查看进步区</button></div>
          </div>
        ) : (
          <div className="report-import-body">
            <p className="dialog-intro">选择文件或粘贴外部 AI 返回的 `luma-learning-return-package/v1` JSON。工作台会自动新建或匹配视频，并回填字幕、三遍、回忆、问题台账和报告。</p>
            <div className="import-actions">
              <label className="secondary-button file-button"><Upload size={17} />选择 JSON 文件<input type="file" accept="application/json,.json" onChange={(event) => void loadFile(event.target.files?.[0])} /></label>
            </div>
            <label className="report-json-field"><span>学习回填包 JSON</span><textarea ref={inputRef} value={text} onChange={(event) => { setText(event.target.value); setErrors([]); setWarnings([]); setPrepared(null); setPlan(null); }} spellCheck={false} placeholder="在这里粘贴 luma-learning-return-package/v1 JSON" /></label>

            {!!errors.length && <div className="validation-errors" role="alert">{errors.map((error) => <p key={error}><AlertTriangle size={15} />{error}</p>)}</div>}
            {prepared && plan && (
              <div className="validation-preview return-preview">
                <div className="preview-heading"><strong>{matchText}</strong><span>{prepared.video.title}</span></div>
                <div className="return-counts">
                  <span>外部来源 {prepared.video.sources.length}</span>
                  <span>字幕 {plan.counts.transcriptCharacters} 字符</span>
                  <span>三遍/回忆 {plan.counts.transcriptCharacters > 0 ? '已包含' : '待确认'}</span>
                  <span>AI 报告 {plan.counts.aiReports}</span>
                  <span>Live 报告 {plan.counts.liveReports}</span>
                  <span>问题台账 {plan.counts.ledger}</span>
                  <span>关键词 {plan.counts.keywords}</span>
                  <span>Highlight {plan.counts.highlights}</span>
                </div>
                <label className="form-field return-match-select"><span>关联到已有视频（留空则新建）</span><select value={selectedEpisodeId} onChange={(event) => setSelectedEpisodeId(event.target.value)}><option value="">新建视频（默认）</option>{episodes.map((episode) => <option value={episode.id} key={episode.id}>{episode.title}</option>)}</select></label>
                {warnings.map((warning) => <p className="item-warning" key={warning}>{warning}</p>)}
                <label className="completion-confirm"><input type="checkbox" checked={markCompleted} onChange={(event) => setMarkCompleted(event.target.checked)} /><span>同时将本集标记为完成</span></label>
              </div>
            )}
          </div>
        )}

        {!summary && <footer className="dialog-footer"><p className="form-error">{errors.length ? '回填包未导入，请先修正校验错误。' : ''}</p><div><button className="secondary-button" type="button" onClick={onClose}>取消</button>{prepared ? <button className="primary-button" type="button" onClick={commit}>确认导入</button> : <button className="primary-button" type="button" onClick={validate}>校验回填包</button>}</div></footer>}
      </section>
    </div>
  );
}
