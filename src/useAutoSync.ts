import { useCallback, useEffect, useRef, useState, type Dispatch, type SetStateAction } from 'react';
import { migrateWorkspace, type WorkspaceState } from './domain/workspace';
import {
  decideSync, fetchCloudSnapshot, hashWorkspace, loadSyncMetadata, loadSyncSecret,
  saveSyncMetadata, uploadCloudSnapshot,
} from './sync';

export type AutoSyncStatus = 'disabled' | 'checking' | 'synced' | 'saving' | 'pending' | 'conflict' | 'error';

type Options = {
  ready: boolean;
  online: boolean;
  paused: boolean;
  workspace: WorkspaceState;
  setWorkspace: Dispatch<SetStateAction<WorkspaceState>>;
  onNotice: (message: string) => void;
};

export function useAutoSync({ ready, online, paused, workspace, setWorkspace, onNotice }: Options) {
  const [status, setStatus] = useState<AutoSyncStatus>('disabled');
  const busy = useRef(false);
  const initialized = useRef(false);
  const workspaceRef = useRef(workspace);
  workspaceRef.current = workspace;

  const reconcile = useCallback(async () => {
    const secret = loadSyncSecret();
    if (!ready || paused || !secret) { if (!secret) setStatus('disabled'); return; }
    if (!online) { setStatus('pending'); return; }
    if (busy.current) return;
    busy.current = true; setStatus('checking');
    try {
      const local = workspaceRef.current;
      const localHash = await hashWorkspace(local);
      const remote = await fetchCloudSnapshot(secret);
      if (!remote.workspace) {
        const created = await uploadCloudSnapshot(secret, local, 0);
        saveSyncMetadata({ revision: created.revision, hash: localHash });
      } else {
        const remoteWorkspace = migrateWorkspace(remote.workspace);
        if (!remoteWorkspace) throw new Error('云端工作区版本无效，未覆盖本机数据。');
        const remoteHash = await hashWorkspace(remoteWorkspace);
        const decision = decideSync(localHash, remoteHash, loadSyncMetadata(), remote.revision);
        if (decision === 'conflict') {
          setStatus('conflict'); initialized.current = true;
          onNotice('本机和云端都有新记录，请打开云同步选择保留哪一份。'); return;
        }
        if (decision === 'pull') {
          saveSyncMetadata({ revision: remote.revision, hash: remoteHash });
          setWorkspace(remoteWorkspace); onNotice('已自动下载云端最新学习记录。');
        } else if (decision === 'push') {
          const saved = await uploadCloudSnapshot(secret, local, remote.revision);
          saveSyncMetadata({ revision: saved.revision, hash: localHash });
        } else saveSyncMetadata({ revision: remote.revision, hash: remoteHash });
      }
      initialized.current = true; setStatus('synced');
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '自动同步失败。';
      setStatus(message.includes('另一台设备') ? 'conflict' : 'error'); onNotice(message);
    } finally { busy.current = false; }
  }, [online, onNotice, paused, ready, setWorkspace]);

  useEffect(() => { void reconcile(); }, [reconcile]);

  useEffect(() => {
    if (!ready || paused || !initialized.current || status === 'conflict' || status === 'error') return;
    const secret = loadSyncSecret();
    if (!secret) return;
    if (!online) { setStatus('pending'); return; }
    const timer = window.setTimeout(async () => {
      if (busy.current) return;
      const metadata = loadSyncMetadata();
      if (!metadata) { void reconcile(); return; }
      const local = workspaceRef.current;
      const localHash = await hashWorkspace(local);
      if (localHash === metadata.hash) return;
      busy.current = true; setStatus('saving');
      try {
        const saved = await uploadCloudSnapshot(secret, local, metadata.revision);
        saveSyncMetadata({ revision: saved.revision, hash: localHash }); setStatus('synced');
      } catch (reason) {
        const message = reason instanceof Error ? reason.message : '自动上传失败。';
        setStatus(message.includes('另一台设备') ? 'conflict' : 'error'); onNotice(message);
      } finally { busy.current = false; }
    }, 1800);
    return () => window.clearTimeout(timer);
  }, [online, onNotice, paused, ready, reconcile, status, workspace]);

  useEffect(() => {
    if (!ready || paused || status === 'conflict' || !loadSyncSecret()) return;

    const checkCloud = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };
    const onVisibilityChange = () => {
      if (document.visibilityState === 'visible') void reconcile();
    };

    const timer = window.setInterval(checkCloud, 30_000);
    window.addEventListener('focus', checkCloud);
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener('focus', checkCloud);
      document.removeEventListener('visibilitychange', onVisibilityChange);
    };
  }, [paused, ready, reconcile, status]);

  const refresh = useCallback(() => { initialized.current = false; setStatus('checking'); void reconcile(); }, [reconcile]);
  return { status, refresh };
}
