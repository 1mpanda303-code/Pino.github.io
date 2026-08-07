interface D1Result<T> { results?: T[]; }
interface D1Statement {
  bind(...values: unknown[]): D1Statement;
  first<T>(): Promise<T | null>;
  run<T>(): Promise<D1Result<T>>;
}
interface D1Database { prepare(query: string): D1Statement; }
interface Env { DB: D1Database; SYNC_SECRET: string; }
type PagesContext = { request: Request; env: Env };

type SnapshotRow = { revision: number; workspace_json: string; updated_at: string };

const json = (value: unknown, status = 200) => new Response(JSON.stringify(value), {
  status,
  headers: { 'Content-Type': 'application/json;charset=utf-8', 'Cache-Control': 'no-store' },
});

async function sameSecret(provided: string, expected: string) {
  const encoder = new TextEncoder();
  const [left, right] = await Promise.all([
    crypto.subtle.digest('SHA-256', encoder.encode(provided)),
    crypto.subtle.digest('SHA-256', encoder.encode(expected)),
  ]);
  const a = new Uint8Array(left); const b = new Uint8Array(right);
  let difference = a.length ^ b.length;
  for (let index = 0; index < Math.min(a.length, b.length); index += 1) difference |= a[index] ^ b[index];
  return difference === 0;
}

async function authorized(request: Request, env: Env) {
  const header = request.headers.get('Authorization') ?? '';
  if (!env.SYNC_SECRET || !header.startsWith('Bearer ')) return false;
  return sameSecret(header.slice(7), env.SYNC_SECRET);
}

function validWorkspace(value: unknown) {
  if (!value || typeof value !== 'object') return false;
  const item = value as Record<string, unknown>;
  const validConversation = (entry: unknown) => {
    if (!entry || typeof entry !== 'object') return false;
    const message = entry as Record<string, unknown>;
    return typeof message.id === 'string' && !!message.id
      && (message.role === 'user' || message.role === 'assistant')
      && typeof message.content === 'string' && !!message.content.trim()
      && (message.kind === 'conversation' || message.kind === 'status' || message.kind === 'live-practice' || message.kind === 'ai-report')
      && typeof message.createdAt === 'string' && !!message.createdAt;
  };
  const validConversations = !!item.aiConversations && typeof item.aiConversations === 'object' && !Array.isArray(item.aiConversations)
    && Object.entries(item.aiConversations as Record<string, unknown>).every(([episodeId, conversation]) => !!episodeId && Array.isArray(conversation) && conversation.every(validConversation));
  const validAiReports = Array.isArray(item.aiReports) && item.aiReports.every((entry) => {
    if (!entry || typeof entry !== 'object') return false;
    const stored = entry as Record<string, unknown>;
    if (!stored.report || typeof stored.report !== 'object' || Array.isArray(stored.report)) return false;
    const report = stored.report as Record<string, unknown>;
    return typeof stored.episodeId === 'string' && !!stored.episodeId
      && typeof stored.importedAt === 'string' && !!stored.importedAt
      && typeof stored.updatedAt === 'string' && !!stored.updatedAt
      && typeof stored.fingerprint === 'string' && !!stored.fingerprint
      && report.schemaVersion === 'luma-ai-assistant-report/v1'
      && report.reportType === 'ai_assistant'
      && report.episodeId === stored.episodeId;
  });
  const validLedgers = item.questionLedgers === undefined || (!!item.questionLedgers && typeof item.questionLedgers === 'object' && !Array.isArray(item.questionLedgers)
    && Object.entries(item.questionLedgers as Record<string, unknown>).every(([episodeId, entries]) => !!episodeId && Array.isArray(entries) && entries.every((entry) => {
      if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return false;
      const ledger = entry as Record<string, unknown>;
      return typeof ledger.questionKey === 'string' && !!ledger.questionKey
        && typeof ledger.question === 'string' && !!ledger.question
        && typeof ledger.answerSummary === 'string'
        && typeof ledger.stage === 'string' && !!ledger.stage
        && (ledger.status === 'open' || ledger.status === 'resolved');
    })));
  const validKeywordBuckets = item.episodeKeywords === undefined || (!!item.episodeKeywords && typeof item.episodeKeywords === 'object' && !Array.isArray(item.episodeKeywords)
    && Object.entries(item.episodeKeywords as Record<string, unknown>).every(([episodeId, keywords]) => !!episodeId && Array.isArray(keywords) && keywords.every((keyword) => typeof keyword === 'string' && !!keyword.trim())));
  const validAliasMaps = (item.episodeAliases === undefined || (!!item.episodeAliases && typeof item.episodeAliases === 'object' && !Array.isArray(item.episodeAliases)
    && Object.entries(item.episodeAliases as Record<string, unknown>).every(([alias, id]) => typeof alias === 'string' && !!alias && typeof id === 'string' && !!id)))
    && (item.episodeAliasHistory === undefined || (!!item.episodeAliasHistory && typeof item.episodeAliasHistory === 'object' && !Array.isArray(item.episodeAliasHistory)
      && Object.entries(item.episodeAliasHistory as Record<string, unknown>).every(([id, aliases]) => typeof id === 'string' && !!id && Array.isArray(aliases) && aliases.every((alias) => typeof alias === 'string' && !!alias))));
  return item.schemaVersion === 6 && validConversations && validAiReports && Array.isArray(item.customVideos) && Array.isArray(item.highlights)
    && Array.isArray(item.reports) && !!item.activeSessions && typeof item.activeSessions === 'object'
    && !!item.studyAttempts && typeof item.studyAttempts === 'object'
    && !!item.activeAttemptIds && typeof item.activeAttemptIds === 'object'
    && !!item.legacyRecalls && typeof item.legacyRecalls === 'object'
    && !!item.completions && typeof item.completions === 'object'
    && validLedgers && validKeywordBuckets && validAliasMaps;
}

export async function onRequest({ request, env }: PagesContext) {
  if (!await authorized(request, env)) return json({ error: 'unauthorized' }, 401);
  if (request.method === 'GET') {
    const row = await env.DB.prepare('SELECT revision, workspace_json, updated_at FROM workspace_snapshots WHERE id = ?').bind('personal').first<SnapshotRow>();
    return row ? json({ revision: row.revision, workspace: JSON.parse(row.workspace_json), updatedAt: row.updated_at }) : json({ revision: 0, workspace: null, updatedAt: null });
  }
  if (request.method !== 'PUT') return json({ error: 'method_not_allowed' }, 405);

  let body: { baseRevision?: unknown; workspace?: unknown };
  try { body = await request.json() as typeof body; } catch { return json({ error: 'invalid_json' }, 400); }
  if (!Number.isInteger(body.baseRevision) || (body.baseRevision as number) < 0 || !validWorkspace(body.workspace)) return json({ error: 'invalid_payload' }, 400);
  const serialized = JSON.stringify(body.workspace);
  if (serialized.length > 2_000_000) return json({ error: 'payload_too_large' }, 413);
  const now = new Date().toISOString(); const baseRevision = body.baseRevision as number;
  let row: SnapshotRow | null;
  if (baseRevision === 0) {
    row = await env.DB.prepare('INSERT INTO workspace_snapshots (id, revision, workspace_json, updated_at) VALUES (?, 1, ?, ?) ON CONFLICT(id) DO NOTHING RETURNING revision, workspace_json, updated_at')
      .bind('personal', serialized, now).first<SnapshotRow>();
  } else {
    row = await env.DB.prepare('UPDATE workspace_snapshots SET revision = revision + 1, workspace_json = ?, updated_at = ? WHERE id = ? AND revision = ? RETURNING revision, workspace_json, updated_at')
      .bind(serialized, now, 'personal', baseRevision).first<SnapshotRow>();
  }
  if (!row) {
    const current = await env.DB.prepare('SELECT revision FROM workspace_snapshots WHERE id = ?').bind('personal').first<{ revision: number }>();
    return json({ error: 'revision_conflict', currentRevision: current?.revision ?? 0 }, 409);
  }
  return json({ revision: row.revision, workspace: JSON.parse(row.workspace_json), updatedAt: row.updated_at });
}
