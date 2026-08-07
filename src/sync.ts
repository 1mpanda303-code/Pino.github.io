import type { WorkspaceState } from './domain/workspace';

export type CloudSnapshot = {
  revision: number;
  workspace: unknown | null;
  updatedAt: string | null;
};

const SECRET_KEY = 'luma.sync.secret.v1';
const META_KEY = 'luma.sync.meta.v1';

export type SyncMetadata = { revision: number; hash: string };
export type SyncDecision = 'same' | 'push' | 'pull' | 'conflict';

export function loadSyncSecret() {
  return localStorage.getItem(SECRET_KEY) ?? '';
}

export function rememberSyncSecret(secret: string) {
  localStorage.setItem(SECRET_KEY, secret);
}

export function forgetSyncSecret() {
  localStorage.removeItem(SECRET_KEY);
  localStorage.removeItem(META_KEY);
}

export function loadSyncMetadata(): SyncMetadata | null {
  try {
    const value = JSON.parse(localStorage.getItem(META_KEY) ?? 'null') as Partial<SyncMetadata> | null;
    return value && Number.isInteger(value.revision) && typeof value.hash === 'string' ? value as SyncMetadata : null;
  } catch { return null; }
}

export function saveSyncMetadata(metadata: SyncMetadata) {
  localStorage.setItem(META_KEY, JSON.stringify(metadata));
}

export async function hashWorkspace(workspace: unknown) {
  const bytes = new TextEncoder().encode(JSON.stringify(workspace));
  const digest = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return [...digest].map((value) => value.toString(16).padStart(2, '0')).join('');
}

export function decideSync(localHash: string, remoteHash: string, metadata: SyncMetadata | null, remoteRevision: number): SyncDecision {
  if (localHash === remoteHash) return 'same';
  if (!metadata) return 'conflict';
  const localChanged = localHash !== metadata.hash;
  const remoteChanged = remoteRevision !== metadata.revision;
  if (localChanged && !remoteChanged) return 'push';
  if (!localChanged && remoteChanged) return 'pull';
  return 'conflict';
}

async function syncRequest(secret: string, init?: RequestInit) {
  const response = await fetch(`${import.meta.env.BASE_URL}api/sync`, {
    ...init,
    headers: {
      'Authorization': `Bearer ${secret}`,
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  });
  if (response.status === 401) throw new Error('同步密码不正确。');
  if (response.status === 404) throw new Error('当前站点尚未配置云同步接口。');
  if (response.status === 409) throw new Error('云端数据已被另一台设备更新，请重新读取后再选择。');
  if (!response.ok) throw new Error('云同步暂时不可用，请稍后重试。');
  return response;
}

export async function fetchCloudSnapshot(secret: string): Promise<CloudSnapshot> {
  const response = await syncRequest(secret);
  return response.json() as Promise<CloudSnapshot>;
}

export async function uploadCloudSnapshot(secret: string, workspace: WorkspaceState, baseRevision: number): Promise<CloudSnapshot> {
  const response = await syncRequest(secret, {
    method: 'PUT',
    body: JSON.stringify({ baseRevision, workspace }),
  });
  return response.json() as Promise<CloudSnapshot>;
}
