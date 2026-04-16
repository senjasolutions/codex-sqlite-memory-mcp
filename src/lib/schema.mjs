export const MEMORY_SCOPES = ["global", "project", "repo", "task"];

export const MEMORY_KINDS = [
  "fact",
  "decision",
  "bugfix",
  "checkpoint",
  "summary",
  "preference",
];

export const BASE_SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  memory_key TEXT UNIQUE,
  scope TEXT NOT NULL,
  project TEXT,
  kind TEXT NOT NULL,
  content TEXT NOT NULL,
  tags TEXT,
  source TEXT,
  confidence REAL NOT NULL DEFAULT 1.0,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  last_used_at TEXT,
  is_archived INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS idx_memories_scope ON memories(scope);
CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project);
CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
CREATE INDEX IF NOT EXISTS idx_memories_archived ON memories(is_archived);
CREATE INDEX IF NOT EXISTS idx_memories_last_used ON memories(last_used_at);
CREATE INDEX IF NOT EXISTS idx_memories_updated ON memories(updated_at);
`;

export const FTS_TABLE_SQL = `
CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
  content,
  tags,
  project,
  kind,
  content='memories',
  content_rowid='id'
);
`;

export const FTS_SYNC_SQL = `
CREATE TRIGGER IF NOT EXISTS memories_ai AFTER INSERT ON memories BEGIN
  INSERT INTO memories_fts(rowid, content, tags, project, kind)
  VALUES (new.id, new.content, COALESCE(new.tags, ''), COALESCE(new.project, ''), new.kind);
END;

CREATE TRIGGER IF NOT EXISTS memories_ad AFTER DELETE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags, project, kind)
  VALUES('delete', old.id, old.content, COALESCE(old.tags, ''), COALESCE(old.project, ''), old.kind);
END;

CREATE TRIGGER IF NOT EXISTS memories_au AFTER UPDATE ON memories BEGIN
  INSERT INTO memories_fts(memories_fts, rowid, content, tags, project, kind)
  VALUES('delete', old.id, old.content, COALESCE(old.tags, ''), COALESCE(old.project, ''), old.kind);
  INSERT INTO memories_fts(rowid, content, tags, project, kind)
  VALUES (new.id, new.content, COALESCE(new.tags, ''), COALESCE(new.project, ''), new.kind);
END;
`;

export function normalizeScope(scope) {
  const value = String(scope || "").trim().toLowerCase();
  if (!MEMORY_SCOPES.includes(value)) {
    throw new Error(`Invalid scope: ${scope}`);
  }
  return value;
}

export function normalizeKind(kind) {
  const value = String(kind || "").trim().toLowerCase();
  if (!MEMORY_KINDS.includes(value)) {
    throw new Error(`Invalid kind: ${kind}`);
  }
  return value;
}

