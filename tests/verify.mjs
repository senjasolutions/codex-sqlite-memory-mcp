import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { MemoryStore } from "../src/lib/store.mjs";

const dbPath = path.resolve(process.cwd(), "tmp/codex-memory-verify.sqlite");

for (const suffix of ["", "-shm", "-wal"]) {
  fs.rmSync(`${dbPath}${suffix}`, { force: true });
}

const store = new MemoryStore({ dbPath });

const fact = store.saveMemory({
  scope: "project",
  project: "demo",
  kind: "fact",
  content: "Codex memory server uses SQLite as the canonical store.",
  tags: ["mcp", "sqlite", "memory"],
  source: "verify script",
  confidence: 0.95
});

const decision = store.saveMemory({
  scope: "repo",
  project: "demo",
  kind: "decision",
  content: "Use zero-install Node with node:sqlite before adding external packages.",
  tags: ["decision", "node"],
  source: "verify script",
  confidence: 0.92
});

const checkpoint = store.saveMemory({
  scope: "task",
  project: "demo",
  kind: "checkpoint",
  content: "Core memory server scaffold completed with search and archive support.",
  tags: ["checkpoint", "implementation"],
  source: "verify script",
  confidence: 0.9
});

assert.equal(typeof fact.id, "number");
assert.equal(typeof decision.id, "number");
assert.equal(typeof checkpoint.id, "number");

const keywordResults = store.searchMemory({ query: "SQLite", limit: 10 });
assert.ok(keywordResults.some((memory) => memory.id === fact.id));

const projectResults = store.searchMemory({ query: "Node", project: "demo", limit: 10 });
assert.equal(projectResults.length, 1);
assert.equal(projectResults[0].id, decision.id);

const kindResults = store.searchMemory({ query: "completed", kind: "checkpoint", limit: 10 });
assert.equal(kindResults.length, 1);
assert.equal(kindResults[0].id, checkpoint.id);

const recent = store.getRecentMemories({ project: "demo", limit: 3 });
assert.equal(recent.length, 3);

const firstUpsert = store.upsertMemory({
  memory_key: "architecture.memory.backend",
  scope: "repo",
  project: "demo",
  kind: "decision",
  content: "Canonical persistence uses a SQLite table plus optional FTS mirror.",
  tags: ["architecture", "sqlite"],
  source: "verify script",
  confidence: 0.94
});

const secondUpsert = store.upsertMemory({
  memory_key: "architecture.memory.backend",
  scope: "repo",
  project: "demo",
  kind: "decision",
  content: "Canonical persistence uses SQLite with FTS when available.",
  tags: ["architecture", "fts", "sqlite"],
  source: "verify script update",
  confidence: 0.96
});

assert.equal(firstUpsert.action, "inserted");
assert.equal(secondUpsert.action, "updated");
assert.equal(firstUpsert.memory.id, secondUpsert.memory.id);

const dedupeResults = store.searchMemory({ query: "Canonical persistence", limit: 10 });
assert.equal(dedupeResults.filter((memory) => memory.memory_key === "architecture.memory.backend").length, 1);

store.archiveMemory(decision.id);
const archivedResults = store.searchMemory({ query: "zero-install", limit: 10 });
assert.equal(archivedResults.length, 0);

assert.throws(
  () => store.saveMemory({
    scope: "project",
    project: "demo",
    kind: "fact",
    content: "password=supersecret123",
    tags: ["unsafe"],
    source: "verify script"
  }),
  /probable secret-bearing content/
);

store.close();

console.log(JSON.stringify({
  ok: true,
  dbPath,
  ftsEnabled: store.ftsEnabled,
  verified: [
    "save_memory",
    "search_memory",
    "get_recent_memories",
    "upsert_memory",
    "archive_memory",
    "secret_rejection"
  ]
}, null, 2));
