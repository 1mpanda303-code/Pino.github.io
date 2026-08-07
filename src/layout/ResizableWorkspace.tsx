import { useEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import {
  BookOpen, Columns3, Library, PanelBottomClose, PanelLeftClose, PanelLeftOpen,
  PanelRightClose, RotateCcw, SlidersHorizontal, X,
} from 'lucide-react';
import {
  applyLayoutPreset, createDefaultLayoutPreferences, getLayoutBreakpoint, resetLayoutPreferences,
  type LayoutPreferences, type LayoutPreset,
} from './layoutPreferences';
import { ResizeHandle } from './ResizeHandle';

export type LayoutPreferencesUpdater = (updater: (current: LayoutPreferences) => LayoutPreferences, persist?: boolean) => void;

type WorkspaceProps = {
  library: ReactNode;
  children: ReactNode;
  preferences: LayoutPreferences;
  onPreferencesChange: LayoutPreferencesUpdater;
};

type ControlsProps = {
  preferences: LayoutPreferences;
  onPreferencesChange: LayoutPreferencesUpdater;
};

const clamp = (value: number, minimum: number, maximum: number) => Math.min(maximum, Math.max(minimum, value));

export function useViewportWidth() {
  const [width, setWidth] = useState(() => typeof window === 'undefined' ? 1440 : window.innerWidth);
  useEffect(() => {
    const update = () => setWidth(window.innerWidth);
    window.addEventListener('resize', update);
    return () => window.removeEventListener('resize', update);
  }, []);
  return width;
}

function withTimestamp(preferences: LayoutPreferences): LayoutPreferences {
  return { ...preferences, updatedAt: new Date().toISOString() };
}

export function LayoutControls({ preferences, onPreferencesChange }: ControlsProps) {
  const viewportWidth = useViewportWidth();

  function applyPreset(preset: LayoutPreset) {
    onPreferencesChange((current) => applyLayoutPreset(current, preset, viewportWidth));
  }

  function togglePanel(panel: 'library' | 'keywords' | 'highlights') {
    onPreferencesChange((current) => withTimestamp({
      ...current,
      desktop: {
        ...current.desktop,
        collapsed: { ...current.desktop.collapsed, [panel]: !current.desktop.collapsed[panel] },
      },
      tablet: panel === 'keywords'
        ? { ...current.tablet, keywordCollapsed: !current.tablet.keywordCollapsed }
        : current.tablet,
    }));
  }

  return (
    <details className="layout-menu">
      <summary className="icon-button" title="调整工作区布局" aria-label="调整工作区布局"><SlidersHorizontal size={18} /></summary>
      <div className="layout-menu-popover">
        <span>布局预设</span>
        <button type="button" onClick={() => applyPreset('balanced')}><Columns3 size={16} />均衡</button>
        <button type="button" onClick={() => applyPreset('reading')}><BookOpen size={16} />精读优先</button>
        <button type="button" onClick={() => applyPreset('library')}><Library size={16} />片库优先</button>
        <hr />
        <button type="button" onClick={() => togglePanel('library')}><PanelLeftClose size={16} />{preferences.desktop.collapsed.library ? '展开片库' : '折叠片库'}</button>
        <button type="button" onClick={() => togglePanel('keywords')}><PanelRightClose size={16} />{preferences.desktop.collapsed.keywords || preferences.tablet.keywordCollapsed ? '展开关键词' : '折叠关键词'}</button>
        <button type="button" onClick={() => togglePanel('highlights')}><PanelBottomClose size={16} />{preferences.desktop.collapsed.highlights ? '展开 Highlight' : '折叠 Highlight'}</button>
        <hr />
        <button type="button" onClick={() => onPreferencesChange(() => resetLayoutPreferences(undefined, viewportWidth), false)}><RotateCcw size={16} />恢复默认布局</button>
      </div>
    </details>
  );
}

export function ResizableWorkspace({ library, children, preferences, onPreferencesChange }: WorkspaceProps) {
  const containerRef = useRef<HTMLElement>(null);
  const viewportWidth = useViewportWidth();
  const [containerWidth, setContainerWidth] = useState(viewportWidth);
  const [mobileLibraryOpen, setMobileLibraryOpen] = useState(false);
  const breakpoint = getLayoutBreakpoint(viewportWidth);
  const libraryCollapsed = breakpoint !== 'mobile' && preferences.desktop.collapsed.library;
  const ratio = breakpoint === 'tablet' ? preferences.tablet.libraryRatio : preferences.desktop.libraryRatio;
  const availableWidth = containerWidth || viewportWidth;
  const maximum = Math.max(240, Math.min(420, availableWidth - (breakpoint === 'desktop' ? 600 : 430)));
  const libraryWidth = clamp(availableWidth * ratio, 240, maximum);
  const defaultWidth = clamp(300, 240, maximum);
  const style = { '--library-width': `${libraryWidth}px` } as CSSProperties;

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(([entry]) => setContainerWidth(entry.contentRect.width));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => setMobileLibraryOpen(false), [breakpoint]);

  function changeLibraryWidth(nextWidth: number, persist: boolean) {
    onPreferencesChange((current) => {
      const nextRatio = clamp(nextWidth / Math.max(availableWidth, 1), .12, .5);
      return withTimestamp(breakpoint === 'tablet'
        ? { ...current, tablet: { ...current.tablet, libraryRatio: nextRatio } }
        : { ...current, desktop: { ...current.desktop, libraryRatio: nextRatio } });
    }, persist);
  }

  return (
    <main
      className={`workspace resizable-workspace${libraryCollapsed ? ' library-collapsed' : ''}${mobileLibraryOpen ? ' mobile-library-open' : ''}`}
      data-layout-breakpoint={breakpoint}
      ref={containerRef}
      style={style}
    >
      <button className="mobile-library-trigger" type="button" onClick={() => setMobileLibraryOpen(true)}><Library size={17} />打开片库</button>
      <div className="workspace-library-shell" onClickCapture={(event) => {
        if (breakpoint === 'mobile' && (event.target as HTMLElement).closest('.episode-row')) setMobileLibraryOpen(false);
      }}>
        <div className="mobile-library-drawer-header"><strong>视频片库</strong><button className="icon-button" type="button" onClick={() => setMobileLibraryOpen(false)} aria-label="关闭片库"><X size={18} /></button></div>
        {library}
      </div>
      <button className="mobile-library-backdrop" type="button" onClick={() => setMobileLibraryOpen(false)} aria-label="关闭片库" />
      {breakpoint !== 'mobile' && !libraryCollapsed && (
        <ResizeHandle
          className="library-resize-handle"
          orientation="vertical"
          label="调整片库宽度"
          value={libraryWidth}
          minimum={240}
          maximum={maximum}
          defaultValue={defaultWidth}
          onChange={changeLibraryWidth}
        />
      )}
      {libraryCollapsed && <button className="collapsed-library-button" type="button" onClick={() => onPreferencesChange((current) => withTimestamp({ ...current, desktop: { ...current.desktop, collapsed: { ...current.desktop.collapsed, library: false } } }))} aria-label="展开片库"><PanelLeftOpen size={18} /></button>}
      <div className="workspace-learning-shell">{children}</div>
    </main>
  );
}
