import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { Edit3, Highlighter, Plus, RotateCcw, Save, Trash2, X } from 'lucide-react';
import { splitTranscript, type Highlight, type HighlightType } from '../domain/learning';
import { createSelectionDraft, selectionOverlapsHighlights, type SelectionDraft } from '../domain/highlightSelection';
import type { LayoutPreferences } from '../layout/layoutPreferences';
import { ResizableStudyArea } from '../layout/ResizableStudyArea';
import type { LayoutPreferencesUpdater } from '../layout/ResizableWorkspace';

type Props = {
  episodeId: string;
  englishTranscript: string;
  chineseTranscript: string;
  originalEnglish: string;
  originalChinese: string;
  highlights: Highlight[];
  keywords: string[];
  keywordDraft: string;
  layoutPreferences: LayoutPreferences;
  onLayoutPreferencesChange: LayoutPreferencesUpdater;
  onKeywordDraft: (value: string) => void;
  onAddKeyword: () => void;
  onRemoveKeyword: (value: string) => void;
  onSaveTranscript: (language: 'en' | 'zh', value: string) => void;
  onRestoreTranscript: () => void;
  onAddHighlight: (highlight: Highlight) => void;
  onRemoveHighlight: (id: string) => void;
  children?: ReactNode;
};

const typeLabels: Record<HighlightType, string> = { key: '重点', question: '疑问', mastered: '已掌握' };

function textOffset(root: HTMLElement, node: Node, offset: number) {
  const range = document.createRange();
  range.selectNodeContents(root);
  range.setEnd(node, offset);
  return range.toString().length;
}

function HighlightedSegment({ text, highlights, index }: { text: string; highlights: Highlight[]; index: number }) {
  const ordered = [...highlights].filter((item) => item.segmentIndex === index).sort((a, b) => a.startOffset - b.startOffset);
  const parts: React.ReactNode[] = [];
  let cursor = 0;
  for (const item of ordered) {
    if (item.startOffset < cursor || item.endOffset > text.length) continue;
    parts.push(text.slice(cursor, item.startOffset));
    parts.push(<mark className={`highlight-${item.type}`} title={item.note || typeLabels[item.type]} key={item.id}>{text.slice(item.startOffset, item.endOffset)}</mark>);
    cursor = item.endOffset;
  }
  parts.push(text.slice(cursor));
  return <p data-segment={index}>{parts}</p>;
}

export function TranscriptWorkspace(props: Props) {
  const [language, setLanguage] = useState<'en' | 'zh'>('en');
  const [editing, setEditing] = useState(false);
  const [editValue, setEditValue] = useState('');
  const [selection, setSelection] = useState<SelectionDraft | null>(null);
  const [highlightType, setHighlightType] = useState<HighlightType>('key');
  const [note, setNote] = useState('');
  const [composerError, setComposerError] = useState('');
  const transcriptRef = useRef<HTMLElement>(null);
  const transcript = language === 'en' ? props.englishTranscript : props.chineseTranscript;
  const original = language === 'en' ? props.originalEnglish : props.originalChinese;
  const segments = useMemo(() => splitTranscript(transcript, language), [language, transcript]);
  const visibleHighlights = props.highlights.filter((item) => item.language === language);

  useEffect(() => {
    setLanguage('en'); setEditing(false); setSelection(null); setNote(''); setComposerError('');
  }, [props.episodeId]);

  useEffect(() => {
    setEditing(false); setSelection(null); setNote(''); setComposerError('');
  }, [language, transcript]);

  function clearSelectionDraft() {
    window.getSelection()?.removeAllRanges();
    setSelection(null); setNote(''); setComposerError('');
  }

  function startEditing() {
    setEditValue(transcript);
    clearSelectionDraft();
    setEditing(true);
  }

  function captureSelection() {
    if (editing) return;
    const current = window.getSelection();
    if (!current || current.isCollapsed || !current.anchorNode || !current.focusNode) return;
    const anchor = (current.anchorNode.nodeType === Node.TEXT_NODE ? current.anchorNode.parentElement : current.anchorNode as HTMLElement)?.closest<HTMLElement>('[data-segment]');
    const focus = (current.focusNode.nodeType === Node.TEXT_NODE ? current.focusNode.parentElement : current.focusNode as HTMLElement)?.closest<HTMLElement>('[data-segment]');
    if (!anchor || anchor !== focus || !transcriptRef.current?.contains(anchor)) return;
    const start = textOffset(anchor, current.anchorNode, current.anchorOffset);
    const end = textOffset(anchor, current.focusNode, current.focusOffset);
    const draft = createSelectionDraft(Number(anchor.dataset.segment), anchor.textContent ?? '', start, end);
    if (!draft) return;
    setSelection(draft);
    setComposerError('');
  }

  function addHighlight() {
    if (!selection) return;
    if (selectionOverlapsHighlights(selection, visibleHighlights)) {
      setComposerError('所选文字与已有 Highlight 重叠，请取消后重新选择。');
      return;
    }
    const generated = globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`;
    props.onAddHighlight({
      id: `highlight-${generated}`,
      episodeId: props.episodeId,
      language,
      ...selection,
      type: highlightType,
      note: note.trim().slice(0, 160),
      createdAt: new Date().toISOString(),
    });
    clearSelectionDraft();
  }

  return (
    <div className="transcript-stage">
      <div className="transcript-toolbar">
        <div><span className="section-kicker">第三遍</span><h3>英文字幕精听与 Highlight</h3></div>
        <div className="toolbar-actions">
          <div className="segmented-control" aria-label="字幕语言">
            <button type="button" className={language === 'en' ? 'active' : ''} onClick={() => setLanguage('en')}>英文字幕</button>
            <button type="button" className={language === 'zh' ? 'active' : ''} onClick={() => setLanguage('zh')}>{language === 'zh' ? '中文已显示' : '显示中文'}</button>
          </div>
          {!editing && <button className="icon-button" type="button" onClick={startEditing} title="编辑字幕" aria-label="编辑字幕"><Edit3 size={17} /></button>}
        </div>
      </div>

      {editing ? (
        <div className="transcript-editor">
          <textarea value={editValue} onChange={(event) => setEditValue(event.target.value)} lang={language === 'zh' ? 'zh-CN' : 'en'} autoFocus />
          <div><button className="secondary-button" type="button" onClick={() => setEditing(false)}><X size={16} />取消</button><button className="primary-button" type="button" onClick={() => { props.onSaveTranscript(language, editValue); setEditing(false); }}><Save size={16} />保存字幕</button></div>
          {transcript !== original && <button className="text-button" type="button" onClick={() => { props.onRestoreTranscript(); setEditing(false); }}><RotateCcw size={15} />恢复原始字幕</button>}
        </div>
      ) : (
        <ResizableStudyArea
          preferences={props.layoutPreferences}
          onPreferencesChange={props.onLayoutPreferencesChange}
          preferHighlights={!!selection}
          transcript={<article className="transcript-text" ref={transcriptRef} lang={language === 'zh' ? 'zh-CN' : 'en'} onMouseUp={captureSelection} onKeyUp={captureSelection}>
              {segments.length ? segments.map((segment, index) => <HighlightedSegment text={segment} highlights={visibleHighlights} index={index} key={`${index}-${segment.slice(0, 16)}`} />) : <div className="empty-transcript"><Highlighter size={28} /><strong>还没有{language === 'en' ? '英文' : '中文'}字幕</strong><span>补充后即可选择原文并建立 Highlight。</span><button className="primary-button" type="button" onClick={startEditing}>录入{language === 'en' ? '英文' : '中文'}字幕</button></div>}
            </article>}
          highlights={<div className="highlight-workspace">
            {selection ? (
              <div className="highlight-composer">
                <div className="selection-preview" data-start-offset={selection.startOffset} data-end-offset={selection.endOffset}>
                  <span>待标注原文</span><q>{selection.quote}</q><small>第 {selection.segmentIndex + 1} 段 · 字符 {selection.startOffset}-{selection.endOffset}</small>
                </div>
                <div className="highlight-composer-controls">
                  <div className="highlight-types">
                    {(Object.keys(typeLabels) as HighlightType[]).map((type) => <button type="button" className={`${type}${highlightType === type ? ' active' : ''}`} onClick={() => setHighlightType(type)} key={type}>{typeLabels[type]}</button>)}
                  </div>
                  <input value={note} onChange={(event) => setNote(event.target.value)} maxLength={160} placeholder="添加短备注（可选）" />
                  <button className="primary-button" type="button" onClick={addHighlight}><Plus size={16} />标注</button>
                  <button className="icon-button" type="button" onClick={clearSelectionDraft} aria-label="取消选择"><X size={16} /></button>
                </div>
                {composerError && <p className="highlight-composer-error" role="alert">{composerError}</p>}
              </div>
            ) : <div className="highlight-empty"><Highlighter size={19} /><span>选择字幕中的文字后，可在这里添加 Highlight 和备注。</span></div>}
            <div className="highlight-list">
              {visibleHighlights.map((item) => <div className={`highlight-item ${item.type}`} key={item.id}><span>{typeLabels[item.type]}</span><q>{item.quote}</q>{item.note && <small>{item.note}</small>}<button type="button" onClick={() => props.onRemoveHighlight(item.id)} aria-label="删除标注"><Trash2 size={15} /></button></div>)}
            </div>
          </div>}
          keywords={<aside className="keyword-panel">
            <div className="keyword-heading"><div><span>自动草案</span><h4>本集关键词</h4></div><strong>{props.keywords.length}</strong></div>
            <div className="keyword-list">{props.keywords.map((keyword) => <span className="keyword-chip" key={keyword}>{keyword}<button type="button" onClick={() => props.onRemoveKeyword(keyword)} aria-label={`移除关键词 ${keyword}`}><X size={13} /></button></span>)}</div>
            <div className="keyword-add"><input value={props.keywordDraft} onChange={(event) => props.onKeywordDraft(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); props.onAddKeyword(); } }} placeholder="补充关键词" /><button type="button" onClick={props.onAddKeyword}>添加</button></div>
          </aside>}
        />
      )}
      {props.children}
    </div>
  );
}
