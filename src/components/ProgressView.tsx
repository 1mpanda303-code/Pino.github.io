import { useMemo, useState, type CSSProperties } from 'react';
import {
  AlertCircle, ArrowRight, BookOpenCheck, Brain, CalendarDays, CheckCircle2,
  Clock3, Compass, FileJson, Flame, FolderClock, Headphones, Import,
  Layers3, LayoutDashboard, Lightbulb, MessageCircleQuestion, Mountain, PieChart,
  MoreHorizontal, PanelLeftClose, PanelLeftOpen, PanelTopClose, PanelTopOpen,
  Pencil, Radar, RefreshCw, Search, Settings, Trash2, X,
} from 'lucide-react';
import { contentFormLabels, questionKindLabels, topicLabels, type ContentFormId, type QuestionKind, type StoredAiAssistantReport, type SubtitleDifficulty, type TopicId } from '../domain/aiReport';
import { buildGrowthModel, type CollectionEntry, type GrowthDimension, type GrowthRange } from '../domain/growth';
import type { Episode, StudyAttempt } from '../domain/learning';
import { type EvidenceStatus, type StoredLearningReport } from '../domain/report';
import { calculateProgress, type Completion } from '../domain/workspace';
import { ResizeHandle } from '../layout/ResizeHandle';
import { AccumulationEditorDialog, type AccumulationEditorTarget } from './AccumulationEditorDialog';
import { ReportEditorDialog, type ReportEditorTarget } from './ReportEditorDialog';

type ProgressSection = 'overview' | 'scoring' | 'portfolio' | 'collection' | 'archive';
type ArchiveFilter = 'all' | 'completed' | 'needs_ai' | 'needs_live';
type CollectionSourceFilter = 'all' | 'user_question' | 'ai_recommendation';
type ArchiveTopicFilter = 'all' | TopicId;
type ArchiveFormFilter = 'all' | ContentFormId;
type ArchiveDifficultyFilter = 'all' | SubtitleDifficulty;

const GROWTH_NAV_WIDTH_KEY = 'luma-growth-nav-width-v1';
const GROWTH_NAV_COLLAPSED_KEY = 'luma-growth-nav-collapsed-v1';
const GROWTH_ARCHIVE_HEIGHT_KEY = 'luma-growth-archive-height-v1';

function storedNumber(key: string, fallback: number, minimum: number, maximum: number) {
  try {
    const value = Number(window.localStorage.getItem(key));
    return Number.isFinite(value) ? Math.min(maximum, Math.max(minimum, value)) : fallback;
  } catch {
    return fallback;
  }
}

function storeValue(key: string, value: string) {
  try { window.localStorage.setItem(key, value); } catch { /* Browser privacy mode can disable storage. */ }
}

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

function DurationEditor({ report, onSave }: { report: StoredLearningReport; onSave: (minutes: number) => void }) {
  const [value, setValue] = useState('');
  const minutes = Number(value);
  return <div className="duration-editor"><input type="number" min="1" max="600" value={value} onChange={(event) => setValue(event.target.value)} placeholder="分钟" aria-label={`补录 ${report.sessionId} 的巩固时长`} /><button type="button" disabled={!Number.isInteger(minutes) || minutes < 1 || minutes > 600} onClick={() => { onSave(minutes); setValue(''); }}>保存</button></div>;
}

function ScoreCard({ dimension }: { dimension: GrowthDimension }) {
  const Icon = dimensionIcons[dimension.id];
  return <article className={`growth-score-card ${dimension.id}`}><div><span><Icon size={17} /></span><small>{dimension.source}</small></div><strong>{dimension.score ?? '—'}<small>{dimension.score === null ? '' : ' / 100'}</small></strong><h3>{dimension.label}</h3><p>{dimension.summary}</p><div className="growth-mini-track"><i style={{ width: `${dimension.score ?? 0}%` }} /></div><em>{dimension.weight}% 权重 · {dimension.samples} 份证据</em></article>;
}

function CollectionEntryCard({ item, episodeById, onEdit }: {
  item: CollectionEntry;
  episodeById: Map<string, Episode>;
  onEdit: (item: CollectionEntry) => void;
}) {
  const isQuestion = item.source === 'user_question';
  const isVocabulary = item.kind === 'vocabulary';
  const episodeTitles = item.episodeIds.map((id) => episodeById.get(id)?.title ?? id);
  const fields = isQuestion ? [
    { label: '学习主题', value: item.label, emphasis: true },
    { label: '我的问题', value: item.prompt },
    { label: '答案要点', value: item.explanation },
    { label: '字幕线索', value: item.example || '报告未附字幕线索。' },
  ] : [
    { label: isVocabulary ? '单词' : '语法结构', value: item.label, emphasis: true },
    { label: isVocabulary ? '中文释义' : '用法说明', value: item.explanation },
    { label: '例句', value: item.example || '报告未提供例句。' },
    { label: '学习提示', value: item.prompt },
  ];

  return <article className={`collection-entry collection-entry-${item.source}`}>
    <header className="collection-entry-header">
      <div><span className={`question-kind ${item.kind}`}>{questionKindLabels[item.kind]}</span><span className={`collection-source ${item.source}`}>{isQuestion ? '主动问题' : 'AI 推荐'}</span></div>
      <div className="collection-entry-metrics" title={episodeTitles.join(' · ')}><span><strong>{item.count}</strong> 个关联视频</span><button className="icon-button" type="button" onClick={() => onEdit(item)} aria-label={`编辑 ${item.label} 的来源报告`} title="编辑来源报告"><MoreHorizontal size={16} /></button></div>
    </header>
    <dl className="collection-entry-fields">{fields.map((field) => <div key={field.label}><dt>{field.label}</dt><dd>{field.emphasis ? <strong>{field.value}</strong> : field.value}</dd></div>)}</dl>
  </article>;
}

export function ProgressView({ episodes, studyAttempts, completions, aiReports, reports, onContinue, onImport, onOpenEpisode, onReinforce, onUpdateDuration, onUpdateReport, onUpdateAiReport, onDeleteReport, onDeleteAiReport, onOpenSettings }: Props) {
  const [section, setSection] = useState<ProgressSection>('overview');
  const [range, setRange] = useState<GrowthRange>('30');
  const [collectionKind, setCollectionKind] = useState<'all' | QuestionKind>('all');
  const [collectionSource, setCollectionSource] = useState<CollectionSourceFilter>('all');
  const [collectionSearch, setCollectionSearch] = useState('');
  const [archiveQuery, setArchiveQuery] = useState('');
  const [archiveFilter, setArchiveFilter] = useState<ArchiveFilter>('all');
  const [archiveTopicFilter, setArchiveTopicFilter] = useState<ArchiveTopicFilter>('all');
  const [archiveFormFilter, setArchiveFormFilter] = useState<ArchiveFormFilter>('all');
  const [archiveDifficultyFilter, setArchiveDifficultyFilter] = useState<ArchiveDifficultyFilter>('all');
  const [archiveCollapsed, setArchiveCollapsed] = useState(false);
  const [archiveListHeight, setArchiveListHeight] = useState(() => storedNumber(GROWTH_ARCHIVE_HEIGHT_KEY, 520, 320, 960));
  const [growthNavWidth, setGrowthNavWidth] = useState(() => storedNumber(GROWTH_NAV_WIDTH_KEY, 210, 168, 360));
  const [growthNavCollapsed, setGrowthNavCollapsed] = useState(() => {
    try { return window.localStorage.getItem(GROWTH_NAV_COLLAPSED_KEY) === 'true'; } catch { return false; }
  });
  const [detailReport, setDetailReport] = useState<StoredLearningReport | null>(null);
  const [archiveEpisodeId, setArchiveEpisodeId] = useState<string | null>(null);
  const [editorTarget, setEditorTarget] = useState<ReportEditorTarget | null>(null);
  const [accumulationTarget, setAccumulationTarget] = useState<AccumulationEditorTarget | null>(null);
  const model = useMemo(() => buildGrowthModel({ episodes, studyAttempts, completions, aiReports, liveReports: reports, range }), [aiReports, completions, episodes, range, reports, studyAttempts]);
  const stats = calculateProgress(episodes, completions, reports);
  const episodeById = useMemo(() => new Map(episodes.map((item) => [item.id, item])), [episodes]);
  const selectedLiveReports = useMemo(() => reports.filter((item) => item.sessionDate <= model.bounds.to && (!model.bounds.from || item.sessionDate >= model.bounds.from)).sort((a, b) => b.sessionDate.localeCompare(a.sessionDate) || b.updatedAt.localeCompare(a.updatedAt)), [model.bounds, reports]);
  const latest = selectedLiveReports[0];
  const maxMinutes = Math.max(1, ...stats.sevenDays.flatMap((day) => [day.videoMinutes, day.gptMinutes]));
  const nextMilestone = [10, 25, 50, 75, 100].find((item) => item > stats.completed) ?? Math.ceil((stats.completed + 1) / 25) * 25;
  const lowestDimension = [...model.dimensions].sort((a, b) => (a.score ?? -1) - (b.score ?? -1))[0];
  const visibleCollectionEntries = model.collectionEntries.filter((item) => {
    if (collectionKind !== 'all' && item.kind !== collectionKind) return false;
    if (collectionSource !== 'all' && item.source !== collectionSource) return false;
    const needle = collectionSearch.trim().toLowerCase();
    return !needle || `${item.label} ${item.prompt} ${item.explanation} ${item.example}`.toLowerCase().includes(needle);
  });
  const visibleArchive = model.archive.filter((item) => {
    const needle = archiveQuery.trim().toLowerCase();
    const haystack = `${item.episode.title} ${item.latestDate} ${item.aiReport?.report.materialAnalysis.summary ?? ''}`.toLowerCase();
    if (needle && !haystack.includes(needle)) return false;
    if (archiveFilter === 'completed' && !item.completedAt) return false;
    if (archiveFilter === 'needs_ai' && item.aiReports.length) return false;
    if (archiveFilter === 'needs_live' && item.liveReports.length) return false;
    const analysis = item.aiReport?.report.materialAnalysis;
    if (archiveTopicFilter !== 'all' && analysis?.primaryTopic !== archiveTopicFilter) return false;
    if (archiveFormFilter !== 'all' && analysis?.contentForm !== archiveFormFilter) return false;
    if (archiveDifficultyFilter !== 'all' && analysis?.subtitleDifficulty !== archiveDifficultyFilter) return false;
    return true;
  });
  const latestEpisode = latest ? episodeById.get(latest.episodeId) : undefined;
  const assessedDetails = latest?.report.details.filter((item) => item.status !== 'not_assessed') ?? [];
  const independentDetails = assessedDetails.filter((item) => item.status === 'independent').length;
  const archiveEntry = archiveEpisodeId ? model.archive.find((item) => item.episode.id === archiveEpisodeId) ?? null : null;
  const growthNavMaximum = Math.max(168, Math.min(360, window.innerWidth - 540));
  const archiveHeightMaximum = Math.max(360, Math.min(960, window.innerHeight - 220));
  const growthShellStyle = {
    '--growth-nav-width': `${Math.min(growthNavWidth, growthNavMaximum)}px`,
    '--archive-list-height': `${Math.min(archiveListHeight, archiveHeightMaximum)}px`,
  } as CSSProperties;

  const navItems: Array<{ id: ProgressSection; label: string; icon: typeof LayoutDashboard }> = [
    { id: 'overview', label: '成长总览', icon: LayoutDashboard },
    { id: 'scoring', label: '评分解读', icon: Radar },
    { id: 'portfolio', label: '内容画像', icon: PieChart },
    { id: 'collection', label: '学习积累', icon: BookOpenCheck },
    { id: 'archive', label: '学习档案', icon: FolderClock },
  ];

  return (
    <main className="growth-page">
      <div className={`growth-shell${growthNavCollapsed ? ' growth-nav-collapsed' : ''}`} style={growthShellStyle}>
        <aside className="growth-nav" aria-label="进步区分区导航">
          <div className="growth-nav-scroll">
            <div className="growth-nav-heading"><span>进步区</span><button className="icon-button" type="button" onClick={() => { const next = !growthNavCollapsed; setGrowthNavCollapsed(next); storeValue(GROWTH_NAV_COLLAPSED_KEY, String(next)); }} aria-label={growthNavCollapsed ? '展开进步区导航' : '折叠进步区导航'} title={growthNavCollapsed ? '展开导航' : '折叠导航'}>{growthNavCollapsed ? <PanelLeftOpen size={16} /> : <PanelLeftClose size={16} />}</button></div>
            <div className="growth-nav-items">{navItems.map((item, index) => { const Icon = item.icon; return <button className={section === item.id ? 'active' : ''} type="button" key={item.id} onClick={() => setSection(item.id)} title={growthNavCollapsed ? item.label : undefined}><Icon size={17} /><span>{item.label}</span><small>0{index + 1}</small></button>; })}</div>
          </div>
          <div className="growth-nav-bottom">
            <button className="growth-nav-settings" type="button" onClick={onOpenSettings} title="设置与数据管理"><Settings size={17} /><span>设置与数据管理</span></button>
            <div className="growth-nav-range"><strong>当前范围</strong><span>{model.completedCount} 集完成学习<br />{model.aiVideoCount} 个视频 / {model.aiReportCount} 份 AI 报告<br />{model.liveCount} 份 Live 报告</span></div>
          </div>
        </aside>
        {!growthNavCollapsed && <ResizeHandle className="growth-nav-resize-handle" orientation="vertical" label="调整进步区导航宽度" value={Math.min(growthNavWidth, growthNavMaximum)} minimum={168} maximum={growthNavMaximum} defaultValue={210} onChange={(value, committed) => { setGrowthNavWidth(value); if (committed) storeValue(GROWTH_NAV_WIDTH_KEY, String(value)); }} />}

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

          </>}

          {section === 'scoring' && <>
            <section className="growth-section scoring-methods"><header><div><span>评分来源与权重</span><h2>每个维度只使用自己的证据</h2></div><strong>{model.overallScore === null ? '证据不足' : `${model.overallScore} / 100`}</strong></header><div>{model.dimensions.map((item) => <div className="growth-method" key={item.id}><div><strong>{item.label}</strong><small>{item.source} · 权重 {item.weight}%</small></div><div className="growth-method-track"><i style={{ width: `${item.score ?? 0}%` }} /></div><b>{item.score ?? '—'}</b><p>{item.summary}</p></div>)}</div></section>
            <section className="growth-panel scoring-boundary"><AlertCircle size={22} /><div><h2>证据边界</h2><p>AI 报告说明材料挑战和主动提问；三遍分只表示流程记录；只有 GPT Live 的实际回答、复述、迁移和提示使用进入理解表现。缺失维度不按零分处理，也不由其他维度代填。</p></div></section>
          </>}

          {section === 'portfolio' && <section className="growth-section portfolio-section"><header><div><span>已分析材料</span><h2>内容画像</h2></div><small>{model.aiVideoCount} 个视频 · {model.aiReportCount} 份报告</small></header>{model.aiVideoCount ? <div className="portfolio-layout"><div className="portfolio-column portfolio-column-topics"><div className="portfolio-column-heading"><div><span>主题分布</span><h3>你正在探索的领域</h3></div><strong>{model.topics.length} 类</strong></div><div className="distribution-list">{model.topics.map((item, index) => <div className={`distribution-item tone-${index % 6}`} key={item.id}><span>{topicLabels[item.id]}</span><div className="distribution-bar"><i><b style={{ width: `${item.count / Math.max(1, model.aiVideoCount) * 100}%` }} /></i><strong>{item.count} 集</strong></div></div>)}</div></div><div className="portfolio-column portfolio-column-side"><div className="portfolio-subsection"><div className="portfolio-column-heading"><div><span>内容形式</span><h3>材料的叙事方式</h3></div><strong>{model.forms.length} 类</strong></div><div className="distribution-list">{model.forms.map((item, index) => <div className={`distribution-item tone-${(index + 2) % 6}`} key={item.id}><span>{contentFormLabels[item.id]}</span><div className="distribution-bar"><i><b style={{ width: `${item.count / Math.max(1, model.aiVideoCount) * 100}%` }} /></i><strong>{item.count} 集</strong></div></div>)}</div></div><div className="portfolio-subsection difficulty-subsection"><div className="portfolio-column-heading"><div><span>字幕难度</span><h3>输入强度分布</h3></div></div><div className="difficulty-list">{model.difficulties.map((item) => <span key={item.id}><b>{item.id}</b><small>{item.count} 集</small></span>)}</div></div></div></div> : <div className="growth-empty"><Compass size={25} /><span>生成或导入 AI 助手报告后显示主题、形式和字幕难度分布。</span></div>}</section>}

          {section === 'collection' && <section className="growth-section collection-section">
            <header><div><span>主动问题与 AI 推荐</span><h2>学习积累</h2></div></header>
            <div className="collection-workspace">
              <aside className="collection-filter-rail" aria-label="学习积累分类">
                <span>分类</span>
                {(['all', 'vocabulary', 'grammar', 'expression', 'comprehension', 'translation'] as const).map((kind) => <button className={collectionKind === kind ? 'active' : ''} type="button" onClick={() => setCollectionKind(kind)} key={kind}>{kind === 'all' ? '全部' : questionKindLabels[kind]}</button>)}
              </aside>
              <div className="collection-results">
                <div className="collection-results-header"><div><strong>{collectionKind === 'all' ? '全部积累' : questionKindLabels[collectionKind]}</strong><small>{visibleCollectionEntries.length} 条记录 · {visibleCollectionEntries.filter((item) => item.source === 'user_question').length} 个主动问题 · {visibleCollectionEntries.filter((item) => item.source === 'ai_recommendation').length} 条 AI 推荐</small></div><div className="collection-results-controls"><label className="collection-source-filter"><span>来源</span><select value={collectionSource} onChange={(event) => setCollectionSource(event.target.value as CollectionSourceFilter)} aria-label="筛选积累来源"><option value="all">全部来源</option><option value="user_question">主动问题</option><option value="ai_recommendation">AI 推荐</option></select></label><label className="collection-search"><Search size={15} /><input value={collectionSearch} onChange={(event) => setCollectionSearch(event.target.value)} placeholder="搜索词汇、语法、问题或例句" aria-label="搜索学习积累" /></label></div></div>
                {visibleCollectionEntries.length ? <div className="collection-entry-list">{visibleCollectionEntries.map((item) => <CollectionEntryCard item={item} episodeById={episodeById} key={item.id} onEdit={(entry) => {
                  const source = aiReports.find((report) => report.fingerprint === entry.sourceReportFingerprint);
                  if (!source) return;
                  if (entry.source === 'user_question') { setAccumulationTarget({ kind: 'question', stored: source, questionKey: entry.id.slice('question:'.length) }); return; }
                  if (entry.kind === 'grammar') { setAccumulationTarget({ kind: 'grammar', stored: source, pattern: entry.label }); return; }
                  setAccumulationTarget({ kind: 'vocabulary', stored: source, term: entry.label });
                }} />)}</div> : <div className="growth-empty"><BookOpenCheck size={25} /><span>当前范围没有符合条件的学习积累。</span></div>}
              </div>
            </div>
            <p className="collection-footnote">来源标签用于区分用户主动问题与 AI 推荐；编辑会校验并同步写回来源 AI 报告，学习积累和成长统计随即刷新。</p>
          </section>}

          {section === 'archive' && <>
            <section className="growth-section archive-section">
              <header><div><span>单集证据</span><h2>学习档案</h2></div><small>{visibleArchive.length} / {model.archive.length} 个视频</small></header>
              <div className="archive-toolbar">
                <label className="collection-search archive-search"><Search size={15} /><input value={archiveQuery} onChange={(event) => setArchiveQuery(event.target.value)} placeholder="搜索视频或材料摘要" aria-label="搜索学习档案" /></label>
                <select value={archiveFilter} onChange={(event) => setArchiveFilter(event.target.value as ArchiveFilter)} aria-label="筛选记录状态"><option value="all">全部记录</option><option value="completed">已完成学习</option><option value="needs_ai">待 AI 报告</option><option value="needs_live">待 Live 报告</option></select>
                <select value={archiveTopicFilter} onChange={(event) => setArchiveTopicFilter(event.target.value as ArchiveTopicFilter)} aria-label="按主题筛选"><option value="all">全部主题</option>{model.topics.map((item) => <option value={item.id} key={item.id}>{topicLabels[item.id]} · {item.count}</option>)}</select>
                <select value={archiveFormFilter} onChange={(event) => setArchiveFormFilter(event.target.value as ArchiveFormFilter)} aria-label="按内容形式筛选"><option value="all">全部形式</option>{model.forms.map((item) => <option value={item.id} key={item.id}>{contentFormLabels[item.id]} · {item.count}</option>)}</select>
                <select value={archiveDifficultyFilter} onChange={(event) => setArchiveDifficultyFilter(event.target.value as ArchiveDifficultyFilter)} aria-label="按难度筛选"><option value="all">全部难度</option>{model.difficulties.map((item) => <option value={item.id} key={item.id}>{item.id} · {item.count}</option>)}</select>
                <button className="icon-button" type="button" onClick={() => setArchiveCollapsed((current) => !current)} aria-label={archiveCollapsed ? '展开学习档案' : '折叠学习档案'} title={archiveCollapsed ? '展开档案' : '折叠档案'}>{archiveCollapsed ? <PanelTopOpen size={16} /> : <PanelTopClose size={16} />}</button>
              </div>
              {!archiveCollapsed && (model.archive.length ? (visibleArchive.length ? <div className="archive-list-resizable">
                <div className="archive-table-wrap archive-list-viewport"><table className="growth-table archive-table" aria-label="学习档案列表"><thead><tr><th>日期</th><th>视频</th><th>分类</th><th>难度</th><th>AI 报告</th><th>GPT Live</th></tr></thead><tbody>{visibleArchive.map((item) => <tr key={item.episode.id} onClick={() => setArchiveEpisodeId(item.episode.id)}><td>{item.latestDate}</td><td><strong>{item.episode.title}</strong><small>{item.completedAt ? '完成学习' : '有报告记录'}</small></td><td>{item.aiReport ? `${topicLabels[item.aiReport.report.materialAnalysis.primaryTopic]} · ${contentFormLabels[item.aiReport.report.materialAnalysis.contentForm]}` : '未分析'}</td><td>{item.aiReport?.report.materialAnalysis.subtitleDifficulty ?? '—'}</td><td><span className={item.aiReports.length ? 'report-ready' : 'report-pending'}>{item.aiReports.length ? `${item.aiReports.length} 份` : '未保存'}</span></td><td><span className={item.liveReports.length ? 'report-ready' : 'report-pending'}>{item.liveReports.length ? `${item.liveReports.length} 份` : '未导回'}</span></td></tr>)}</tbody></table></div>
                <ResizeHandle className="archive-resize-handle" orientation="horizontal" label="调整学习档案显示高度" value={Math.min(archiveListHeight, archiveHeightMaximum)} minimum={320} maximum={archiveHeightMaximum} defaultValue={520} onChange={(value, committed) => { setArchiveListHeight(value); if (committed) storeValue(GROWTH_ARCHIVE_HEIGHT_KEY, String(value)); }} />
              </div> : <div className="growth-empty"><Search size={25} /><span>没有符合当前筛选条件的学习档案。</span></div>) : <div className="growth-empty"><FolderClock size={25} /><span>当前范围没有学习档案。</span></div>)}
            </section>
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
        <section className="archive-live-summary"><h3>GPT Live 记录</h3>{archiveEntry.liveReports.length ? <div>{archiveEntry.liveReports.map((item) => <article key={item.sessionId}><div className="archive-live-main"><button type="button" onClick={() => { setArchiveEpisodeId(null); setDetailReport(item); }}><strong>{item.sessionDate}</strong><span>{item.report.summary}</span></button>{item.durationMinutes === null ? <DurationEditor report={item} onSave={(minutes) => onUpdateDuration(item.sessionId, minutes)} /> : <small>{item.durationMinutes} 分钟 · {item.durationSource === 'user_confirmed' ? '已确认时长' : '报告时长'}</small>}</div><div className="report-record-actions"><button className="icon-button" type="button" onClick={() => setEditorTarget({ kind: 'live', stored: item })} aria-label={`编辑 Live 报告 ${item.sessionId}`} title="编辑 Live 报告"><Pencil size={15} /></button><button className="icon-button danger" type="button" onClick={() => { if (window.confirm('删除这份 GPT Live 报告？视频完成状态不会改变。')) onDeleteReport(item.sessionId); }} aria-label={`删除 Live 报告 ${item.sessionId}`} title="删除 Live 报告"><Trash2 size={15} /></button></div></article>)}</div> : <p>本集尚未导回 GPT Live 报告，因此没有理解表现证据。</p>}</section>
      </div><footer className="archive-detail-actions"><button className="secondary-button" type="button" onClick={() => { const id = archiveEntry.episode.id; setArchiveEpisodeId(null); onOpenEpisode(id); }}>打开本集</button><button className="primary-button" type="button" onClick={() => { const id = archiveEntry.episode.id; setArchiveEpisodeId(null); onReinforce(id); }}><RefreshCw size={16} />再次巩固</button></footer></section></div>}
      <AccumulationEditorDialog target={accumulationTarget} onClose={() => setAccumulationTarget(null)} onSave={onUpdateAiReport} />
      <ReportEditorDialog target={editorTarget} onClose={() => setEditorTarget(null)} onSaveAiReport={onUpdateAiReport} onSaveLiveReport={onUpdateReport} />
    </main>
  );
}
