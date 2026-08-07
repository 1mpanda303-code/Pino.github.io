import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, FileJson, Upload, X } from 'lucide-react';
import { sameEpisodeTitle, type Episode } from '../domain/learning';
import {
  createReportTemplate, parseReportJson, reportFingerprint, validateLearningReport,
  type LearningReportV1, type StoredLearningReport,
} from '../domain/report';

export type ReportImportSummary = { added: number; updated: number; duplicate: number; needsDuration: number; markedCompleted: number };

type Props = {
  open: boolean;
  episodes: Episode[];
  existingReports: StoredLearningReport[];
  completedIds: Set<string>;
  expectedEpisodeId?: string;
  templateSessionId?: string;
  onClose: () => void;
  onCommit: (reports: LearningReportV1[], markCompleted: boolean) => ReportImportSummary;
  onViewProgress: () => void;
};

type Prepared = {
  key: string;
  report?: LearningReportV1;
  errors: string[];
  warnings: string[];
  status: 'added' | 'updated' | 'duplicate' | 'needs_episode_match' | 'invalid';
};

const statusLabel = { added: '新增', updated: '更新', duplicate: '重复', needs_episode_match: '待关联', invalid: '无效' };

export function ReportImportDialog({ open, episodes, existingReports, completedIds, expectedEpisodeId, templateSessionId, onClose, onCommit, onViewProgress }: Props) {
  const titleId = useId();
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [text, setText] = useState('');
  const [files, setFiles] = useState<Array<{ name: string; text: string }>>([]);
  const [prepared, setPrepared] = useState<Prepared[]>([]);
  const [matches, setMatches] = useState<Record<string, string>>({});
  const [markCompleted, setMarkCompleted] = useState(true);
  const [globalErrors, setGlobalErrors] = useState<string[]>([]);
  const [summary, setSummary] = useState<ReportImportSummary | null>(null);

  useEffect(() => {
    if (!open) return;
    setText(''); setFiles([]); setPrepared([]); setMatches({}); setMarkCompleted(true); setGlobalErrors([]); setSummary(null);
    window.setTimeout(() => inputRef.current?.focus(), 0);
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, open]);

  const episodeById = useMemo(() => new Map(episodes.map((episode) => [episode.id, episode])), [episodes]);
  const existingBySession = useMemo(() => new Map(existingReports.map((item) => [item.sessionId, item])), [existingReports]);

  if (!open) return null;

  async function addFiles(list: FileList | null) {
    if (!list) return;
    const loaded = await Promise.all([...list].map(async (file) => ({ name: file.name, text: await file.text() })));
    setFiles((current) => [...current, ...loaded]);
    setPrepared([]); setSummary(null);
  }

  function loadTemplate() {
    const episode = episodes.find((item) => item.id === expectedEpisodeId) ?? episodes[0];
    if (!episode) return;
    const sessionId = templateSessionId ?? `${new Date().toISOString().slice(0, 10)}-${episode.id}-example`;
    setText(JSON.stringify(createReportTemplate(sessionId, episode), null, 2));
    setPrepared([]); setSummary(null);
  }

  function validateAll() {
    const sources = [...(text.trim() ? [{ name: '粘贴内容', text }] : []), ...files];
    if (!sources.length) { setGlobalErrors(['请粘贴报告 JSON 或选择至少一个 JSON 文件。']); return; }
    const next: Prepared[] = [];
    const topErrors: string[] = [];
    let sequence = 0;
    for (const source of sources) {
      const parsed = parseReportJson(source.text);
      if (parsed.errors.length) { topErrors.push(...parsed.errors.map((error) => `${source.name}：${error}`)); continue; }
      parsed.values.forEach((value, index) => {
        const key = `${source.name}-${sequence++}`;
        const validation = validateLearningReport(value);
        if (!validation.valid) { next.push({ key, errors: validation.errors.map((error) => `第 ${index + 1} 份 ${error}`), warnings: [], status: 'invalid' }); return; }
        const report = validation.report;
        const warnings = [...validation.warnings];
        if (expectedEpisodeId && report.episodeId !== expectedEpisodeId) warnings.push(`报告属于 ${report.episodeId}，与当前视频不一致。`);
        const episode = episodeById.get(report.episodeId);
        if (episode && report.episodeTitle && !sameEpisodeTitle(episode.title, report.episodeTitle)) warnings.push(`报告标题《${report.episodeTitle}》与片库《${episode.title}》不同，将以稳定 episodeId 为准。`);
        const existing = existingBySession.get(report.sessionId);
        const status = !episode ? 'needs_episode_match' : existing ? existing.fingerprint === reportFingerprint(report) ? 'duplicate' : 'updated' : 'added';
        next.push({ key, report, errors: [], warnings, status });
      });
    }
    setGlobalErrors(topErrors); setPrepared(next); setSummary(null);
  }

  const importable = prepared.filter((item) => item.report && item.status !== 'invalid' && (item.status !== 'needs_episode_match' || matches[item.key]));
  const incompleteCount = importable.filter((item) => !completedIds.has(matches[item.key] ?? item.report!.episodeId)).length;

  function commit() {
    const reports = importable.map((item) => ({ ...item.report!, episodeId: matches[item.key] ?? item.report!.episodeId }));
    setSummary(onCommit(reports, markCompleted));
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="report-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div><small>学习证据</small><h2 id={titleId}>导入 GPT 学习报告</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭报告导入"><X size={19} /></button>
        </header>

        {summary ? (
          <div className="import-result">
            <CheckCircle2 size={38} />
            <h3>导入完成</h3>
            <p>新增 {summary.added} 份 · 更新 {summary.updated} 份 · 跳过重复 {summary.duplicate} 份</p>
            {summary.needsDuration > 0 && <span>{summary.needsDuration} 份报告缺少确认时长，可在进步区补录。</span>}
            {summary.markedCompleted > 0 && <span>已明确标记 {summary.markedCompleted} 个视频为完成。</span>}
            <div><button className="secondary-button" type="button" onClick={onClose}>关闭</button><button className="primary-button" type="button" onClick={onViewProgress}>查看最近复盘</button></div>
          </div>
        ) : (
          <div className="report-import-body">
            <p className="dialog-intro">粘贴一份报告或报告数组，也可以选择多个 JSON 文件。相同 sessionId 会更新原报告，不会重复计入进步。</p>
            <div className="import-actions">
              <label className="secondary-button file-button"><Upload size={17} />选择 JSON 文件<input type="file" accept="application/json,.json" multiple onChange={(event) => void addFiles(event.target.files)} /></label>
              <button className="secondary-button" type="button" onClick={loadTemplate}><FileJson size={17} />载入报告模板</button>
              {!!files.length && <span>已选择 {files.length} 个文件</span>}
            </div>
            <label className="report-json-field"><span>报告 JSON</span><textarea ref={inputRef} value={text} onChange={(event) => { setText(event.target.value); setPrepared([]); setSummary(null); }} spellCheck={false} placeholder="在这里粘贴 GPT 输出的严格 JSON" /></label>

            {!!globalErrors.length && <div className="validation-errors" role="alert">{globalErrors.map((error) => <p key={error}><AlertTriangle size={15} />{error}</p>)}</div>}
            {!!prepared.length && (
              <div className="validation-preview">
                <div className="preview-heading"><strong>校验预览</strong><span>{importable.length} / {prepared.length} 份可导入</span></div>
                {prepared.map((item, index) => (
                  <div className={`preview-item ${item.status}`} key={item.key}>
                    <div><strong>第 {index + 1} 份 · {statusLabel[item.status]}</strong>{item.report && <span>{item.report.sessionId}</span>}</div>
                    {item.report && <small>{item.report.sessionDate} · {item.report.durationMinutes === null ? '时长待补录' : `${item.report.durationMinutes} 分钟`}</small>}
                    {item.status === 'needs_episode_match' && <label><span>关联视频</span><select value={matches[item.key] ?? ''} onChange={(event) => setMatches((current) => ({ ...current, [item.key]: event.target.value }))}><option value="">请选择视频</option>{episodes.map((episode) => <option value={episode.id} key={episode.id}>{episode.title}</option>)}</select></label>}
                    {item.errors.map((error) => <p className="item-error" key={error}>{error}</p>)}
                    {item.warnings.map((warning) => <p className="item-warning" key={warning}>{warning}</p>)}
                  </div>
                ))}
                {incompleteCount > 0 && <label className="completion-confirm"><input type="checkbox" checked={markCompleted} onChange={(event) => setMarkCompleted(event.target.checked)} /><span>同时将报告对应的 {incompleteCount} 个未完成视频标记为完成</span></label>}
              </div>
            )}
          </div>
        )}

        {!summary && <footer className="dialog-footer"><p className="form-error">{prepared.some((item) => item.status === 'invalid') ? '无效报告不会保存；可确认导入其余有效报告。' : ''}</p><div><button className="secondary-button" type="button" onClick={onClose}>取消</button>{prepared.length ? <button className="primary-button" type="button" onClick={commit} disabled={!importable.length}>确认导入</button> : <button className="primary-button" type="button" onClick={validateAll}>校验报告</button>}</div></footer>}
      </section>
    </div>
  );
}
