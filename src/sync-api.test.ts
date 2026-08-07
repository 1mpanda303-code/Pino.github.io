import { describe, expect, it } from 'vitest';
import { onRequest } from '../functions/api/sync';
import { emptyWorkspace } from './domain/workspace';
import { createAiReportTemplate, createStoredAiReport } from './domain/aiReport';
import { decideSync } from './sync';

type Row = { revision: number; workspace_json: string; updated_at: string };

class FakeDatabase {
  row: Row | null = null;

  prepare(query: string) {
    let values: unknown[] = [];
    const statement = {
      bind: (...next: unknown[]) => { values = next; return statement; },
      first: async <T>() => {
        if (query.startsWith('SELECT revision, workspace_json')) return this.row as T | null;
        if (query.startsWith('SELECT revision FROM')) return this.row ? { revision: this.row.revision } as T : null;
        if (query.startsWith('INSERT INTO')) {
          if (this.row) return null;
          this.row = { revision: 1, workspace_json: values[1] as string, updated_at: values[2] as string };
          return this.row as T;
        }
        if (query.startsWith('UPDATE workspace_snapshots')) {
          if (!this.row || this.row.revision !== values[3]) return null;
          this.row = { revision: this.row.revision + 1, workspace_json: values[0] as string, updated_at: values[1] as string };
          return this.row as T;
        }
        return null;
      },
      run: async <T>() => ({ results: [] as T[] }),
    };
    return statement;
  }
}

function context(db: FakeDatabase, method = 'GET', body?: unknown, secret = 'personal-secret') {
  const request = new Request('https://example.pages.dev/api/sync', {
    method,
    headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  return { request, env: { DB: db, SYNC_SECRET: 'personal-secret' } } as never;
}

describe('single-user sync API', () => {
  it('rejects an incorrect secret', async () => {
    const response = await onRequest(context(new FakeDatabase(), 'GET', undefined, 'wrong'));
    expect(response.status).toBe(401);
  });

  it('creates and reads the first snapshot', async () => {
    const db = new FakeDatabase();
    const created = await onRequest(context(db, 'PUT', { baseRevision: 0, workspace: emptyWorkspace }));
    expect(created.status).toBe(200);
    expect((await created.json()).revision).toBe(1);
    const loaded = await onRequest(context(db));
    expect((await loaded.json()).workspace).toEqual(emptyWorkspace);
  });

  it('stores and returns complete per-video AI conversations in the cloud snapshot', async () => {
    const db = new FakeDatabase();
    const workspace = {
      ...emptyWorkspace,
      aiConversations: {
        'teded-p934': [
          { id: 'ai-message-1', role: 'user', kind: 'conversation', content: 'What does this sentence mean?', createdAt: '2026-08-07T00:00:00.000Z' },
          { id: 'ai-message-2', role: 'assistant', kind: 'conversation', content: 'It means the plan changed.', createdAt: '2026-08-07T00:00:01.000Z' },
          { id: 'ai-message-3', role: 'assistant', kind: 'ai-report', content: '{"schemaVersion":"luma-ai-assistant-report/v1"}', createdAt: '2026-08-07T00:00:02.000Z' },
        ],
        'teded-p920': [{ id: 'ai-message-4', role: 'user', kind: 'conversation', content: 'What is a manuscript?', createdAt: '2026-08-07T00:01:00.000Z' }],
      },
    };
    const created = await onRequest(context(db, 'PUT', { baseRevision: 0, workspace }));
    expect(created.status).toBe(200);
    const loaded = await onRequest(context(db));
    expect((await loaded.json()).workspace.aiConversations).toEqual(workspace.aiConversations);
  });

  it('stores AI assistant reports in the cloud snapshot', async () => {
    const db = new FakeDatabase();
    const report = createAiReportTemplate({ id: 'teded-p934', title: 'Monster duel' }, new Date('2026-08-07T04:00:00.000Z'));
    const workspace = { ...emptyWorkspace, aiReports: [createStoredAiReport(report)] };
    const created = await onRequest(context(db, 'PUT', { baseRevision: 0, workspace }));
    expect(created.status).toBe(200);
    const loaded = await onRequest(context(db));
    expect((await loaded.json()).workspace.aiReports).toEqual(workspace.aiReports);
  });

  it('rejects a stale revision', async () => {
    const db = new FakeDatabase();
    await onRequest(context(db, 'PUT', { baseRevision: 0, workspace: emptyWorkspace }));
    const response = await onRequest(context(db, 'PUT', { baseRevision: 0, workspace: emptyWorkspace }));
    expect(response.status).toBe(409);
  });
});

describe('automatic sync decisions', () => {
  const metadata = { revision: 3, hash: 'previous' };
  it('pushes only local changes', () => expect(decideSync('local', 'previous', metadata, 3)).toBe('push'));
  it('pulls only remote changes', () => expect(decideSync('previous', 'remote', metadata, 4)).toBe('pull'));
  it('stops when both devices changed', () => expect(decideSync('local', 'remote', metadata, 4)).toBe('conflict'));
  it('adopts metadata when both copies match', () => expect(decideSync('same', 'same', null, 8)).toBe('same'));
});
