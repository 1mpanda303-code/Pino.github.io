import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Highlighter, PanelBottomOpen, PanelRightOpen, Tags } from 'lucide-react';
import type { LayoutPreferences } from './layoutPreferences';
import { ResizeHandle } from './ResizeHandle';
import { useViewportWidth, type LayoutPreferencesUpdater } from './ResizableWorkspace';

type Props = {
  transcript: ReactNode;
  keywords: ReactNode;
  highlights: ReactNode;
  preferences: LayoutPreferences;
  onPreferencesChange: LayoutPreferencesUpdater;
  preferHighlights?: boolean;
};

const HANDLE_SIZE = 8;
const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function ResizableStudyArea({ transcript, keywords, highlights, preferences, onPreferencesChange, preferHighlights = false }: Props) {
  const areaRef = useRef<HTMLDivElement>(null);
  const viewportWidth = useViewportWidth();
  const [size, setSize] = useState({ width: 760, height: 620 });
  const [mobilePanel, setMobilePanel] = useState<'highlights' | 'keywords'>('highlights');
  const wide = viewportWidth >= 1000 && size.width >= 515;
  const keywordCollapsed = viewportWidth < 1100 ? preferences.tablet.keywordCollapsed : preferences.desktop.collapsed.keywords;
  const highlightsCollapsed = preferences.desktop.collapsed.highlights;
  const keywordMinimum = size.width >= 680 ? 240 : 200;
  const transcriptMinimum = size.width >= 680 ? 420 : 300;
  const keywordMaximum = Math.max(keywordMinimum, size.width - transcriptMinimum - HANDLE_SIZE);
  const keywordWidth = clamp(size.width * preferences.desktop.keywordRatio, keywordMinimum, keywordMaximum);
  const transcriptWidth = Math.max(transcriptMinimum, size.width - keywordWidth - HANDLE_SIZE);
  const defaultTranscriptWidth = size.width - clamp(size.width * .26, keywordMinimum, keywordMaximum) - HANDLE_SIZE;
  const transcriptHeightMaximum = Math.max(260, size.height - 150 - HANDLE_SIZE);
  const transcriptHeight = clamp(size.height * preferences.desktop.transcriptRatio, 260, transcriptHeightMaximum);
  const defaultTranscriptHeight = clamp(size.height * .65, 260, transcriptHeightMaximum);
  const style = {
    '--keyword-width': `${keywordWidth}px`,
    '--transcript-height': `${transcriptHeight}px`,
  } as CSSProperties;

  useEffect(() => {
    const element = areaRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setSize({ width: entry.contentRect.width, height: entry.contentRect.height }));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (preferHighlights) setMobilePanel('highlights');
  }, [preferHighlights]);

  function updateDesktop(patch: Partial<LayoutPreferences['desktop']>, persist: boolean) {
    onPreferencesChange((current) => ({
      ...current,
      desktop: { ...current.desktop, ...patch },
      updatedAt: new Date().toISOString(),
    }), persist);
  }

  return (
    <div
      className={`resizable-study-area${wide ? ' wide-study-area' : ' compact-study-area'}${keywordCollapsed ? ' keywords-collapsed' : ''}${highlightsCollapsed ? ' highlights-collapsed' : ''}`}
      ref={areaRef}
      style={style}
    >
      {!wide && <div className="study-mobile-tabs" role="tablist" aria-label="学习辅助区">
        <button type="button" role="tab" aria-selected={mobilePanel === 'highlights'} className={mobilePanel === 'highlights' ? 'active' : ''} onClick={() => setMobilePanel('highlights')}><Highlighter size={15} />Highlight</button>
        <button type="button" role="tab" aria-selected={mobilePanel === 'keywords'} className={mobilePanel === 'keywords' ? 'active' : ''} onClick={() => setMobilePanel('keywords')}><Tags size={15} />关键词</button>
      </div>}

      <div className="study-primary-column">
        <div className="study-transcript-pane">{transcript}</div>
        {wide && !highlightsCollapsed && <ResizeHandle className="highlight-resize-handle" orientation="horizontal" label="调整字幕与 Highlight 高度" value={transcriptHeight} minimum={260} maximum={transcriptHeightMaximum} defaultValue={defaultTranscriptHeight} onChange={(value, persist) => updateDesktop({ transcriptRatio: value / Math.max(size.height, 1) }, persist)} />}
        {wide && highlightsCollapsed && <button className="collapsed-highlight-button" type="button" onClick={() => updateDesktop({ collapsed: { ...preferences.desktop.collapsed, highlights: false } }, true)} aria-label="展开 Highlight"><PanelBottomOpen size={17} /></button>}
        <div className="study-highlight-pane" hidden={wide ? highlightsCollapsed : mobilePanel !== 'highlights'}>{highlights}</div>
      </div>

      {wide && !keywordCollapsed && <ResizeHandle className="keyword-resize-handle" orientation="vertical" label="调整字幕与关键词宽度" value={transcriptWidth} minimum={transcriptMinimum} maximum={size.width - keywordMinimum - HANDLE_SIZE} defaultValue={defaultTranscriptWidth} onChange={(value, persist) => updateDesktop({ keywordRatio: (size.width - HANDLE_SIZE - value) / Math.max(size.width, 1) }, persist)} />}
      {wide && keywordCollapsed && <button className="collapsed-keyword-button" type="button" onClick={() => onPreferencesChange((current) => ({ ...current, desktop: { ...current.desktop, collapsed: { ...current.desktop.collapsed, keywords: false } }, tablet: { ...current.tablet, keywordCollapsed: false }, updatedAt: new Date().toISOString() }))} aria-label="展开关键词"><PanelRightOpen size={17} /></button>}
      <div className="study-keyword-pane" hidden={wide ? keywordCollapsed : mobilePanel !== 'keywords'}>{keywords}</div>
    </div>
  );
}
