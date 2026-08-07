import { useEffect, useId } from 'react';
import { Bot, Cloud, Download, FolderArchive, Upload, X } from 'lucide-react';

type Props = {
  open: boolean;
  onClose: () => void;
  onOpenAiSettings: () => void;
  onOpenSync: () => void;
  onBackup: () => void;
  onRestore: () => void;
};

export function WorkspaceSettingsDialog({ open, onClose, onOpenAiSettings, onOpenSync, onBackup, onRestore }: Props) {
  const titleId = useId();

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  function openSetting(action: () => void) {
    onClose();
    action();
  }

  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="video-dialog workspace-settings-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header">
          <div><small>个人工作区</small><h2 id={titleId}>设置与数据管理</h2></div>
          <button className="icon-button" type="button" onClick={onClose} aria-label="关闭设置"><X size={19} /></button>
        </header>
        <div className="dialog-body">
          <p className="dialog-intro">工作区包含个人片库、三遍与回忆记录、AI 对话、AI 报告和 GPT Live 报告。API Key 不会写入备份或云同步。</p>
          <div className="workspace-settings-grid">
            <button type="button" onClick={() => openSetting(onOpenAiSettings)}><Bot size={18} /><span><strong>AI API 设置</strong><small>管理当前会话使用的服务、模型和 API Key</small></span></button>
            <button type="button" onClick={() => openSetting(onOpenSync)}><Cloud size={18} /><span><strong>云同步</strong><small>将完整个人工作区安全同步到 Cloudflare D1</small></span></button>
            <button type="button" onClick={() => openSetting(onBackup)}><Download size={18} /><span><strong>备份工作区</strong><small>导出包含片库和全部学习报告的 JSON</small></span></button>
            <button type="button" onClick={() => openSetting(onRestore)}><Upload size={18} /><span><strong>导入工作区</strong><small>恢复备份，或合并仅供自己使用的片库种子</small></span></button>
          </div>
          <p className="workspace-settings-note"><FolderArchive size={15} /> 公开站点不附带个人片库；需要在这里导入或从云端恢复。</p>
        </div>
        <footer className="dialog-footer"><span /><div><button className="secondary-button" type="button" onClick={onClose}>关闭</button></div></footer>
      </section>
    </div>
  );
}
