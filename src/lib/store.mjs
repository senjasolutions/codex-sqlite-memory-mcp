import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import {
  BASE_SCHEMA_SQL,
  FTS_SYNC_SQL,
  FTS_TABLE_SQL,
  normalizeKind,
  normalizeScope,
} from "./schema.mjs";

const SECRET_PATTERNS = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/i,
  /\b(api[_-]?key|access[_-]?token|refresh[_-]?token|client[_-]?secret|password)\b\s*[:=]/i,
  /\bsk-[a-z0-9]{20,}\b/i,
  /\bAKIA[0-9A-Z]{16}\b/,
  /\bBearer\s+[A-Za-z0-9._-]{20,}\b/i,
];

function ensureParentDir(filePath) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }
  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function normalizeTags(input) {
  const raw = Array.isArray(input)
    ? input
    : String(input || "")
        .split(",")
        .map((value) => value.trim());

  return [...new Set(raw.filter(Boolean).map((value) => value.toLowerCase()))].sort();
}

function parseTags(rawTags) {
  if (!rawTags) {
    return [];
  }
  try {
    const parsed = JSON.parse(rawTags);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function clampConfidence(value) {
  if (value === undefined || value === null || value === "") {
    return 1;
  }
  const number = Number(value);
  if (!Number.isFinite(number) || number < 0 || number > 1) {
    throw new Error("confidence must be a number between 0 and 1");
  }
  return number;
}

function validateContent(content) {
  const value = normalizeText(content);
  if (!value) {
    throw new Error("content is required");
  }
  for (const pattern of SECRET_PATTERNS) {
    if (pattern.test(value)) {
      throw new Error("Refusing to store probable secret-bearing content");
    }
  }
  return value;
}

function rowToMemory(row) {
  return {
    id: row.id,
    memory_key: row.memory_key,
    scope: row.scope,
    project: row.project,
    kind: row.kind,
    content: row.content,
    tags: parseTags(row.tags),
    source: row.source,
    confidence: row.confidence,
    created_at: row.created_at,
    updated_at: row.updated_at,
    last_used_at: row.last_used_at,
    is_archived: Boolean(row.is_archived),
  };
}

export class MemoryStore {
  constructor({ dbPath }) {
    if (!dbPath) {
      throw new Error("MEMORY_DB_PATH is required");
    }
    ensureParentDir(dbPath);
    this.db = new DatabaseSync(dbPath);
    this.db.exec(BASE_SCHEMA_SQL);
    this.ftsEnabled = this.#setupFts();
  }

  #setupFts() {
    try {
      this.db.exec(FTS_TABLE_SQL);
      this.db.exec(FTS_SYNC_SQL);
      this.db.exec("INSERT INTO memories_fts(memories_fts) VALUES('rebuild');");
      return true;
    } catch {
      return false;
    }
  }

  close() {
    this.db.close();
  }

  saveMemory(input) {
    const memory = this.#normalizeInput(input);
    const result = this.db.prepare(`
      INSERT INTO memories (
        memory_key,
        scope,
        project,
        kind,
        content,
        tags,
        source,
        confidence,
        last_used_at,
        is_archived
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, NULL, 0)
    `).run(
      memory.memory_key,
      memory.scope,
      memory.project,
      memory.kind,
      memory.content,
      JSON.stringify(memory.tags),
      memory.source,
      memory.confidence
    );

    return this.getMemoryById(result.lastInsertRowid);
  }

  upsertMemory(input) {
    const memory = this.#normalizeInput(input, { requireMemoryKey: true });
    const existing = this.db.prepare("SELECT id FROM memories WHERE memory_key = ?").get(memory.memory_key);

    if (!existing) {
      return {
        action: "inserted",
        memory: this.saveMemory(memory),
      };
    }

    this.db.prepare(`
      UPDATE memories
      SET scope = ?,
          project = ?,
          kind = ?,
          content = ?,
          tags = ?,
          source = ?,
          confidence = ?,
          updated_at = CURRENT_TIMESTAMP,
          is_archived = 0
      WHERE memory_key = ?
    `).run(
      memory.scope,
      memory.project,
      memory.kind,
      memory.content,
      JSON.stringify(memory.tags),
      memory.source,
      memory.confidence,
      memory.memory_key
    );

    return {
      action: "updated",
      memory: this.getMemoryById(existing.id),
    };
  }

  archiveMemory(id) {
    const result = this.db.prepare(`
      UPDATE memories
      SET is_archived = 1,
          updated_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(Number(id));

    if (result.changes === 0) {
      throw new Error(`Memory not found: ${id}`);
    }

    return this.getMemoryById(id, { includeArchived: true });
  }

  deleteMemory(input) {
    const confirmed = input?.confirm === true;
    if (!confirmed) {
      throw new Error("delete_memory requires confirm=true");
    }

    const hasId = input?.id !== undefined && input?.id !== null;
    const hasKey = normalizeText(input?.memory_key) !== null;

    if (hasId === hasKey) {
      throw new Error("Provide exactly one of id or memory_key");
    }

    let existing;
    let result;

    if (hasId) {
      const id = Number(input.id);
      existing = this.getMemoryById(id, { includeArchived: true });
      if (!existing) {
        return null;
      }

      result = this.db.prepare(`
        DELETE FROM memories
        WHERE id = ?
      `).run(id);
    } else {
      const memoryKey = normalizeText(input.memory_key);
      existing = this.getMemoryByKey(memoryKey, { includeArchived: true });
      if (!existing) {
        return null;
      }

      result = this.db.prepare(`
        DELETE FROM memories
        WHERE memory_key = ?
      `).run(memoryKey);
    }

    if (result.changes === 0) {
      return null;
    }

    return existing;
  }

  getMemoryById(id, options = {}) {
    const includeArchived = Boolean(options.includeArchived);
    const row = this.db.prepare(`
      SELECT *
      FROM memories
      WHERE id = ?
      ${includeArchived ? "" : "AND is_archived = 0"}
    `).get(Number(id));

    return row ? rowToMemory(row) : null;
  }

  getMemoryByKey(memoryKey, options = {}) {
    const key = normalizeText(memoryKey);
    if (!key) {
      throw new Error("memory_key is required");
    }

    const includeArchived = Boolean(options.includeArchived);
    const row = this.db.prepare(`
      SELECT *
      FROM memories
      WHERE memory_key = ?
      ${includeArchived ? "" : "AND is_archived = 0"}
      ORDER BY id DESC
      LIMIT 1
    `).get(key);

    const memory = row ? rowToMemory(row) : null;
    if (memory) {
      this.#touchMemories([memory.id]);
    }
    return memory;
  }

  listMemories(filters = {}) {
    const params = [];
    const where = [];

    if (filters.scope) {
      where.push("scope = ?");
      params.push(normalizeScope(filters.scope));
    }

    if (filters.project) {
      where.push("project = ?");
      params.push(normalizeText(filters.project));
    }

    if (filters.kind) {
      where.push("kind = ?");
      params.push(normalizeKind(filters.kind));
    }

    if (filters.archived === true) {
      where.push("is_archived = 1");
    } else if (filters.archived === false || filters.archived === undefined) {
      where.push("is_archived = 0");
    }

    params.push(normalizeLimit(filters.limit));

    const rows = this.db.prepare(`
      SELECT *
      FROM memories
      ${where.length ? `WHERE ${where.join(" AND ")}` : ""}
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `).all(...params).map(rowToMemory);

    this.#touchMemories(rows.map((row) => row.id));
    return rows;
  }

  getRecentMemories(filters = {}) {
    const params = [];
    const where = ["is_archived = 0"];

    if (filters.scope) {
      where.push("scope = ?");
      params.push(normalizeScope(filters.scope));
    }

    if (filters.project) {
      where.push("project = ?");
      params.push(normalizeText(filters.project));
    }

    params.push(normalizeLimit(filters.limit));

    const rows = this.db.prepare(`
      SELECT *
      FROM memories
      WHERE ${where.join(" AND ")}
      ORDER BY COALESCE(last_used_at, updated_at, created_at) DESC, id DESC
      LIMIT ?
    `).all(...params).map(rowToMemory);

    this.#touchMemories(rows.map((row) => row.id));
    return rows;
  }

  searchMemory(filters = {}) {
    const limit = normalizeLimit(filters.limit);
    const rows = this.ftsEnabled
      ? this.#searchWithFts(filters, limit)
      : this.#searchWithLike(filters, limit);

    this.#touchMemories(rows.map((row) => row.id));
    return rows;
  }

  #searchWithFts(filters, limit) {
    const params = [buildFtsQuery(filters.query)];
    const where = ["m.is_archived = 0"];

    if (!params[0]) {
      throw new Error("query is required");
    }

    if (filters.scope) {
      where.push("m.scope = ?");
      params.push(normalizeScope(filters.scope));
    }

    if (filters.project) {
      where.push("m.project = ?");
      params.push(normalizeText(filters.project));
    }

    if (filters.kind) {
      where.push("m.kind = ?");
      params.push(normalizeKind(filters.kind));
    }

    params.push(limit);

    return this.db.prepare(`
      SELECT
        m.*,
        bm25(memories_fts, 5.0, 2.0, 1.5, 1.0) AS score
      FROM memories_fts
      JOIN memories m ON m.id = memories_fts.rowid
      WHERE memories_fts MATCH ?
        AND ${where.join(" AND ")}
      ORDER BY score ASC, m.updated_at DESC
      LIMIT ?
    `).all(...params).map(rowToMemory);
  }

  #searchWithLike(filters, limit) {
    const query = String(filters.query || "").trim();
    if (!query) {
      throw new Error("query is required");
    }

    const params = [];
    const where = ["is_archived = 0"];

    if (filters.scope) {
      where.push("scope = ?");
      params.push(normalizeScope(filters.scope));
    }

    if (filters.project) {
      where.push("project = ?");
      params.push(normalizeText(filters.project));
    }

    if (filters.kind) {
      where.push("kind = ?");
      params.push(normalizeKind(filters.kind));
    }

    const like = `%${query}%`;
    where.push("(content LIKE ? OR tags LIKE ? OR project LIKE ? OR kind LIKE ?)");
    params.push(like, like, like, like, limit);

    return this.db.prepare(`
      SELECT *
      FROM memories
      WHERE ${where.join(" AND ")}
      ORDER BY updated_at DESC, id DESC
      LIMIT ?
    `).all(...params).map(rowToMemory);
  }

  #touchMemories(ids) {
    if (!ids.length) {
      return;
    }

    const placeholders = ids.map(() => "?").join(", ");
    this.db.prepare(`
      UPDATE memories
      SET last_used_at = CURRENT_TIMESTAMP
      WHERE id IN (${placeholders})
    `).run(...ids);
  }

  #normalizeInput(input, options = {}) {
    const memory = {
      memory_key: normalizeText(input.memory_key),
      scope: normalizeScope(input.scope),
      project: normalizeText(input.project),
      kind: normalizeKind(input.kind),
      content: validateContent(input.content),
      tags: normalizeTags(input.tags),
      source: normalizeText(input.source),
      confidence: clampConfidence(input.confidence),
    };

    if (options.requireMemoryKey && !memory.memory_key) {
      throw new Error("memory_key is required");
    }

    return memory;
  }
}

function normalizeLimit(limit) {
  if (limit === undefined || limit === null || limit === "") {
    return 10;
  }
  const value = Number(limit);
  if (!Number.isInteger(value) || value < 1 || value > 100) {
    throw new Error("limit must be an integer between 1 and 100");
  }
  return value;
}

function buildFtsQuery(query) {
  const tokens = [...new Set(
    String(query || "")
      .trim()
      .split(/\s+/)
      .map((token) => token.replace(/"/g, "").trim())
      .filter((token) => token.length >= 2)
  )].slice(0, 3);

  if (!tokens.length) {
    return "";
  }

  return tokens.map((token) => `"${token}"`).join(" AND ");
}

export function formatMemorySummary(memory) {
  return {
    id: memory.id,
    memory_key: memory.memory_key,
    scope: memory.scope,
    project: memory.project,
    kind: memory.kind,
    content: memory.content,
    tags: memory.tags,
    source: memory.source,
    confidence: memory.confidence,
    updated_at: memory.updated_at,
    archived: memory.is_archived,
  };
}
