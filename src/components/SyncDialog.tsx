import { useEffect, useId, useState } from 'react';
import { Cloud, Download, KeyRound, LogOut, RefreshCw, Upload, X } from 'lucide-react';
import { migrateWorkspace, type WorkspaceState } from '../domain/workspace';
import {
  fetchCloudSnapshot, forgetSyncSecret, loadSyncSecret, rememberSyncSecret,
  hashWorkspace, saveSyncMetadata, uploadCloudSnapshot, type CloudSnapshot,
} from '../sync';

type Props = {
  open: boolean;
  workspace: WorkspaceState;
  onClose: () => void;
  onRestore: (workspace: WorkspaceState) => void;
  onBackup: () => void;
  onSynced: (message: string) => void;
};

export function SyncDialog({ open, workspace, onClose, onRestore, onBackup, onSynced }: Props) {
  const titleId = useId();
  const [secret, setSecret] = useState('');
  const [snapshot, setSnapshot] = useState<CloudSnapshot | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!open) return;
    setSecret(loadSyncSecret()); setSnapshot(null); setError('');
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  async function inspect() {
    if (!secret.trim()) { setError('请输入个人同步密码。'); return; }
    setBusy(true); setError('');
    try {
      const value = await fetchCloudSnapshot(secret.trim());
      rememberSyncSecret(secret.trim()); setSnapshot(value);
    } catch (reason) { setError(reason instanceof Error ? reason.message : '连接失败。'); }
    finally { setBusy(false); }
  }

  async function upload() {
    if (!snapshot) return;
    setBusy(true); setError('');
    try {
      const value = await uploadCloudSnapshot(secret.trim(), workspace, snapshot.revision);
      saveSyncMetadata({ revision: value.revision, hash: await hashWorkspace(workspace) });
      setSnapshot(value); onSynced('本机学习记录已上传到云端，后续修改会自动同步。');
    } catch (reason) { setError(reason instanceof Error ? reason.message : '上传失败。'); }
    finally { setBusy(false); }
  }

  async function restore() {
    if (!snapshot?.workspace) return;
    const restored = migrateWorkspace(snapshot.workspace);
    if (!restored) { setError('云端工作区版本无效，未覆盖本机数据。'); return; }
    onBackup();
    saveSyncMetadata({ revision: snapshot.revision, hash: await hashWorkspace(restored) });
    onRestore(restored); onSynced('已下载云端记录，后续修改会自动同步。'); onClose();
  }

  const updated = snapshot?.updatedAt ? new Date(snapshot.updatedAt).toLocaleString() : '尚无云端数据';
  return (
    <div className="dialog-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="video-dialog sync-dialog" role="dialog" aria-modal="true" aria-labelledby={titleId}>
        <header className="dialog-header"><div><small>个人数据</small><h2 id={titleId}>云同步</h2></div><button className="icon-button" type="button" onClick={onClose} aria-label="关闭"><X size={19} /></button></header>
        <div className="dialog-body">
          <div className="form-section-title"><Cloud size={17} /><span>Cloudflare D1 工作区快照</span></div>
          <label className="form-field"><span>个人同步密码</span><input type="password" value={secret} onChange={(event) => setSecret(event.target.value)} autoComplete="current-password" /></label>
          {!snapshot ? <button className="primary-button sync-connect" type="button" disabled={busy} onClick={() => void inspect()}>{busy ? <RefreshCw className="spin" size={17} /> : <KeyRound size={17} />}连接云端</button> : (
            <div className="sync-state">
              <div><span>云端版本</span><strong>{snapshot.revision}</strong></div><div><span>最后更新</span><strong>{updated}</strong></div>
              <div className="sync-actions">
                <button className="secondary-button" type="button" disabled={busy || !snapshot.workspace} onClick={() => void restore()}><Download size={17} />下载云端到本机</button>
                <button className="primary-button" type="button" disabled={busy} onClick={() => void upload()}><Upload size={17} />上传本机到云端</button>
              </div>
            </div>
          )}
          <p className="sync-note">学习记录与 AI 对话会一起同步。下载会先导出本机 JSON 备份；上传只接受当前云端版本，避免静默覆盖另一台设备的新记录。</p>
        </div>
        <footer className="dialog-footer"><p className="form-error" role="alert">{error}</p><div><button className="secondary-button" type="button" onClick={() => { forgetSyncSecret(); setSecret(''); setSnapshot(null); }}><LogOut size={16} />忘记密码</button><button className="secondary-button" type="button" onClick={onClose}>关闭</button></div></footer>
      </section>
    </div>
  );
}
