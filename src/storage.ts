import type { Episode, LegacyRecall } from './domain/learning';
import { emptyWorkspace, migrateWorkspace, type Theme, type WorkspaceState } from './domain/workspace';

const DATABASE = 'luma-learning-workbench';
const LEGACY_DATABASE = 'teded-listening-workbench';
const STORE = 'workspace';
const KEY = 'current';

function readLegacy<T>(key: string, fallback: T): T {
  try { const value = localStorage.getItem(key); return value ? JSON.parse(value) as T : fallback; } catch { return fallback; }
}

function openDatabase(name = DATABASE) {
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(name, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error(`IndexedDB ${name} is blocked.`));
  });
}

function read(db: IDBDatabase) {
  return new Promise<unknown>((resolve, reject) => {
    const request = db.transaction(STORE).objectStore(STORE).get(KEY);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function loadWorkspaceFromStorage(): Promise<WorkspaceState> {
  const db = await openDatabase();
  const stored = await read(db);
  db.close();
  const migrated = migrateWorkspace(stored);
  if (migrated) return migrated;
  const legacyDb = await openDatabase(LEGACY_DATABASE);
  const legacyStored = await read(legacyDb);
  legacyDb.close();
  const migratedLegacy = migrateWorkspace(legacyStored);
  if (migratedLegacy) return migratedLegacy;
  const legacyVideos = readLegacy<Episode[]>('teded.custom-cases.v1', []);
  const legacyRecalls = readLegacy<Record<string, LegacyRecall>>('teded.recalls.v1', {});
  const legacyTheme = readLegacy<Theme>('teded.theme.v1', 'system');
  return { ...emptyWorkspace, customVideos: legacyVideos, legacyRecalls, preferences: { theme: legacyTheme } };
}

let workspaceLoad: Promise<WorkspaceState> | null = null;

export function loadWorkspace(): Promise<WorkspaceState> {
  if (!workspaceLoad) {
    workspaceLoad = loadWorkspaceFromStorage().catch((error) => {
      workspaceLoad = null;
      throw error;
    });
  }
  return workspaceLoad;
}

export async function saveWorkspace(state: WorkspaceState) {
  const db = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    const request = db.transaction(STORE, 'readwrite').objectStore(STORE).put(state, KEY);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
  });
  db.close();
}
