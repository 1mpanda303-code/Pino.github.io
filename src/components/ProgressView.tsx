import { useMemo, useState } from 'react';
import {
  AlertCircle, ArrowRight, BarChart3, BookOpenCheck, Brain, CalendarDays, CheckCircle2,
  Clock3, Compass, Download, FileJson, Flame, FolderClock, Headphones, Import,
  Layers3, LayoutDashboard, Lightbulb, MessageCircleQuestion, Mountain, PieChart,
  Pencil, Radar, RefreshCw, Search, Settings, Trash2, X,
} from 'lucide-react';
import { contentFormLabels, questionKindLabels, topicLabels, type QuestionKind, type StoredAiAssistantReport } from '../domain/aiReport';
import { buildGrowthModel, type GrowthDimension, type GrowthRange } from '../domain/growth';
import type { Episode, StudyAttempt } from '../domain/learning';
import { buildStageReport, type EvidenceStatus, type StoredLearningReport } from '../domain/report';
import { calculateProgress, type Completion } from '../domain/workspace';
import { downloadTextFile } from '../download';
import { ReportEditorDialog, type ReportEditorTarget } from './ReportEditorDialog';

type ProgressSection = 'overview' | 'scoring' | 'portfolio' | 'collection' | 'archive';

type Props = {
  episodes: Episode[];
  studyAttempts: Record<string, StudyAttempt[]>;
  completions: Record<string, Completion>;
  aiReports: StoredAiAssistantReport[];
  reports: StoredLearningReport[];
  onContinue: () => void;
  onImport: () => void;
  onOpenEpisode: (episodeId: string) => void;
  onReinforce: (episodeId: string) => void;
  onUpdateDuration: (sessionId: string, minutes: number) => void;
  onUpdateReport: (stored: StoredLearningReport, report: StoredLearningReport['report']) => { ok: boolean; message?: string };
  onUpdateAiReport: (stored: StoredAiAssistantReport, report: StoredAiAssistantReport['report']) => { ok: boolean; message?: string };
  onDeleteReport: (sessionId: string) => void;
  onDeleteAiReport: (fingerprint: string) => void;
  onOpenSettings: () => void;
};

const evidenceLabels: Record<EvidenceStatus, string> = {
  independent: '独立完成', after_question: '追问后完成', after_english_hint: '英文提示后完成',
  after_chinese_support: '中文支架后完成', not_demonstrated: '尚未表现', not_assessed: '本次未检查',
};

const dimensionIcons = { challenge: Mountain, practice: Layers3, questions: MessageCircleQuestion, understanding: Brain };

function dateString(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function DurationEditor({ report, onSave }: { report: StoredLearningReport; onSave: (minutes: number) => void }) {
  const [value, setValue] = useState('');
  const minutes = Number(value);
  return <div className="duration-editor"><input type="number" min="1" max="600" value={value} onChange={(event) => setValue(event.target.value)} placeholder="分钟" aria-label={`补录 ${report.sessionId} 的巩固时长`} /><button type="button" disabled={!Number.isInteger(minutes) || minutes < 1 || minutes > 600} onClick={() => { onSave(minutes); setValue(''); }}>保存</button></div>;
}

function ScoreCard({ dimension }: { dimension: GrowthDimension }) {
  const Icon = dimensionIcons[dimension.id];
  return <article className={`growth-score-card ${dimension.id}`}><div><span><Icon size={17} /></span><small>{dimension.source}</small></div><strong>{dimension.score ?? '—'}<small>{dimension.score === null ? '' : ' / 100'}</small></strong><h3>{dimension.label}</h3><p>{dimension.summary}</p><div className="growth-mini-track"><i style={{ width: `${dimension.score ?? 0}%` }} /></div><em>{dimension.weight}% 权重 · {dimension.samples} 份证据</em></article>;
}

export function ProgressView({ episodes, studyAttempts, completions, aiReports, reports, onContinue, onImport, onOpenEpisode, onReinforce, onUpdateDuration, onUpdateReport, onUpdateAiReport, onDeleteReport, onDeleteAiReport, onOpenSettings }: Props) {
  const [section, setSection] = useState<ProgressSection>('overview');
  const [range, setRange] = useState<GrowthRange>('30');
  const [collectionKind, setCollectionKind] = useState<'all' | QuestionKind>('all');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [detailReport, setDetailReport] = useState<StoredLearningReport | null>(null);
  const [archiveEpisodeId, setArchiveEpisodeId] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<ReportEditorTarget | null>(null);
  const model = useMemo(() => buildGrowthModel({ episodes, studyAttempts, completions, aiReports, liveReports: reports, range }), [aiReports, completions, episodes, range, reports, studyAttempts]);
  const stats = calculateProgress(episodes, completions, reports);
  const episodeById = useMemo(() => new Map(episodes.map((item) => [item.id, item])), [episodes]);
  const selectedLiveReports = useMemo(() => reports.filter((item) => item.sessionDate <= model.bounds.to && (!model.bounds.from || item.sessionDate >= model.bounds.from)).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.updatedAt.localeCompare(a.updatedAt)), [model.bounds, reports]);
  const selectedAiReports = useMemo(() => aiReports.filter((item) => item.report.generatedAt.slice(0, 10) <= model.bounds.to && (!model.bounds.from || item.report.generatedAt.slice(0, 10) >= model.bounds.from)).sort((a, b) => b.report.generatedAt.localeCompare(a.report.generatedAt) || b.updatedAt.localeCompare(a.updatedAt)), [aiReports, model.bounds]);
  const latest = selectedLiveReports[0];
  const maxMinutes = Math.max(1, ...stats.sevenDays.flatMap((day) => [day.videoMinutes, day.gptMinutes]));
  const nextMilestone = [10, 25, 50, 75, 100].find((item) => item > stats.completed) ?? Math.ceil((stats.completed + 1) / 25) * 25;
  const stageFrom = model.bounds.from ?? '2000-01-01';
  const stageReport = buildStageReport(episodes, reports, completions, stageFrom, model.bounds.to);
  const lowestDimension = [...model.dimensions].sort((a, b) => (a.score ?? -1) - (b.score ?? -1))[0];
  const visibleAccumulations = model.accumulations.filter((item) => {
    if (collectionKind !== 'all' && item.kind !== collectionKind) return false;
    const needle = collectionSearch.trim().toLowerCase();
    return !needle || `${item.label} ${item.latestQuestion} ${item.answerSummary}`.toLowerCase().includes(needle);
  });
  const visibleVocabulary = model.vocabulary.filter((item) => {
    const needle = collectionSearch.trim().toLowerCase();
    return !needle || `${item.term} ${item.meaning} ${item.reason}`.toLowerCase().includes(needle);
  });
  const latestEpisode = latest ? episodeById.get(latest.episodeId) : undefined;
  const assessedDetails = latest?.report.details.filter((item) => item.status !== 'not_assessed') ?? [];
  const independentDetails = assessedDetails.filter((item) => item.status === 'independent').length;
  const archiveEntry = archiveEpisodeId ? model.archive.find((item) => item.episode.id === archiveEpisodeId) ?? null : null;

  const navItems: Array<{ id: ProgressSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: '成长总览', icon: LayoutDashboard },
    { id: 'scoring', label: '评分解读', icon: Radar },
    { id: 'portfolio', label: '内容画像', icon: PieChart },
    { id: 'collection', label: '学习积累', icon: BookOpenCheck },
    { id: 'archive', label: '学习档案', icon: FolderClock },
  ];

  return (
    <main className="growth-page">
      <div className="growth-shell">
        <aside className="growth-nav" aria-label="进步区分区导航">
          <span>进步区</span>
          {navItems.map((item, index) => { const Icon = item.icon; return <button className={section === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => setSection(item.id)}><Icon size={17} />{item.label}<small>0{index + 1}</small></button>; })}
          <div><strong>当前范围</strong>{model.completedCount} 集完成学习<br />{model.aiVideoCount} 个视频 / {model.aiReportCount} 份 AI 报告<br />{model.liveCount} 份 Live 报告</div>
        </aside>

        <div className="growth-content">
          <header className="growth-page-header">
            <div><span>成长中心</span><h1>{navItems.find((item) => item.id === section)?.label}</h1></div>
            <div className="growth-range" aria-label="时间范围"><button className={range === '7' ? 'active' : ''} type="button" onClick={() => setRange('7')}>7 天</button><button className={range === '30' ? 'active' : ''} type="button" onClick={() => setRange('30')}>30 天</button><button className={range === 'all' ? 'active' : ''} type="button" onClick={() => setRange('all')}>全部</button></div>
          </header>

          {section === 'overview' && <>
            <section className="growth-hero-band">
              <div className="growth-hero-main"><span>本阶段成长指数</span><h2>{model.overallScore === null ? '还需要更多不同来源的证据' : '学习过程正在形成可比较的成长轨迹'}</h2><div className="growth-index"><strong>{model.overallScore ?? '—'}</strong>{model.overallScore !== null && <small>/ 100</small>}{model.delta !== null && <em className={model.delta >= 0 ? 'positive' : 'negative'}>{model.delta >= 0 ? '+' : ''}{model.delta} 较上期</em>}</div><p>{model.coverageWeight}% 权重已有证据 · 分数只使用对应来源，不以观看量代替理解。</p></div>
              <div className="growth-facts"><div><span>完成学习</span><strong>{model.completedCount} 集</strong><small>当前时间范围</small></div><div><span>学习日</span><strong>{model.studyDays} 天</strong><small>AI、三遍或 Live 记录</small></div><div><span>Live 报告</span><strong>{model.liveCount} 份</strong><small>理解表现来源</small></div><div><span>下一节点</span><strong>{nextMilestone} 集</strong><small>还差 {Math.max(0, nextMilestone - stats.completed)} 集</small></div></div>
            </section>

            <section className="growth-section"><header><div><span>可追溯评分</span><h2>四个维度</h2></div><small>挑战 15% · 三遍 30% · 提问 20% · 理解 35%</small></header><div className="growth-score-grid">{model.dimensions.map((item) => <ScoreCard dimension={item} key={item.id} />)}</div></section>

            <div className="growth-overview-grid">
              <section className="growth-panel"><header><div><span>最近 7 天</span><h2>有效学习记录</h2></div></header><div className="growth-dual-chart" aria-label="最近七天学习时长">{stats.sevenDays.map((day) => <div key={day.date} tabIndex={0} aria-label={`${day.date}，视频 ${day.videoMinutes} 分钟，Live ${day.gptMinutes} 分钟`}><span><i className="video" style={{ height: `${Math.max(day.videoMinutes ? 8 : 2, day.videoMinutes / maxMinutes * 100)}%` }} /><i className="live" style={{ height: `${Math.max(day.gptMinutes ? 8 : 2, day.gptMinutes / maxMinutes * 100)}%` }} /></span><small>{new Date(`${day.date}T12:00:00`).toLocaleDateString('zh-CN', { weekday: 'short' })}</small></div>)}</div><div className="growth-chart-legend"><span><i className="video" />视频内容</span><span><i className="live" />GPT Live</span></div></section>
              <section className="growth-panel next-action-panel"><header><div><span>下一次最有杠杆</span><h2>{lowestDimension.score === null ? `补充${lowestDimension.label}证据` : `继续改善${lowestDimension.label}`}</h2></div></header><div className="next-action"><Lightbulb size={20} /><div><strong>{lowestDimension.summary}</strong><p>{lowestDimension.id === 'challenge' ? '导入当前视频的 AI 助手报告。' : lowestDimension.id === 'practice' ? '完成下一集三遍与回忆。' : lowestDimension.id === 'questions' ? '在 AI 对话中提出一个具体英语问题，并导入 AI 报告。' : '完成 GPT Live 并导回严格报告。'}</p></div></div><div className="growth-primary-actions"><button className="secondary-button" type="button" onClick={onImport}><Import size={16} />导入 Live 报告</button><button className="primary-button" type="button" onClick={onContinue}>继续下一集<ArrowRight size={17} /></button></div></section>
            </div>

            <section className="growth-panel growth-latest"><header><div><span>最近一次 GPT Live</span><h2>{latestEpisode?.title ?? '还没有 Live 报告'}</h2></div>{latest && <small>{latest.sessionDate} · {latest.durationMinutes === null ? '时长待补录' : `${latest.durationMinutes} 分钟`}</small>}</header>{latest ? <><div className="growth-live-evidence"><div><span>主旨</span><strong>{evidenceLabels[latest.report.gist.status]}</strong></div><div><span>关键细节</span><strong>{independentDetails} / {assessedDetails.length}</strong></div><div><span>复述结构</span><strong>{latest.report.retelling.structure}</strong></div><div><span>迁移</span><strong>{evidenceLabels[latest.report.transfer.status]}</strong></div></div><div className="growth-latest-actions"><button className="secondary-button" type="button" onClick={() => setDetailReport(latest)}>查看复盘</button><button className="secondary-button" type="button" onClick={() => onReinforce(latest.episodeId)}><RefreshCw size={16} />再次巩固</button></div></> : <div className="growth-empty"><FileJson size={24} /><span>导入第一份 GPT Live 报告后显示理解证据。</span><button className="secondary-button" type="button" onClick={onImport}>导入报告</button></div>}</section>

            <section className="growth-panel stage-export"><header><div><span>阶段汇总</span><h2>{stageReport.payload.title}</h2></div></header><div><span>{stageReport.payload.coverage.completedVideos} 个完成视频</span><span>{stageReport.payload.coverage.gptSessions} 次 Live</span><span>{stageReport.payload.coverage.unknownDurationSessions} 次时长未知</span></div><div><button className="secondary-button" type="button" onClick={() => downloadTextFile(stageReport.markdown, 'text/markdown;charset=utf-8', `luma-progress-${dateString(new Date())}.md`)}><Download size={16} />Markdown</button><button className="secondary-button" type="button" onClick={() => downloadTextFile(JSON.stringify(stageReport.payload, null, 2), 'application/json;charset=utf-8', `luma-progress-${dateString(new Date())}.json`)}><BarChart3 size={16} />JSON</button></div></section>
          </>}

          {section === 'scoring' && <>
            <section className="growth-section scoring-methods"><header><div><span>评分来源与权重</span><h2>每个维度只使用自己的证据</h2></div><strong>{model.overallScore === null ? '证据不足' : `${model.overallScore} / 100`}</strong></header><div>{model.dimensions.map((item) => <div className="growth-method" key={item.id}><div><strong>{item.label}</strong><small>{item.source} · 权重 {item.weight}%</small></div><div className="growth-method-track"><i style={{ width: `${item.score ?? 0}%` }} /></div><b>{item.score ?? '—'}</b><p>{item.summary}</p></div>)}</div></section>
            <section className="growth-panel scoring-boundary"><AlertCircle size={22} /><div><h2>证据边界</h2><p>AI 报告说明材料挑战和主动提问；三遍分只表示流程记录；只有 GPT Live 的实际回答、复述、迁移和提示使用进入理解表现。缺失维度不按零分处理，也不由其他维度代填。</p></div></section>
          </>}

          {section === 'portfolio' && <section className="growth-section"><header><div><span>已分析材料</span><h2>内容画像</h2></div><small>{model.aiVideoCount} 个视频 · {model.aiReportCount} 份报告</small></header>{model.aiVideoCount ? <div className="portfolio-layout"><div><h3>主主题</h3><div className="distribution-list">{model.topics.map((item) => <div key={item.id}><span>{topicLabels[item.id]}</span><i><b style={{ width: `${item.count / Math.max(1, model.topics[0]?.count ?? 1) * 100}%` }} /></i><strong>{item.count}</strong></div>)}</div></div><div><h3>内容形式</h3><div className="distribution-list">{model.forms.map((item) => <div key={item.id}><span>{contentFormLabels[item.id]}</span><i><b style={{ width: `${item.count / Math.max(1, model.forms[0]?.count ?? 1) * 100}%` }} /></i><strong>{item.count}</strong></div>)}</div><h3>字幕难度</h3><div className="difficulty-list">{model.difficulties.map((item) => <span key={item.id}><b>{item.id}</b>{item.count} 集</span>)}</div></div></div> : <div className="growth-empty"><Compass size={25} /><span>生成或导入 AI 助手报告后显示主题、形式和字幕难度分布。</span></div>}</section>}

          {section === 'collection' && <section className="growth-section collection-section"><header><div><span>用户主动提出</span><h2>学习积累</h2></div><div className="collection-search"><Search size={15} /><input value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} placeholder="搜索积累" aria-label="搜索学习积累" /></div></header><div className="collection-segments" aria-label="问题类型">{(['all', 'vocabulary', 'grammar', 'expression', 'comprehension', 'translation'] as const).map((kind) => <button className={collectionKind === kind ? 'active' : ''} type="button" onClick={() => setCollectionKind(kind)} key={kind}>{kind === 'all' ? '全部' : questionKindLabels[kind]}</button>)}</div>{visibleAccumulations.length ? <div className="collection-entry-list">{visibleAccumulations.map((item) => { const source = aiReports.find((report) => report.fingerprint === item.sourceReportFingerprint); return <article className="collection-entry" key={item.questionKey}><div className="collection-entry-main"><span className={`question-kind ${item.kind}`}>{questionKindLabels[item.kind]}</span><dl><div><dt>学习内容</dt><dd><strong>{item.label}</strong></dd></div><div><dt>答案摘要</dt><dd>{item.answerSummary}</dd></div></dl></div><aside className="collection-entry-side"><strong>{item.count} 次</strong><small>累计出现</small><details><summary>更多</summary><dl><div><dt>最近问题</dt><dd>{item.latestQuestion}</dd></div><div><dt>来源</dt><dd>{item.episodeIds.map((id) => episodeById.get(id)?.title ?? id).join('、')}</dd></div></dl>{source && <button className="secondary-button collection-edit-button" type="button" onClick={() => setEditorTarget({ kind: 'ai', stored: source })}><Pencil size={14} />编辑来源报告</button>}</details></aside></article>; })}</div> : <div className="growth-empty"><MessageCircleQuestion size={25} /><span>当前范围没有符合条件的主动问题。</span></div>}<h3 className="collection-subheading">词汇积累（AI 推荐）</h3>{visibleVocabulary.length ? <div className="collection-entry-list vocabulary-entry-list">{visibleVocabulary.map((item) => { const source = aiReports.find((report) => report.fingerprint === item.sourceReportFingerprint); return <article className="collection-entry vocabulary-entry" key={item.term}><div className="collection-entry-main"><dl><div><dt>单词</dt><dd><strong>{item.term}</strong></dd></div><div><dt>中文释义</dt><dd>{item.meaning}</dd></div><div><dt>学习提示</dt><dd>{item.reason}</dd></div></dl></div><aside className="collection-entry-side"><strong>{item.count} 次</strong><small>累计推荐</small><details><summary>更多</summary><dl><div><dt>最近来源</dt><dd>{item.episodeIds.map((id) => episodeById.get(id)?.title ?? id).join('、')}</dd></div><div><dt>更新日期</dt><dd>{item.latestDate}</dd></div></dl>{source && <button className="secondary-button collection-edit-button" type="button" onClick={() => setEditorTarget({ kind: 'ai', stored: source })}><Pencil size={14} />编辑来源报告</button>}</details></aside></article>; })}</div> : <div className="growth-empty"><BookOpenCheck size={25} /><span>当前范围没有 AI 推荐词汇。</span></div>}<p className="collection-footnote">每个条目都保留可追溯来源。“更多”显示最近问题和视频来源，并可打开原始 AI 报告修正错译或归类；词汇契约目前记录单词、中文释义和学习提示。</p></section>}

          {section === 'archive' && <>
            <section className="growth-section archive-section"><header><div><span>单集证据</span><h2>学习档案</h2></div><small>{model.archive.length} 个视频</small></header>{model.archive.length ? <div className="archive-table-wrap"><table className="growth-table archive-table"><thead><tr><th>日期</th><th>视频</th><th>分类</th><th>难度</th><th>AI 报告</th><th>GPT Live</th></tr></thead><tbody>{model.archive.map((item) => <tr key={item.episode.id} onClick={() => setArchiveEpisodeId(item.episode.id)}><td>{item.latestDate}</td><td><strong>{item.episode.title}</strong><small>{item.completedAt ? '完成学习' : '有报告记录'}</small></td><td>{item.aiReport ? `${topicLabels[item.aiReport.report.materialAnalysis.primaryTopic]} · ${contentFormLabels[item.aiReport.report.materialAnalysis.contentForm]}` : '未分析'}</td><td>{item.aiReport?.report.materialAnalysis.subtitleDifficulty ?? '—'}</td><td><span className={item.aiReports.length ? 'report-ready' : 'report-pending'}>{item.aiReports.length ? `${item.aiReports.length} 份` : '未保存'}</span></td><td><span className={item.liveReports.length ? 'report-ready' : 'report-pending'}>{item.liveReports.length ? `${item.liveReports.length} 份` : '未导回'}</span></td></tr>)}</tbody></table></div> : <div className="growth-empty"><FolderClock size={25} /><span>当前范围没有学习档案。</span></div>}</section>
            {!!(selectedLiveReports.length || selectedAiReports.length) && <section className="growth-panel report-records"><header><div><span>可管理的原始记录</span><h2>报告导入记录</h2></div><small>当前时间范围 {selectedAiReports.length} 份 AI · {selectedLiveReports.length} 份 Live</small></header><div className="report-record-list">{selectedAiReports.map((report) => <article className="report-record" key={report.fingerprint}><span className="report-record-kind ai">AI</span><button type="button" onClick={() => setEditorTarget({ kind: 'ai', stored: report })}><strong>{episodeById.get(report.episodeId)?.title ?? report.episodeId}</strong><small>{new Date(report.report.generatedAt).toLocaleString()} · {topicLabels[report.report.materialAnalysis.primaryTopic]} · {report.report.userQuestions.length} 个主动问题</small></button><div className="report-record-actions"><button className="icon-button" type="button" onClick={() => setEditorTarget({ kind: 'ai', stored: report })} aria-label={`编辑 AI 报告 ${report.report.generatedAt}`} title="编辑 AI 报告"><Pencil size={15} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm('删除这份 AI 报告？其他报告和视频完成状态不会改变。')) onDeleteAiReport(report.fingerprint); }} aria-label={`删除 AI 报告 ${report.report.generatedAt}`} title="删除 AI 报告"><Trash2 size={15} /></button></div></article>)}{selectedLiveReports.map((report) => <article className="report-record" key={report.sessionId}><span className="report-record-kind live">Live</span><button type="button" onClick={() => setDetailReport(report)}><strong>{episodeById.get(report.episodeId)?.title ?? report.episodeId}</strong><small>{report.sessionDate} · {report.report.summary}</small></button>{report.durationMinutes === null ? <DurationEditor report={report} onSave={(minutes) => onUpdateDuration(report.sessionId, minutes)} /> : <small className="report-record-duration">{report.durationMinutes} 分钟</small>}<div className="report-record-actions"><button className="icon-button" type="button" onClick={() => setEditorTarget({ kind: 'live', stored: report })} aria-label={`编辑 Live 报告 ${report.sessionId}`} title="编辑 Live 报告"><Pencil size={15} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm('删除这份 GPT Live 报告？视频完成状态不会改变。')) onDeleteReport(report.sessionId); }} aria-label={`删除报告 ${report.sessionId}`} title="删除报告"><Trash2 size={16} /></button></div></article>)}</div></section>}
            <section className="growth-panel workspace-settings-panel"><header><div><span>个人工作区</span><h2>设置与数据管理</h2></div><button className="secondary-button" type="button" onClick={onOpenSettings}><Settings size={16} />打开设置</button></header><p>在这里管理 AI API、Cloudflare 云同步，以及包含片库和全部 AI / Live 报告的工作区备份与导入。</p></section>
          </>}
        </div>
      </div>

      {detailReport && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setDetailReport(null); }}><section className="report-detail-dialog" role="dialog" aria-modal="true" aria-label="GPT Live 复盘详情"><header className="dialog-header"><div><small>{detailReport.sessionDate} · {detailReport.sessionId}</small><h2>{episodeById.get(detailReport.episodeId)?.title ?? detailReport.episodeId}</h2></div><button className="icon-button" type="button" onClick={() => setDetailReport(null)} aria-label="关闭复盘详情"><X size={19} /></button></header><div className="report-detail-body"><section><h3>本次总结</h3><p>{detailReport.report.summary}</p></section><section><h3>主旨</h3><strong>{evidenceLabels[detailReport.report.gist.status]}</strong>{detailReport.report.gist.evidence && <q>{detailReport.report.gist.evidence}</q>}</section><section><h3>做得好的</h3>{detailReport.report.strengths.length ? <ul>{detailReport.report.strengths.map((item) => <li key={item.findingKey}>{item.label}{item.evidence && <small>{item.evidence}</small>}</li>)}</ul> : <p>未提供结构化优势。</p>}</section><section><h3>核心缺口</h3>{detailReport.report.gaps.length ? <ul>{detailReport.report.gaps.map((item) => <li key={item.findingKey}>{item.label}{item.evidence && <small>{item.evidence}</small>}</li>)}</ul> : <p>未提供结构化缺口。</p>}</section><section><h3>下一步</h3><p>{detailReport.report.nextFocus}</p></section><section className="report-basis"><h3>评估说明</h3><p>依据：{detailReport.report.assessmentBasis} · 可信度：{detailReport.report.assessmentConfidence}</p>{detailReport.report.limitations.map((item) => <small key={item}>{item}</small>)}</section></div></section></div>}
      {archiveEntry && <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setArchiveEpisodeId(null); }}><section className="report-detail-dialog archive-detail-dialog" role="dialog" aria-modal="true" aria-label="单集学习档案详情"><header className="dialog-header"><div><small>{archiveEntry.latestDate} · 单集学习档案</small><h2>{archiveEntry.episode.title}</h2></div><button className="icon-button" type="button" onClick={() => setArchiveEpisodeId(null)} aria-label="关闭学习档案"><X size={19} /></button></header><div className="archive-detail-body">
        <section className="archive-material-summary"><h3>材料画像</h3>{archiveEntry.aiReport ? <><div className="archive-tags"><span>{topicLabels[archiveEntry.aiReport.report.materialAnalysis.primaryTopic]}</span><span>{contentFormLabels[archiveEntry.aiReport.report.materialAnalysis.contentForm]}</span><span>{archiveEntry.aiReport.report.materialAnalysis.subtitleDifficulty}</span><span>{archiveEntry.aiReport.report.materialAnalysis.informationDensity} 信息密度</span></div><p>{archiveEntry.aiReport.report.materialAnalysis.summary}</p></> : <p>尚未导入本集 AI 助手报告。</p>}</section>
        <section><h3>用户主动问题</h3>{archiveEntry.aiReport?.report.userQuestions.length ? <ul>{archiveEntry.aiReport.report.userQuestions.map((item) => <li key={item.questionKey}><strong>{item.label}</strong><span>{item.question}</span><small>{item.answerSummary}</small></li>)}</ul> : <p>本集没有已导入的主动问题。</p>}</section>
        <section><h3>AI 推荐词汇</h3>{archiveEntry.aiReport?.report.recommendations.vocabulary.length ? <ul>{archiveEntry.aiReport.report.recommendations.vocabulary.map((item) => <li key={item.term}><strong>{item.term}</strong><span>{item.meaning}</span><small>{item.reason}</small></li>)}</ul> : <p>本集没有 AI 推荐词汇。</p>}</section>
        <section><h3>AI 推荐语法</h3>{archiveEntry.aiReport?.report.recommendations.grammar.length ? <ul>{archiveEntry.aiReport.report.recommendations.grammar.map((item) => <li key={item.pattern}><strong>{item.pattern}</strong><span>{item.explanation}</span><small>{item.reason}</small></li>)}</ul> : <p>本集没有 AI 推荐语法。</p>}</section>
        <section className="archive-ai-history"><h3>AI 报告历史</h3>{archiveEntry.aiReports.length ? <div>{archiveEntry.aiReports.map((item) => <article key={item.fingerprint}><div><strong>{new Date(item.report.generatedAt).toLocaleString()}</strong><span>{topicLabels[item.report.materialAnalysis.primaryTopic]} · {contentFormLabels[item.report.materialAnalysis.contentForm]} · {item.report.materialAnalysis.subtitleDifficulty}</span><small>{item.report.userQuestions.length} 个主动问题 · 导入于 {new Date(item.importedAt).toLocaleString()}</small></div><div className="report-record-actions"><button className="icon-button" type="button" onClick={() => setEditorTarget({ kind: 'ai', stored: item })} aria-label={`编辑 AI 报告 ${item.report.generatedAt}`} title="编辑 AI 报告"><Pencil size={15} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm(`删除 ${new Date(item.report.generatedAt).toLocaleString()} 的这份 AI 报告？其他 AI 报告、GPT Live 报告和视频完成状态不会改变。`)) onDeleteAiReport(item.fingerprint); }} aria-label={`删除 AI 报告 ${item.report.generatedAt}`} title="删除这份 AI 报告"><Trash2 size={15} /></button></div></article>)}</div> : <p>本集尚未导入 AI 助手报告。</p>}</section>
        <section className="archive-live-summary"><h3>GPT Live 记录</h3>{archiveEntry.liveReports.length ? <div>{archiveEntry.liveReports.map((item) => <article key={item.sessionId}><button type="button" onClick={() => { setArchiveEpisodeId(null); setDetailReport(item); }}><strong>{item.sessionDate}</strong><span>{item.report.summary}</span></button><div className="report-record-actions"><button className="icon-button" type="button" onClick={() => setEditorTarget({ kind: 'live', stored: item })} aria-label={`编辑 Live 报告 ${item.sessionId}`} title="编辑 Live 报告"><Pencil size={15} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm('删除这份 GPT Live 报告？视频完成状态不会改变。')) onDeleteReport(item.sessionId); }} aria-label={`删除 Live 报告 ${item.sessionId}`} title="删除 Live 报告"><Trash2 size={15} /></button></div></article>)}</div> : <p>本集尚未导回 GPT Live 报告，因此没有理解表现证据。</p>}</section>
      </div><footer className="archive-detail-actions"><button className="secondary-button" type="button" onClick={() => { const id = archiveEntry.episode.id; setArchiveEpisodeId(null); onOpenEpisode(id); }}>打开本集</button><button className="primary-button" type="button" onClick={() => { const id = archiveEntry.episode.id; setArchiveEpisodeId(null); onReinforce(id); }}><RefreshCw size={16} />再次巩固</button></footer></section></div>}
      <ReportEditorDialog target={editorTarget} onClose={() => setEditorTarget(null)} onSaveAiReport={onUpdateAiReport} onSaveLiveReport={onUpdateReport} />
    </main>
  );
}
