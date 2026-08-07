import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check, ChevronRight, Cloud, CloudOff, ExternalLink, FileDown,
  FileJson, FilePlus2, Headphones, Import, Library, ListChecks, Monitor, Moon, MoreHorizontal,
  Pencil, Play, PlayCircle, Search, Sparkles, Sun, Trash2, TrendingUp, Tv, Undo2, X,
} from 'lucide-react';
import { PracticeWorkspace } from './components/PracticeWorkspace';
import { AiStudyAssistant } from './components/AiStudyAssistant';
import { AiProviderSettingsDialog } from './components/AiProviderSettingsDialog';
import { LearningReturnImportDialog } from './components/LearningReturnImportDialog';
import { ProgressView } from './components/ProgressView';
import { RecallWorkspace } from './components/RecallWorkspace';
import { ReportImportDialog, type ReportImportSummary } from './components/ReportImportDialog';
import { SyncDialog } from './components/SyncDialog';
import { WorkspaceSettingsDialog } from './components/WorkspaceSettingsDialog';
import { TranscriptWorkspace } from './components/TranscriptWorkspace';
import { VideoEditor } from './components/VideoEditor';
import { LayoutControls, ResizableWorkspace, type LayoutPreferencesUpdater } from './layout/ResizableWorkspace';
import { loadLayoutPreferences, saveLayoutPreferences } from './layout/layoutPreferences';
import {
  buildLiveMarkdown, createCustomVideo, createStudyAttempt, formatDuration,
  safeFileStem, sourcesToLinks, splitTranscript, suggestKeywords, type Episode, type EpisodeTranscript,
  type Highlight, type StudyAttempt, type VideoDraft,
} from './domain/learning';
import { buildBlankIntegratedLearningMarkdown } from './domain/aiStudy';
import { createStoredReport, reportFingerprint, type LearningReportV1, type StoredLearningReport } from './domain/report';
import { aiReportFingerprint, createStoredAiReport, sortAiReportsNewest, type AiAssistantReport, type StoredAiAssistantReport, type TranscriptSource } from './domain/aiReport';
import { toProviderOverride, type AiProviderProfile } from './domain/aiProvider';
import { applyLearningReturnPackage, type LearningReturnPackage, type ReturnImportSummary } from './domain/learningReturn';
import { effectiveEpisode, emptyWorkspace, LEGACY_AI_CONVERSATION_KEY, migrateEpisodeIdentity, migrateWorkspace, type Theme, type WorkspaceState } from './domain/workspace';
import { downloadTextFile } from './download';
import { loadStoredActiveProviderId, loadStoredAiProfiles, saveStoredActiveProviderId, saveStoredAiProfiles } from './aiProviderStore';
import { loadWorkspace, saveWorkspace } from './storage';
import { useAutoSync } from './useAutoSync';

type Step = 'practice' | 'recall' | 'live';
type View = 'library' | 'progress';
type Sort = 'newest' | 'oldest' | 'uncompleted' | 'shortest' | 'longest';
type Filter = 'all' | 'completed' | 'uncompleted';

const emptyTranscript = (id: string): EpisodeTranscript => ({ episodeId: id, englishTranscript: '', chineseTranscript: '', englishSegments: [], chineseSegments: [] });
const steps: Array<{ id: Step; label: string; icon: typeof Play }> = [
  { id: 'practice', label: '三遍练习', icon: Headphones }, { id: 'recall', label: '回忆复述', icon: ListChecks },
  { id: 'live', label: 'GPT Live', icon: Sparkles },
];
function localDateStamp(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}

function reanchorHighlights(items: Highlight[], episodeId: string, language: 'en' | 'zh', transcript: string) {
  const segments = splitTranscript(transcript, language);
  return items.map((item) => {
    if (item.episodeId !== episodeId || item.language !== language) return item;
    for (let index = 0; index < segments.length; index += 1) {
      const offset = segments[index].indexOf(item.quote);
      if (offset >= 0) return { ...item, segmentIndex: index, startOffset: offset, endOffset: offset + item.quote.length };
    }
    return item;
  });
}

function stepForAttempt(attempt: StudyAttempt): Step {
  if (!attempt.passes.transcriptStudy.completedAt) return 'practice';
  if (!attempt.recall.completedAt) return 'recall';
  return 'live';
}

function App() {
  const [catalog, setCatalog] = useState<Episode[]>([]);
  const [workspace, setWorkspace] = useState<WorkspaceState>(emptyWorkspace);
  const [ready, setReady] = useState(false);
  const [selectedId, setSelectedId] = useState('');
  const [step, setStep] = useState<Step>('practice');
  const [view, setView] = useState<View>('library');
  const [query, setQuery] = useState('');
  const [sort, setSort] = useState<Sort>('newest');
  const [filter, setFilter] = useState<Filter>('all');
  const [transcripts, setTranscripts] = useState<Record<string, EpisodeTranscript>>({});
  const [loadingTranscript, setLoadingTranscript] = useState(false);
  const [keywords, setKeywords] = useState<string[]>([]);
  const [keywordDraft, setKeywordDraft] = useState('');
  const [notice, setNotice] = useState('');
  const [editorOpen, setEditorOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [online, setOnline] = useState(navigator.onLine);
  const [updateReady, setUpdateReady] = useState(false);
  const [reportImportOpen, setReportImportOpen] = useState(false);
  const [reportImportEpisodeId, setReportImportEpisodeId] = useState<string | undefined>();
  const [returnImportOpen, setReturnImportOpen] = useState(false);
  const [syncOpen, setSyncOpen] = useState(false);
  const [workspaceSettingsOpen, setWorkspaceSettingsOpen] = useState(false);
  const [layoutPreferences, setLayoutPreferences] = useState(loadLayoutPreferences);
  const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
  const [aiProfiles, setAiProfiles] = useState<AiProviderProfile[]>(() => loadStoredAiProfiles());
  const [activeAiProfileId, setActiveAiProfileId] = useState<string>(() => loadStoredActiveProviderId());
  const [sessionAiKeys, setSessionAiKeys] = useState<Record<string, string>>({});
  const importRef = useRef<HTMLInputElement>(null);
  const startupRequested = useRef(false);
  const demoLoaded = useRef(false);
  const demoRequested = useRef(new URLSearchParams(window.location.search).has('demo'));

  useEffect(() => {
    if (startupRequested.current) return;
    startupRequested.current = true;
    loadWorkspace().then((stored) => {
      const migrated = migrateEpisodeIdentity(stored, stored.customVideos);
      setCatalog([]); setWorkspace(migrated); setSelectedId(migrated.customVideos[0]?.id ?? ''); setReady(true);
    }).catch(() => setNotice('本机工作区加载失败，请刷新后重试。'));
  }, []);

  useEffect(() => {
    if (!ready) return;
    setWorkspace((current) => {
      const migrated = migrateEpisodeIdentity(current, episodes);
      const sameAliases = JSON.stringify(migrated.episodeAliases ?? {}) === JSON.stringify(current.episodeAliases ?? {});
      const sameHistory = JSON.stringify(migrated.episodeAliasHistory ?? {}) === JSON.stringify(current.episodeAliasHistory ?? {});
      return sameAliases && sameHistory ? current : migrated;
    });
  }, [ready, catalog, workspace.customVideos, workspace.hiddenEpisodeIds, workspace.metadataOverrides, workspace.linkOverrides]);

  useEffect(() => {
    if (!ready) return;
    const timer = window.setTimeout(() => void saveWorkspace(workspace), 180);
    return () => window.clearTimeout(timer);
  }, [ready, workspace]);

  useEffect(() => {
    if (!import.meta.env.DEV || !ready || !demoRequested.current || demoLoaded.current) return;
    demoLoaded.current = true;
    void loadGrowthDemo(true);
  }, [ready]);

  useEffect(() => {
    const theme = workspace.preferences.theme;
    if (theme === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = theme;
  }, [workspace.preferences.theme]);

  useEffect(() => {
    const onOnline = () => setOnline(true); const onOffline = () => setOnline(false);
    const onUpdate = () => setUpdateReady(true);
    window.addEventListener('online', onOnline); window.addEventListener('offline', onOffline); window.addEventListener('app-update-ready', onUpdate);
    return () => { window.removeEventListener('online', onOnline); window.removeEventListener('offline', onOffline); window.removeEventListener('app-update-ready', onUpdate); };
  }, []);

  useEffect(() => {
    saveStoredAiProfiles(aiProfiles);
  }, [aiProfiles]);

  useEffect(() => {
    saveStoredActiveProviderId(activeAiProfileId);
  }, [activeAiProfileId]);

  const autoSync = useAutoSync({ ready, online, paused: syncOpen, workspace, setWorkspace, onNotice: setNotice });

  const episodes = useMemo(() => [...workspace.customVideos, ...catalog].filter((item) => !workspace.hiddenEpisodeIds?.includes(item.id)).map((item) => effectiveEpisode(item, workspace.metadataOverrides[item.id], workspace.linkOverrides?.[item.id])), [catalog, workspace.customVideos, workspace.hiddenEpisodeIds, workspace.metadataOverrides, workspace.linkOverrides]);
  const activeAiProvider = useMemo(() => {
    const profile = aiProfiles.find((item) => item.id === activeAiProfileId);
    return profile ? toProviderOverride(profile, sessionAiKeys[profile.id]) : undefined;
  }, [activeAiProfileId, aiProfiles, sessionAiKeys]);
  const originalSelected = [...workspace.customVideos, ...catalog].find((item) => item.id === selectedId) ?? null;
  const selected = episodes.find((item) => item.id === selectedId) ?? episodes[0];
  const selectedAttempts = selected ? workspace.studyAttempts[selected.id] ?? [] : [];
  const activeAttempt = selected ? selectedAttempts.find((item) => item.attemptId === workspace.activeAttemptIds[selected.id]) ?? selectedAttempts.at(-1) ?? null : null;
  const legacyRecall = selected ? workspace.legacyRecalls[selected.id] : undefined;
  const selectedHighlights = selected ? workspace.highlights.filter((item) => item.episodeId === selected.id) : [];
  const selectedAiReports = selected ? sortAiReportsNewest(workspace.aiReports.filter((item) => item.episodeId === selected.id)) : [];
  const selectedConversation = selected ? workspace.aiConversations[selected.id] ?? [] : [];
  const transcriptSource: TranscriptSource = selected
    ? workspace.transcriptOverrides[selected.id]
      ? 'workbench'
      : selected.source === 'custom' ? 'user-provided' : 'catalog'
    : 'not-provided';

  useEffect(() => {
    if (!selected) return;
    setWorkspace((current) => {
      const legacy = current.aiConversations[LEGACY_AI_CONVERSATION_KEY];
      if (!legacy || Object.hasOwn(current.aiConversations, selected.id)) return current;
      const aiConversations = { ...current.aiConversations };
      delete aiConversations[LEGACY_AI_CONVERSATION_KEY];
      aiConversations[selected.id] = legacy;
      return { ...current, aiConversations };
    });
  }, [selected?.id]);

  useEffect(() => {
    if (!selected) return;
    setWorkspace((current) => {
      const attempts = current.studyAttempts[selected.id] ?? [];
      const active = attempts.find((item) => item.attemptId === current.activeAttemptIds[selected.id]);
      if (active) return current;
      if (attempts.length) return { ...current, activeAttemptIds: { ...current.activeAttemptIds, [selected.id]: attempts[attempts.length - 1].attemptId } };
      const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
      const attempt = createStudyAttempt(selected, `attempt-${token}`, new Date().toISOString());
      return {
        ...current,
        studyAttempts: { ...current.studyAttempts, [selected.id]: [attempt] },
        activeAttemptIds: { ...current.activeAttemptIds, [selected.id]: attempt.attemptId },
      };
    });
  }, [selected?.id]);

  useEffect(() => {
    if (activeAttempt) setStep(stepForAttempt(activeAttempt));
  }, [activeAttempt?.attemptId, selected?.id]);

  useEffect(() => {
    if (!selected || transcripts[selected.id]) return;
    if (selected.source === 'custom') {
      const value = { episodeId: selected.id, englishTranscript: selected.englishTranscript ?? '', chineseTranscript: selected.chineseTranscript ?? '', englishSegments: [], chineseSegments: [] };
      setTranscripts((current) => ({ ...current, [selected.id]: value }));
      return;
    }
    setLoadingTranscript(true);
    fetch(`${import.meta.env.BASE_URL}data/episodes/${selected.id}.json`).then((response) => {
      if (!response.ok) throw new Error('transcript'); return response.json();
    }).then((value: EpisodeTranscript) => setTranscripts((current) => ({ ...current, [selected.id]: value })))
      .catch(() => setNotice('本集字幕尚未缓存，请联网后重试。')).finally(() => setLoadingTranscript(false));
  }, [selected, transcripts]);

  const originalTranscript = selected ? transcripts[selected.id] ?? emptyTranscript(selected.id) : emptyTranscript('');
  const overrideTranscript = selected ? workspace.transcriptOverrides[selected.id] : undefined;
  const transcript: EpisodeTranscript = selected ? {
    ...originalTranscript,
    englishTranscript: overrideTranscript?.englishTranscript ?? originalTranscript.englishTranscript,
    chineseTranscript: overrideTranscript?.chineseTranscript ?? originalTranscript.chineseTranscript,
  } : emptyTranscript('');

  useEffect(() => {
    if (!selected) return;
    setKeywords(workspace.episodeKeywords?.[selected.id] ?? suggestKeywords(transcript.englishTranscript)); setKeywordDraft('');
  }, [selected?.id, transcript.englishTranscript]);

  const filteredEpisodes = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const values = episodes.filter((episode) => {
      if (needle && !`${episode.title} ${episode.publishedDate}`.toLowerCase().includes(needle)) return false;
      if (filter === 'completed' && !workspace.completions[episode.id]) return false;
      if (filter === 'uncompleted' && workspace.completions[episode.id]) return false;
      return true;
    });
    return values.sort((a, b) => {
      if (sort === 'oldest') return a.publishedDate.localeCompare(b.publishedDate);
      if (sort === 'uncompleted') return Number(!!workspace.completions[a.id]) - Number(!!workspace.completions[b.id]) || b.publishedDate.localeCompare(a.publishedDate);
      if (sort === 'shortest') return (a.durationSeconds ?? Number.MAX_SAFE_INTEGER) - (b.durationSeconds ?? Number.MAX_SAFE_INTEGER);
      if (sort === 'longest') return (b.durationSeconds ?? -1) - (a.durationSeconds ?? -1);
      return b.publishedDate.localeCompare(a.publishedDate);
    });
  }, [episodes, filter, query, sort, workspace.completions]);

  const updateLayoutPreferences: LayoutPreferencesUpdater = (updater, persist = true) => {
    setLayoutPreferences((current) => {
      const next = updater(current);
      if (persist) saveLayoutPreferences(next);
      return next;
    });
  };

  const ThemeIcon = workspace.preferences.theme === 'light' ? Sun : workspace.preferences.theme === 'dark' ? Moon : Monitor;
  const appHeader = (
    <header className="topbar">
      <button className="brand-block" type="button" onClick={() => setView('library')}><span className="brand-mark">L</span><span><strong>Luma Learning Lab</strong><small>每天都往前走</small></span></button>
      <nav className="main-nav" aria-label="主导航">
        <button className={view === 'library' ? 'active' : ''} type="button" onClick={() => setView('library')}><Library size={17} />片库</button>
        <button className={view === 'progress' ? 'active' : ''} type="button" onClick={() => setView('progress')}><TrendingUp size={17} />进步</button>
      </nav>
      <div className="top-actions">
        {!online && <span className="offline-label"><CloudOff size={15} />离线</span>}
        {updateReady && <button className="update-button" type="button" onClick={() => location.reload()}>更新已就绪</button>}
        <input ref={importRef} className="visually-hidden" type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) void importWorkspace(file); event.target.value = ''; }} />
        {view === 'library' && <LayoutControls preferences={layoutPreferences} onPreferencesChange={updateLayoutPreferences} />}
        <button className="icon-button" type="button" onClick={cycleTheme} title="切换主题" aria-label="切换主题"><ThemeIcon size={18} /></button>
      </div>
    </header>
  );

  if (!ready) return <div className="loading-screen"><span className="brand-mark">T</span><strong>正在打开工作台…</strong><small>{notice}</small></div>;
  if (!selected) return (
    <div className="app-shell">
      {appHeader}
      {view === 'progress' ? <ProgressView episodes={episodes} studyAttempts={workspace.studyAttempts} completions={workspace.completions} aiReports={workspace.aiReports} reports={workspace.reports} onContinue={() => setView('library')} onImport={() => { setReportImportEpisodeId(undefined); setReportImportOpen(true); }} onOpenEpisode={selectEpisode} onReinforce={() => setView('library')} onUpdateDuration={updateReportDuration} onUpdateReport={updateReport} onUpdateAiReport={updateAiReport} onDeleteReport={(sessionId) => { patchWorkspace({ reports: workspace.reports.filter((item) => item.sessionId !== sessionId) }); }} onDeleteAiReport={(fingerprint) => { patchWorkspace({ aiReports: workspace.aiReports.filter((item) => item.fingerprint !== fingerprint) }); }} onOpenSettings={() => setWorkspaceSettingsOpen(true)} /> : (
        <main className="empty-workspace" aria-labelledby="empty-library-title">
          <section>
            <span className="brand-mark">L</span>
            <h1 id="empty-library-title">个人片库尚未载入</h1>
            <p>从云端恢复自己的资料库，或创建一集新视频开始学习。</p>
            <div className="empty-workspace-actions">
              <button className="primary-button" type="button" onClick={() => setSyncOpen(true)}><Cloud size={17} />云同步</button>
              <button className="secondary-button" type="button" onClick={() => { setEditingId(null); setEditorOpen(true); }}><FilePlus2 size={17} />新建视频</button>
              <button className="secondary-button" type="button" onClick={() => setReturnImportOpen(true)}><FileJson size={17} />导入回填包</button>
            </div>
          </section>
        </main>
      )}
      <VideoEditor open={editorOpen} episode={null} originalEpisode={null} onClose={() => { setEditorOpen(false); setEditingId(null); }} onSave={(draft) => { const id = `custom-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`; const video = createCustomVideo(draft, id, new Date().toISOString()); setWorkspace((current) => ({ ...current, customVideos: [video, ...current.customVideos] })); setSelectedId(id); setStep('practice'); setEditorOpen(false); }} />
      <ReportImportDialog open={reportImportOpen} episodes={episodes} existingReports={workspace.reports} completedIds={new Set(Object.keys(workspace.completions))} expectedEpisodeId={reportImportEpisodeId} templateSessionId={reportImportEpisodeId ? workspace.activeSessions[reportImportEpisodeId] : undefined} onClose={() => setReportImportOpen(false)} onCommit={importReports} onViewProgress={() => { setReportImportOpen(false); setView('progress'); }} />
      <LearningReturnImportDialog open={returnImportOpen} episodes={episodes} workspace={workspace} onClose={() => setReturnImportOpen(false)} onCommit={importReturnPackage} onViewProgress={() => { setReturnImportOpen(false); setView('progress'); }} />
      <AiProviderSettingsDialog open={aiSettingsOpen} profiles={aiProfiles} activeProfileId={activeAiProfileId} sessionApiKeys={sessionAiKeys} onClose={() => setAiSettingsOpen(false)} onSaveProfile={saveAiProviderProfile} onDeleteProfile={deleteAiProviderProfile} onSelectProfile={selectAiProviderProfile} />
      <SyncDialog open={syncOpen} workspace={workspace} onClose={() => setSyncOpen(false)} onBackup={exportWorkspace} onRestore={(restored) => { setWorkspace(restored); setSelectedId(restored.customVideos[0]?.id ?? ''); }} onSynced={(message) => { setNotice(message); autoSync.refresh(); }} />
      <WorkspaceSettingsDialog open={workspaceSettingsOpen} onClose={() => setWorkspaceSettingsOpen(false)} onOpenAiSettings={() => setAiSettingsOpen(true)} onOpenSync={() => setSyncOpen(true)} onBackup={exportWorkspace} onRestore={() => importRef.current?.click()} />
    </div>
  );
  if (!activeAttempt) return <div className="loading-screen"><span className="brand-mark">T</span><strong>正在打开学习记录…</strong><small>{notice}</small></div>;
  const currentAttempt = activeAttempt;

  const editingEpisode = editingId ? episodes.find((item) => item.id === editingId) ?? null : null;
  const editingOriginal = editingId ? [...workspace.customVideos, ...catalog].find((item) => item.id === editingId) ?? null : null;
  const completed = !!workspace.completions[selected.id];

  function patchWorkspace(patch: Partial<WorkspaceState>) { setWorkspace((current) => ({ ...current, ...patch })); }
  function saveAiProviderProfile(profile: AiProviderProfile, apiKey: string) {
    setAiProfiles((current) => {
      const index = current.findIndex((item) => item.id === profile.id);
      return index >= 0 ? current.map((item, itemIndex) => itemIndex === index ? profile : item) : [...current, profile];
    });
    setSessionAiKeys((current) => ({ ...current, [profile.id]: apiKey.trim() }));
  }
  function deleteAiProviderProfile(id: string) {
    setAiProfiles((current) => current.filter((item) => item.id !== id));
    setSessionAiKeys((current) => {
      const next = { ...current };
      delete next[id];
      return next;
    });
    setActiveAiProfileId((current) => {
      if (current !== id) return current;
      return aiProfiles.find((item) => item.id !== id)?.id ?? '';
    });
  }
  function selectAiProviderProfile(id: string) { setActiveAiProfileId(id); setNotice('AI 配置已切换，下一次提问生效。'); }
  function selectEpisode(id: string) { setSelectedId(id); setStep('practice'); setView('library'); setNotice(''); }
  function updateAttempt(updater: (current: StudyAttempt) => StudyAttempt) {
    setWorkspace((current) => {
      const attemptId = current.activeAttemptIds[selected.id];
      const attempts = current.studyAttempts[selected.id] ?? [];
      return { ...current, studyAttempts: { ...current.studyAttempts, [selected.id]: attempts.map((item) => item.attemptId === attemptId ? updater(item) : item) } };
    });
  }
  function cycleTheme() {
    const current = workspace.preferences.theme;
    const theme: Theme = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
    patchWorkspace({ preferences: { ...workspace.preferences, theme } });
  }
  function saveVideo(draft: VideoDraft) {
    if (!editingEpisode) {
      const id = `custom-${globalThis.crypto?.randomUUID?.() ?? Date.now()}`;
      const video = createCustomVideo(draft, id, new Date().toISOString());
      patchWorkspace({ customVideos: [video, ...workspace.customVideos] }); setSelectedId(id); setStep('practice'); setNotice('视频已加入片库。');
    } else {
      const links = sourcesToLinks(draft.sources ?? []);
      patchWorkspace({
        metadataOverrides: { ...workspace.metadataOverrides, [editingEpisode.id]: { title: draft.title.trim(), publishedDate: draft.publishedDate } },
        linkOverrides: { ...(workspace.linkOverrides ?? {}), [editingEpisode.id]: { sources: draft.sources ?? [], youtubeUrl: links.youtubeUrl || null, bilibiliUrl: links.bilibiliUrl || '', updatedAt: new Date().toISOString() } },
      }); setNotice('标题、日期和链接已更新。');
    }
    setEditorOpen(false); setEditingId(null);
  }
  function restoreMetadata() {
    if (!editingId) return;
    const next = { ...workspace.metadataOverrides }; delete next[editingId];
    const nextLinks = { ...(workspace.linkOverrides ?? {}) }; delete nextLinks[editingId];
    patchWorkspace({ metadataOverrides: next, linkOverrides: nextLinks }); setEditorOpen(false); setEditingId(null); setNotice('已恢复原始标题、日期和链接。');
  }
  function deleteVideo() {
    if (!selected || !window.confirm(`确定从片库删除《${selected.title}》吗？相关学习记录也会一并删除。`)) return;
    const id = selected.id;
    const studyAttempts = { ...workspace.studyAttempts }; const activeAttemptIds = { ...workspace.activeAttemptIds }; const legacyRecalls = { ...workspace.legacyRecalls };
    const completions = { ...workspace.completions }; const transcriptOverrides = { ...workspace.transcriptOverrides }; const aiConversations = { ...workspace.aiConversations }; const activeSessions = { ...workspace.activeSessions }; const linkOverrides = { ...(workspace.linkOverrides ?? {}) };
    const episodeKeywords = { ...(workspace.episodeKeywords ?? {}) }; const questionLedgers = { ...(workspace.questionLedgers ?? {}) };
    delete studyAttempts[id]; delete activeAttemptIds[id]; delete legacyRecalls[id]; delete completions[id]; delete transcriptOverrides[id]; delete aiConversations[id]; delete activeSessions[id]; delete linkOverrides[id]; delete episodeKeywords[id]; delete questionLedgers[id];
    const hiddenEpisodeIds = selected.source === 'custom'
      ? (workspace.hiddenEpisodeIds ?? []).filter((item) => item !== id)
      : [...(workspace.hiddenEpisodeIds ?? []), id];
    setWorkspace({ ...workspace, customVideos: workspace.customVideos.filter((item) => item.id !== id), hiddenEpisodeIds, studyAttempts, activeAttemptIds, legacyRecalls, completions, transcriptOverrides, aiConversations, activeSessions, linkOverrides, episodeKeywords, questionLedgers, highlights: workspace.highlights.filter((item) => item.episodeId !== id), aiReports: workspace.aiReports.filter((item) => item.episodeId !== id) });
    setSelectedId(episodes.find((item) => item.id !== id)?.id ?? ''); setNotice('视频已删除，相关学习记录已清理。');
  }
  function saveTranscript(language: 'en' | 'zh', value: string) {
    const clearedCustomEnglish = selected.source === 'custom' && language === 'en' && !value.trim();
    const next = { englishTranscript: transcript.englishTranscript, chineseTranscript: transcript.chineseTranscript, [language === 'en' ? 'englishTranscript' : 'chineseTranscript']: value.trim() };
    patchWorkspace({ transcriptOverrides: { ...workspace.transcriptOverrides, [selected.id]: next }, highlights: reanchorHighlights(workspace.highlights, selected.id, language, value) });
    if (clearedCustomEnglish) {
      updateAttempt((current) => ({ ...current, passes: { ...current.passes, transcriptStudy: { ...current.passes.transcriptStudy, completedAt: null, reviewConfirmed: false, transcriptCoverage: 'none' } } }));
    }
    setNotice(clearedCustomEnglish ? '英文字幕已清空，第三遍完成状态已重置。' : '字幕已保存，现可继续选择文字进行 Highlight。');
  }
  function restoreTranscript() {
    const next = { ...workspace.transcriptOverrides }; delete next[selected.id]; patchWorkspace({ transcriptOverrides: next });
    if (selected.source === 'custom') {
      updateAttempt((current) => ({ ...current, passes: { ...current.passes, transcriptStudy: { ...current.passes.transcriptStudy, completedAt: null, reviewConfirmed: false, transcriptCoverage: 'none' } } }));
    }
    setNotice(selected.source === 'custom' ? '已清空自建字幕，第三遍完成状态已重置。' : '已恢复原始字幕。');
  }
  function addKeyword() {
    const value = keywordDraft.trim(); if (!value || keywords.some((item) => item.toLowerCase() === value.toLowerCase())) return;
    const next = [...keywords, value];
    setKeywords(next); setKeywordDraft('');
    patchWorkspace({ episodeKeywords: { ...(workspace.episodeKeywords ?? {}), [selected.id]: next } });
  }
  function removeKeyword(value: string) {
    const next = keywords.filter((item) => item !== value);
    setKeywords(next);
    patchWorkspace({ episodeKeywords: { ...(workspace.episodeKeywords ?? {}), [selected.id]: next } });
  }
  function completeEpisode() {
    patchWorkspace({ completions: { ...workspace.completions, [selected.id]: { completedAt: new Date().toISOString() } } }); setNotice('本集已完成。继续向前。');
  }
  function undoCompletion() { const next = { ...workspace.completions }; delete next[selected.id]; patchWorkspace({ completions: next }); setNotice('已撤销完成标记。'); }
  function createSessionId(episodeId: string) { const token = (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}`).slice(0, 8); return `${localDateStamp()}-${episodeId}-${token}`; }
  function ensureSession() { const existing = workspace.activeSessions[selected.id]; if (existing) return existing; const sessionId = createSessionId(selected.id); patchWorkspace({ activeSessions: { ...workspace.activeSessions, [selected.id]: sessionId } }); return sessionId; }
  function enterLive() { ensureSession(); setStep('live'); }
  function exportLiveMarkdown() {
    const sessionId = ensureSession();
    const markdown = buildLiveMarkdown({ episode: selected, transcript, attempt: currentAttempt, keywords, highlights: selectedHighlights, sessionId, legacyRecall });
    downloadTextFile(markdown, 'text/markdown;charset=utf-8', `${safeFileStem(selected.title)}-gpt-live-${sessionId.slice(-8)}.md`);
    setNotice('GPT Live 文档已导出，包含学习过程和 JSON 报告模板。');
  }
  function startNewAttempt() {
    const token = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    const attempt = createStudyAttempt(selected, `attempt-${token}`, new Date().toISOString());
    const activeSessions = { ...workspace.activeSessions }; delete activeSessions[selected.id];
    setWorkspace({
      ...workspace,
      studyAttempts: { ...workspace.studyAttempts, [selected.id]: [...selectedAttempts, attempt] },
      activeAttemptIds: { ...workspace.activeAttemptIds, [selected.id]: attempt.attemptId },
      activeSessions,
    });
    setStep('practice'); setNotice('已开始一次新的三遍练习，旧尝试仍然保留。');
  }
  function exportWorkspace() { downloadTextFile(JSON.stringify({ exportedAt: new Date().toISOString(), privacyNotice: '此备份包含回忆、Highlight、AI 对话、AI 助手报告和 GPT Live 报告，请妥善保管。', workspace }, null, 2), 'application/json;charset=utf-8', `luma-workspace-${localDateStamp()}.json`); setNotice('完整工作区备份已导出，其中包含 AI 对话和两类学习报告。'); }
  function exportBlankTemplate() { downloadTextFile(buildBlankIntegratedLearningMarkdown(), 'text/markdown;charset=utf-8', 'luma-blank-ai-learning-template.md'); setNotice('空白 AI 学习模板已导出，可直接交给任意 AI 对话平台。'); }
  async function importWorkspace(file: File) {
    try {
      const payload = JSON.parse(await file.text());
      const value = migrateWorkspace(payload.workspace ?? payload);
      if (!value) throw new Error('schema');
      if (payload.kind === 'luma-personal-library-workspace/v1') {
        const importedIds = new Set(value.customVideos.map((item) => item.id));
        setWorkspace((current) => ({ ...current, customVideos: [...value.customVideos, ...current.customVideos.filter((item) => !importedIds.has(item.id))] }));
        setSelectedId(value.customVideos[0]?.id ?? ''); setNotice('个人片库已合并到本机，现有学习记录未覆盖。');
      } else {
        setWorkspace(value); setSelectedId(value.customVideos[0]?.id ?? ''); setNotice('工作区备份已恢复。');
      }
    }
    catch { setNotice('备份文件无效或版本不兼容，未覆盖现有数据。'); }
  }
  async function loadGrowthDemo(confirmBefore = true) {
    try {
      const response = await fetch(`${import.meta.env.BASE_URL}data/luma-growth-demo-workspace.json`);
      if (!response.ok) throw new Error('demo');
      const payload = await response.json() as { workspace?: unknown };
      const value = migrateWorkspace(payload.workspace ?? payload);
      if (!value) throw new Error('schema');
      if (confirmBefore && !window.confirm('载入成长演示数据会覆盖当前工作区，确认继续？')) return;
      setWorkspace(value);
      setView('progress');
      setNotice('成长演示数据已载入，可在进步区查看效果。');
    } catch {
      setNotice('成长演示数据载入失败，请确认 public/data 中存在演示文件。');
    }
  }
  function continueNext() {
    const next = episodes.find((item) => !workspace.completions[item.id]) ?? episodes[0]; selectEpisode(next.id);
  }

  function importReports(incoming: LearningReportV1[], markCompleted: boolean): ReportImportSummary {
    const reports = [...workspace.reports];
    const completions = { ...workspace.completions };
    const activeSessions = { ...workspace.activeSessions };
    const summary: ReportImportSummary = { added: 0, updated: 0, duplicate: 0, needsDuration: 0, markedCompleted: 0 };
    for (const report of incoming) {
      const index = reports.findIndex((item) => item.sessionId === report.sessionId);
      const existing = index >= 0 ? reports[index] : undefined;
      if (existing?.fingerprint === reportFingerprint(report)) summary.duplicate += 1;
      else if (existing) { reports[index] = createStoredReport(report, existing); summary.updated += 1; }
      else { reports.push(createStoredReport(report)); summary.added += 1; }
      if (report.durationMinutes === null) summary.needsDuration += 1;
      if (markCompleted && !completions[report.episodeId]) {
        completions[report.episodeId] = { completedAt: new Date(`${report.sessionDate}T12:00:00`).toISOString() };
        summary.markedCompleted += 1;
      }
      if (activeSessions[report.episodeId] === report.sessionId) delete activeSessions[report.episodeId];
    }
    setWorkspace({ ...workspace, reports, completions, activeSessions });
    return summary;
  }

  function importAiReport(report: AiAssistantReport) {
    if (workspace.aiReports.some((item) => item.fingerprint === aiReportFingerprint(report))) return 'duplicate';
    const aiReports = [...workspace.aiReports, createStoredAiReport(report)];
    patchWorkspace({ aiReports });
    setNotice(`AI 助手报告已导入，本集现有 ${aiReports.filter((item) => item.episodeId === report.episodeId).length} 份。`);
    return 'added';
  }

  function importReturnPackage(pkg: LearningReturnPackage, options: { episodeId?: string; markCompleted: boolean }): ReturnImportSummary {
    const allLibraryEpisodes = [...workspace.customVideos, ...catalog];
    const result = applyLearningReturnPackage(workspace, pkg, {
      ...options,
      newEpisodeId: `custom-${globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2, 8)}`}`,
      existingEpisodes: allLibraryEpisodes,
      now: new Date().toISOString(),
    });
    setWorkspace({
      ...result.workspace,
      hiddenEpisodeIds: (result.workspace.hiddenEpisodeIds ?? []).filter((id) => id !== result.episodeId),
    });
    setSelectedId(result.episodeId); setView('library'); setStep('practice');
    setNotice(result.summary.createdVideo ? '学习回填包已导入并新建视频。' : '学习回填包已写入现有视频。');
    return result.summary;
  }

  function updateReportDuration(sessionId: string, minutes: number) {
    const now = new Date().toISOString();
    patchWorkspace({ reports: workspace.reports.map((item) => {
      if (item.sessionId !== sessionId) return item;
      const report = { ...item.report, durationMinutes: minutes, durationSource: 'user_confirmed' as const };
      return { ...item, durationMinutes: minutes, durationSource: 'user_confirmed', durationUpdatedAt: now, updatedAt: now, fingerprint: reportFingerprint(report), report };
    }) });
    setNotice('GPT 巩固时长已补录。');
  }

  function updateReport(stored: StoredLearningReport, report: LearningReportV1) {
    if (!workspace.reports.some((item) => item.sessionId === stored.sessionId && item.fingerprint === stored.fingerprint)) return { ok: false, message: '这份 Live 报告已被其他操作修改或删除，请关闭后重新打开。' };
    const next = createStoredReport(report, stored);
    patchWorkspace({ reports: workspace.reports.map((item) => item.sessionId === stored.sessionId ? next : item) });
    setNotice('GPT Live 报告已修改，进步区统计已更新。');
    return { ok: true };
  }

  function updateAiReport(stored: StoredAiAssistantReport, report: AiAssistantReport) {
    if (!workspace.aiReports.some((item) => item.fingerprint === stored.fingerprint)) return { ok: false, message: '这份 AI 报告已被其他操作修改或删除，请关闭后重新打开。' };
    const next = createStoredAiReport(report, stored);
    if (workspace.aiReports.some((item) => item.fingerprint !== stored.fingerprint && item.fingerprint === next.fingerprint)) return { ok: false, message: '修改后的内容与已有 AI 报告完全相同，未重复保存。' };
    patchWorkspace({ aiReports: workspace.aiReports.map((item) => item.fingerprint === stored.fingerprint ? next : item) });
    setNotice('AI 助手报告已修改，内容画像和学习积累已更新。');
    return { ok: true };
  }

  function reinforceEpisode(episodeId: string) {
    const sessionId = createSessionId(episodeId);
    patchWorkspace({ activeSessions: { ...workspace.activeSessions, [episodeId]: sessionId } });
    setSelectedId(episodeId); setView('library'); setStep('live'); setNotice('已开始一次新的 GPT 巩固会话。');
  }

  return (
    <div className="app-shell">
      {appHeader}

      {view === 'progress' ? <ProgressView episodes={episodes} studyAttempts={workspace.studyAttempts} completions={workspace.completions} aiReports={workspace.aiReports} reports={workspace.reports} onContinue={continueNext} onImport={() => { setReportImportEpisodeId(undefined); setReportImportOpen(true); }} onOpenEpisode={selectEpisode} onReinforce={reinforceEpisode} onUpdateDuration={updateReportDuration} onUpdateReport={updateReport} onUpdateAiReport={updateAiReport} onDeleteReport={(sessionId) => { patchWorkspace({ reports: workspace.reports.filter((item) => item.sessionId !== sessionId) }); setNotice('GPT 报告已删除，视频完成状态未改变。'); }} onDeleteAiReport={(fingerprint) => { patchWorkspace({ aiReports: workspace.aiReports.filter((item) => item.fingerprint !== fingerprint) }); setNotice('AI 助手报告已删除，其他报告和视频完成状态未改变。'); }} onOpenSettings={() => setWorkspaceSettingsOpen(true)} /> : (
        <ResizableWorkspace
          preferences={layoutPreferences}
          onPreferencesChange={updateLayoutPreferences}
          library={<aside className="library-panel" aria-label="视频片库">
            <div className="panel-heading"><div><span>片库</span><h1>{filteredEpisodes.length} 个视频</h1></div><div className="library-actions"><button className="secondary-button" type="button" onClick={exportBlankTemplate}><FileDown size={16} />导出空白模板</button><button className="secondary-button" type="button" onClick={() => setReturnImportOpen(true)}><FileJson size={16} />导入回填包</button><button className="new-video-button" type="button" onClick={() => { setEditingId(null); setEditorOpen(true); }}><FilePlus2 size={16} />新建</button></div></div>
            <label className="search-field"><Search size={17} /><span className="visually-hidden">搜索标题或日期</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索标题或日期" />{query && <button type="button" onClick={() => setQuery('')} aria-label="清空搜索"><X size={15} /></button>}</label>
            <div className="library-controls">
              <select value={filter} onChange={(event) => setFilter(event.target.value as Filter)} aria-label="筛选"><option value="all">全部</option><option value="completed">已完成</option><option value="uncompleted">未完成</option></select>
              <select value={sort} onChange={(event) => setSort(event.target.value as Sort)} aria-label="排序"><option value="newest">发布日期最新</option><option value="oldest">发布日期最早</option><option value="uncompleted">未完成优先</option><option value="shortest">时长最短</option><option value="longest">时长最长</option></select>
            </div>
            <div className="episode-list">
              {filteredEpisodes.map((episode) => <button type="button" className={`episode-row${episode.id === selected.id ? ' active' : ''}`} key={episode.id} onClick={() => selectEpisode(episode.id)} aria-current={episode.id === selected.id ? 'true' : undefined}><span className="episode-copy"><strong>{episode.title}</strong><small>{formatDuration(episode.durationSeconds)} · {episode.publishedDate}</small></span><ChevronRight size={15} /></button>)}
              {!filteredEpisodes.length && <div className="empty-results">没有符合条件的视频</div>}
            </div>
          </aside>}
        >
          <section className="learning-panel" aria-labelledby="episode-title">
            <div className="episode-header">
              <div className="thumbnail-frame">{selected.thumbnailUrl ? <img src={selected.thumbnailUrl} alt="" /> : <div className="thumbnail-fallback"><PlayCircle size={42} /></div>}</div>
              <div className="episode-meta">
                <div className="eyebrow-row"><span>{selected.publishedDate}</span><span>{formatDuration(selected.durationSeconds)}</span></div>
                <h2 id="episode-title">{selected.title}</h2>
                <div className="platform-actions">
                  {selected.youtube.url && <a className="platform-button youtube" href={selected.youtube.url} target="_blank" rel="noreferrer"><PlayCircle size={18} />YouTube<ExternalLink size={14} /></a>}
                  {selected.bilibili.url && <a className="platform-button bilibili" href={selected.bilibili.url} target="_blank" rel="noreferrer"><Tv size={18} />Bilibili<ExternalLink size={14} /></a>}
                  <button className="icon-button" type="button" onClick={() => { setEditingId(selected.id); setEditorOpen(true); }} title="编辑标题和发布日期" aria-label="编辑标题和发布日期"><Pencil size={17} /></button>
                  <button className="icon-button danger" type="button" onClick={deleteVideo} title="删除视频" aria-label="删除视频"><Trash2 size={17} /></button>
                </div>
              </div>
            </div>

            <nav className="stepper" aria-label="本集学习步骤">
              {steps.map((item) => {
                const Icon = item.icon;
                const done = item.id === 'practice' ? !!activeAttempt.passes.transcriptStudy.completedAt : item.id === 'recall' ? !!activeAttempt.recall.completedAt : false;
                const locked = item.id === 'recall' ? !activeAttempt.passes.transcriptStudy.completedAt : item.id === 'live' ? !activeAttempt.passes.transcriptStudy.completedAt || !activeAttempt.recall.completedAt : false;
                return <button type="button" key={item.id} disabled={locked} className={`${step === item.id ? 'active' : ''}${done ? ' done' : ''}`} onClick={() => item.id === 'live' ? enterLive() : setStep(item.id)} aria-current={step === item.id ? 'step' : undefined}><span>{done ? <Check size={16} /> : <Icon size={16} />}</span>{item.label}</button>;
              })}
            </nav>

            <div className="stage" key={`${selected.id}-${activeAttempt.attemptId}-${step}`}>
              {step === 'practice' && <PracticeWorkspace episode={selected} attempt={activeAttempt} englishTranscript={transcript.englishTranscript} onUpdate={updateAttempt} onTranscriptComplete={() => setStep('recall')} onNotice={setNotice} transcriptWorkspace={loadingTranscript ? <div className="stage-loading">正在加载本集字幕…</div> : <TranscriptWorkspace episodeId={selected.id} englishTranscript={transcript.englishTranscript} chineseTranscript={transcript.chineseTranscript} originalEnglish={originalTranscript.englishTranscript} originalChinese={originalTranscript.chineseTranscript} highlights={selectedHighlights} keywords={keywords} keywordDraft={keywordDraft} layoutPreferences={layoutPreferences} onLayoutPreferencesChange={updateLayoutPreferences} onKeywordDraft={setKeywordDraft} onAddKeyword={addKeyword} onRemoveKeyword={removeKeyword} onSaveTranscript={saveTranscript} onRestoreTranscript={restoreTranscript} onAddHighlight={(highlight) => patchWorkspace({ highlights: [...workspace.highlights, highlight] })} onRemoveHighlight={(id) => patchWorkspace({ highlights: workspace.highlights.filter((item) => item.id !== id) })} />} />}
              {step === 'recall' && <RecallWorkspace attempt={activeAttempt} onUpdate={updateAttempt} onBack={() => setStep('practice')} onComplete={enterLive} onNotice={setNotice} />}
              {step === 'live' && (
                <div className="live-stage">
                  <div className="live-heading"><span className="live-icon"><Sparkles size={23} /></span><div><span className="section-kicker">GPT Live</span><h3>把三遍学习证据交给 GPT</h3><p>材料会区分纯听、画面帮助、字幕精听和最终复述，并附带 {selectedHighlights.length} 条 Highlight 与严格报告契约。</p></div></div>
                  <div className="package-summary"><div><span>会话</span><strong className="session-id">{workspace.activeSessions[selected.id] ?? '准备中'}</strong></div><div><span>纯听 → 画面</span><strong>{activeAttempt.passes.audioOnly.comprehension ?? '—'} → {activeAttempt.passes.visualNoCaptions.comprehension ?? '—'}</strong></div><div><span>复述独立度</span><strong>{activeAttempt.recall.independence === 'independent' ? '可以独立说' : activeAttempt.recall.independence === 'with-outline' ? '看提纲能说' : '还说不出来'}</strong></div><div><span>Highlight</span><strong>{selectedHighlights.length}</strong></div></div>
                  <div className="export-actions live-export-action"><button className="primary-button" type="button" onClick={exportLiveMarkdown}><FileDown size={18} />导出 GPT Live 文档</button></div>
                  <div className="report-return-block"><Import size={22} /><div><strong>GPT 完成后导回</strong><span>导入严格 JSON 报告，保存本次主旨、细节、复述与迁移证据。</span></div><button className="secondary-button" type="button" onClick={() => { setReportImportEpisodeId(selected.id); setReportImportOpen(true); }}><Import size={17} />导入本集报告</button></div>
                  <div className="finish-block"><Headphones size={24} /><div><strong>{completed ? '本集已经完成' : '完成本集，继续前进'}</strong><span>视频完成和 GPT 报告是两类独立证据。</span></div><div className="finish-actions">{completed ? <button className="secondary-button" type="button" onClick={undoCompletion}><Undo2 size={17} />撤销完成</button> : <button className="finish-button" type="button" onClick={completeEpisode}><Check size={18} />完成本集</button>}<button className="secondary-button" type="button" onClick={startNewAttempt}><Headphones size={17} />再学一次</button></div></div>
                </div>
              )}
            </div>
            <AiStudyAssistant
              episode={selected}
              transcript={transcript}
              attempt={activeAttempt}
              keywords={keywords}
              highlights={selectedHighlights}
              legacyRecall={legacyRecall}
              conversation={selectedConversation}
              aiReports={selectedAiReports}
              questionLedger={workspace.questionLedgers?.[selected.id] ?? []}
              transcriptSource={transcriptSource}
              onSaveAiReport={importAiReport}
              onAppendConversation={(message) => setWorkspace((current) => ({ ...current, aiConversations: { ...current.aiConversations, [selected.id]: [...(current.aiConversations[selected.id] ?? []), message] } }))}
              onClearConversation={() => setWorkspace((current) => ({ ...current, aiConversations: { ...current.aiConversations, [selected.id]: [] } }))}
              onEnsureSession={ensureSession}
              onNotice={setNotice}
              provider={activeAiProvider}
            />
            <div className="notice" aria-live="polite">{notice}</div>
          </section>
        </ResizableWorkspace>
      )}

      <VideoEditor open={editorOpen} episode={editingEpisode} originalEpisode={editingOriginal} onClose={() => { setEditorOpen(false); setEditingId(null); }} onSave={saveVideo} onRestore={editingOriginal && (workspace.metadataOverrides[editingOriginal.id] || workspace.linkOverrides?.[editingOriginal.id]) ? restoreMetadata : undefined} />
      <ReportImportDialog open={reportImportOpen} episodes={episodes} existingReports={workspace.reports} completedIds={new Set(Object.keys(workspace.completions))} expectedEpisodeId={reportImportEpisodeId} templateSessionId={reportImportEpisodeId ? workspace.activeSessions[reportImportEpisodeId] : undefined} onClose={() => setReportImportOpen(false)} onCommit={importReports} onViewProgress={() => { setReportImportOpen(false); setView('progress'); }} />
      <LearningReturnImportDialog open={returnImportOpen} episodes={episodes} workspace={workspace} onClose={() => setReturnImportOpen(false)} onCommit={importReturnPackage} onViewProgress={() => { setReturnImportOpen(false); setView('progress'); }} />
      <AiProviderSettingsDialog open={aiSettingsOpen} profiles={aiProfiles} activeProfileId={activeAiProfileId} sessionApiKeys={sessionAiKeys} onClose={() => setAiSettingsOpen(false)} onSaveProfile={saveAiProviderProfile} onDeleteProfile={deleteAiProviderProfile} onSelectProfile={selectAiProviderProfile} />
      <SyncDialog open={syncOpen} workspace={workspace} onClose={() => setSyncOpen(false)} onBackup={exportWorkspace} onRestore={(restored) => { setWorkspace(restored); setSelectedId(restored.customVideos[0]?.id ?? ''); }} onSynced={(message) => { setNotice(message); autoSync.refresh(); }} />
      <WorkspaceSettingsDialog open={workspaceSettingsOpen} onClose={() => setWorkspaceSettingsOpen(false)} onOpenAiSettings={() => setAiSettingsOpen(true)} onOpenSync={() => setSyncOpen(true)} onBackup={exportWorkspace} onRestore={() => importRef.current?.click()} />
    </div>
  );
}

export default App;
