import assert from "node:assert/strict";
import path from "node:path";
import { MemoryStore } from "../src/lib/store.mjs";
import { resetSqliteFiles, startSdkClient } from "./helpers/server-test-utils.mjs";

const dbPath = path.resolve(process.cwd(), "tmp/storage-regression.sqlite");
const restartDbPath = path.resolve(process.cwd(), "tmp/storage-restart.sqlite");

resetSqliteFiles(dbPath);
resetSqliteFiles(restartDbPath);

const store = new MemoryStore({ dbPath });

const archived = store.saveMemory({
  memory_key: "storage.archived",
  scope: "repo",
  project: "storage-regression",
  kind: "checkpoint",
  content: "This memory will be archived.",
  tags: ["archived", "storage"],
  source: "storage regression",
  confidence: 1,
});

store.archiveMemory(archived.id);

assert.equal(store.getMemoryById(archived.id), null);

const archivedRecord = store.getMemoryById(archived.id, { includeArchived: true });
assert.ok(archivedRecord);
assert.equal(archivedRecord.is_archived, true);

const recentAfterArchive = store.getRecentMemories({ project: "storage-regression", limit: 10 });
assert.equal(recentAfterArchive.length, 0);

const archivedList = store.listMemories({
  project: "storage-regression",
  archived: true,
  limit: 10,
});
assert.equal(archivedList.length, 1);
assert.equal(archivedList[0].memory_key, "storage.archived");

const activeList = store.listMemories({
  project: "storage-regression",
  archived: false,
  limit: 10,
});
assert.equal(activeList.length, 0);

const active = store.saveMemory({
  memory_key: "storage.active",
  scope: "repo",
  project: "storage-regression",
  kind: "fact",
  content: "This memory should survive reopen.",
  tags: ["active", "storage"],
  source: "storage regression",
  confidence: 1,
});

store.close();

const reopened = new MemoryStore({ dbPath });
const reopenedSearch = reopened.searchMemory({ query: "survive reopen", limit: 10 });
assert.equal(reopenedSearch.length, 1);
assert.equal(reopenedSearch[0].id, active.id);

const deleted = reopened.deleteMemory({
  id: active.id,
  confirm: true,
});
assert.ok(deleted);
assert.equal(reopened.getMemoryById(active.id, { includeArchived: true }), null);
assert.equal(reopened.searchMemory({ query: "survive reopen", limit: 10 }).length, 0);
reopened.close();

const firstRun = await startSdkClient({ dbPath: restartDbPath });

try {
  await firstRun.client.callTool({
    name: "save_memory",
    arguments: {
      memory_key: "restart.persistence",
      scope: "task",
      project: "storage-regression",
      kind: "checkpoint",
      content: "Repeated startup persistence check.",
      tags: ["restart", "persistence"],
      source: "storage regression",
      confidence: 1,
    },
  });
} finally {
  await firstRun.close();
}

const secondRun = await startSdkClient({ dbPath: restartDbPath });

try {
  const result = await secondRun.client.callTool({
    name: "search_memory",
    arguments: {
      query: "Repeated startup persistence",
      limit: 5,
    },
  });

  const memories = result.structuredContent?.memories || [];
  assert.equal(memories.length, 1);
  assert.equal(memories[0].memory_key, "restart.persistence");
} finally {
  await secondRun.close();
}

console.log(
  JSON.stringify(
    {
      ok: true,
      verified: [
        "archived_memory_hidden_by_default",
        "archived_memory_accessible_when_requested",
        "list_memories_filters_by_archive_state",
        "recent_memories_exclude_archived",
        "db_reopen_preserves_data",
        "hard_delete_removes_record",
        "repeated_server_startup_reuses_existing_db",
      ],
    },
    null,
    2,
  ),
);
