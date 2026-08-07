import { useEffect, useId, useState } from 'react';
import { Link2, Plus, RotateCcw, Save, X } from 'lucide-react';
import { extractYouTubeVideoId, type Episode, type ExternalVideoSource, type VideoDraft } from '../domain/learning';

type Props = {
  open: boolean;
  episode: Episode | null;
  originalEpisode: Episode | null;
  onClose: () => void;
  onSave: (draft: VideoDraft) => void;
  onRestore?: () => void;
};

function today() {
  const current = new Date();
  return `${current.getFullYear()}-${String(current.getMonth() + 1).padStart(2, '0')}-${String(current.getDate()).padStart(2, '0')}`;
}

function fromEpisode(episode: Episode | null): VideoDraft {
  const sources: ExternalVideoSource[] = (episode?.sources ?? []).map((source) => ({ ...source }));
  if (!sources.length) {
    if (episode?.youtube.url) sources.push({ platform: 'youtube', id: episode.youtube.videoId ?? episode.youtube.url, url: episode.youtube.url });
    if (episode?.bilibili.url) sources.push({ platform: 'bilibili', id: episode.bilibili.url, url: episode.bilibili.url });
  }
  return {
    title: episode?.title ?? '',
    publishedDate: episode?.publishedDate || today(),
    youtubeUrl: '',
    bilibiliUrl: '',
    sources,
  };
}

export function VideoEditor({ open, episode, originalEpisode, onClose, onSave, onRestore }: Props) {
  const titleId = useId();
  const [draft, setDraft] = useState(() => fromEpisode(episode));
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setDraft(fromEpisode(episode));
    setError('');
  }, [episode, open]);

  useEffect(() => {
    if (!open) return;
    const close = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', close);
    return () => window.removeEventListener('keydown', close);
  }, [onClose, open]);

  if (!open) return null;
  const update = <K extends keyof VideoDraft>(key: K, value: VideoDraft[K]) => setDraft((current) => ({ ...current, [key]: value }));

  function updateSource(index: number, patch: Partial<ExternalVideoSource>) {
    setDraft((current) => {
      const sources = [...(current.sources ?? [])];
      const item = { ...(sources[index] ?? { platform: '', id: '', url: '' }), ...patch };
      if (item.platform.trim().toLocaleLowerCase() === 'youtube' && item.url && !item.id) {
        const videoId = extractYouTubeVideoId(item.url);
        if (videoId) item.id = videoId;
      }
      sources[index] = item;
      return { ...current, sources };
    });
  }

  function addSource() {
    setDraft((current) => ({ ...current, sources: [...(current.sources ?? []), { platform: '', id: '', url: '' }] }));
  }

  function removeSource(index: number) {
    setDraft((current) => ({ ...current, sources: (current.sources ?? []).filter((_, itemIndex) => itemIndex !== index) }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!draft.title.trim()) return setError('请填写视频标题。');
    const sources = (draft.sources ?? []).filter((row) => row.platform.trim() || row.id.trim() || row.url?.trim());
    if (!episode && !sources.length) return setError('请至少添加一条外部来源。');
    for (const source of sources) {
      if (!source.platform.trim()) return setError('每条外部来源都需要填写平台。');
      if (!source.id.trim()) return setError(`平台 ${source.platform.trim()} 的来源缺少 ID。`);
      if (source.platform.trim().toLocaleLowerCase() === 'youtube' && source.url && !extractYouTubeVideoId(source.url)) return setError('YouTube 链接格式无法识别，请检查后重试。');
    }
    onSave({ ...draft, sources });
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="video-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div>
            <small>{episode ? '修改片库信息' : '添加到片库'}</small>
            <h2 id={titleId}>{episode ? '编辑视频' : '新建视频'}</h2>
          </div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button>
        </header>
        <form onSubmit={submit}>
          <div className="dialog-body">
            <div className="form-section-title"><Link2 size={17} /><span>视频信息</span></div>
            <div className="video-field-grid">
              <label className="form-field span-two"><span>标题</span><input autoFocus value={draft.title} onChange={(event) => update('title', event.target.value)} /></label>
              <label className="form-field"><span>发布日期</span><input type="date" value={draft.publishedDate} onChange={(event) => update('publishedDate', event.target.value)} /></label>
            </div>
            <div className="form-section-title"><Link2 size={17} /><span>外部来源</span></div>
            <div className="video-source-list">
              {(draft.sources ?? []).map((source, index) => (
                <div className="video-source-row" key={index}>
                  <label className="form-field"><span>平台</span><input value={source.platform} onChange={(event) => updateSource(index, { platform: event.target.value })} placeholder="youtube / bilibili / 其他" spellCheck={false} /></label>
                  <label className="form-field"><span>来源 ID</span><input value={source.id} onChange={(event) => updateSource(index, { id: event.target.value })} placeholder="video id / BV... / custom-001" spellCheck={false} /></label>
                  <label className="form-field span-two"><span>链接（可选）</span><input type="url" inputMode="url" value={source.url ?? ''} onChange={(event) => updateSource(index, { url: event.target.value })} placeholder="https://..." spellCheck={false} /></label>
                  <button className="icon-button danger" type="button" onClick={() => removeSource(index)} aria-label={`移除来源 ${index + 1}`} title="移除来源"><X size={15} /></button>
                </div>
              ))}
              <button className="secondary-button" type="button" onClick={addSource}><Plus size={16} />添加外部来源</button>
            </div>
            {!episode && <p className="dialog-hint">保存后会直接进入片库；外部来源使用通用的“平台 + ID + 可选链接”，不再限定 YouTube/Bilibili。</p>}
            {originalEpisode && <p className="dialog-hint">原始标题、日期和来源会保留在本地，可随时恢复；清空来源不会删除学习记录。</p>}
          </div>
          <footer className="dialog-footer">
            <p className="form-error" role="alert">{error}</p>
            <div>
              {onRestore && <button className="secondary-button" type="button" onClick={onRestore}><RotateCcw size={16} />恢复原始信息</button>}
              <button className="secondary-button" type="button" onClick={onClose}>取消</button>
              <button className="primary-button" type="submit"><Save size={17} />保存</button>
            </div>
          </footer>
        </form>
      </section>
    </div>
  );
}
