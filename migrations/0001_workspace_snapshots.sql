CREATE TABLE IF NOT EXISTS workspace_snapshots (
  id TEXT PRIMARY KEY,
  revision INTEGER NOT NULL,
  workspace_json TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
