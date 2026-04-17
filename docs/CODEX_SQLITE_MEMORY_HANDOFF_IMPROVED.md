# Codex Handoff: Build a SQLite-Backed Memory Layer via MCP

## Mission

Build a **durable local memory layer** for Codex using:

`Codex ⇄ MCP memory server ⇄ SQLite`

Do not make undocumented built-in Codex memory behavior the primary solution.

## What changed from the original brief

The original direction was sound, but real setup work exposed several practical clarifications:

1. `AGENTS.md` does not create memory by itself.
   - It can only instruct behavior.
   - MCP registration and persistence still require explicit implementation and config.

2. Repo-wide memory guidance belongs in the **root** `AGENTS.md`.
   - A nested `memory/AGENTS.md` only governs files in that subtree.
   - If you want Codex behavior to change repo-wide, put the guidance at the repo root.

3. The SQLite database path should be configurable and treated as local state.
   - Defaulting the DB into a tracked repo path is usually the wrong default.
   - Keep code in Git, keep state ignored by Git.

4. Protocol handling should use the official MCP SDK.
   - Hand-rolled stdio/JSON-RPC framing is the main long-term compatibility risk.
   - Keep custom logic focused on the memory domain, not transport mechanics.

5. Zero-install Node is viable for SQLite persistence if local Node exposes `node:sqlite`.
   - This keeps the storage layer light.
   - It also means the implementation still carries Node's current experimental warning for `node:sqlite`.

6. Search must stay permissive.
   - An overconstrained FTS query builder can make correct records disappear.
   - Natural-language memory search should degrade gracefully, not require perfect query phrasing.

7. The main payoff is **token reduction**, not necessarily raw local speed.
   - For tiny local files, direct file reads can still be faster.
   - The larger win is returning one compact durable record instead of shoving full docs into model context.

## Primary objectives

1. Build a local MCP server for memory.
2. Use SQLite as the canonical store.
3. Support exact retrieval and fast text retrieval.
4. Store durable structured records, not raw prompt/response dumps.
5. Keep setup reproducible for Codex users.
6. Keep the implementation inspectable with normal SQLite tooling.

## Non-goals

- no vector search in version one
- no remote database in version one
- no blind full-conversation logging
- no heavy framework when a small local service works
- no hidden dependence on undocumented Codex internals

## Required memory model

Each memory record should support at least:

- `id`
- `memory_key`
- `scope`
- `project`
- `kind`
- `content`
- `tags`
- `source`
- `confidence`
- `created_at`
- `updated_at`
- `last_used_at`
- `is_archived`

Recommended scopes:

- `global`
- `project`
- `repo`
- `task`

Recommended kinds:

- `fact`
- `decision`
- `bugfix`
- `checkpoint`
- `summary`
- `preference`

## Required SQLite design

Canonical table:

```sql
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
```

Strong preference:

- add FTS5 over `content`, `tags`, `project`, `kind`
- keep canonical truth in `memories`
- sync the FTS mirror with triggers

## Required MCP tools

Expose at least:

1. `save_memory`
2. `search_memory`
3. `get_recent_memories`
4. `upsert_memory`
5. `archive_memory`

## Memory quality policy

Store:

- architectural decisions
- recurring project facts
- repo conventions
- environment quirks
- bug causes and fixes
- setup notes
- task checkpoints
- durable user preferences

Do not store:

- every conversation turn
- guesses
- noise
- duplicates
- secrets

## Secret handling

Reject or refuse records that appear to contain:

- passwords
- tokens
- API keys
- private keys
- credentials

## Codex config target

Provide a project-scoped `.codex/config.toml` example.

Example:

```toml
[mcp_servers.memory]
command = "node"
args = ["src/main.mjs"]
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true

[mcp_servers.memory.env]
MEMORY_DB_PATH = "data/codex-memory.sqlite"
```

## Required AGENTS guidance

Keep it short and repo-wide:

- search memory before significant work
- save durable outcomes after meaningful work
- prefer upsert over duplicate writes
- never store secrets
- keep entries concise and factual
- source files win if memory and source disagree

## Implementation sequence

1. inspect the repo and choose the natural implementation path
2. decide whether zero-install Node is available
3. build schema and bootstrap logic
4. build storage layer
5. build MCP tool handlers
6. add FTS and fallback search
7. add Codex config example
8. add AGENTS guidance
9. add verification script
10. write installation docs
11. test transport and search behavior

## Acceptance criteria

The work is complete only when:

1. Codex can connect through `.codex/config.toml`
2. a memory can be saved
3. a saved memory can be found by text search
4. retrieval can be filtered by scope/project/kind
5. upsert prevents uncontrolled duplication
6. archived memories disappear from normal search
7. obvious secret-bearing content is rejected
8. README explains setup, use, backup, and limitations
9. search remains usable with realistic natural-language queries

## Testing requirements

Minimum verification:

- save a fact
- save a decision
- save a checkpoint
- search by keyword
- search by project
- search by kind
- upsert the same stable key twice and confirm one durable record remains
- archive a record and confirm it no longer appears
- attempt to save an obvious secret and confirm rejection
- verify the MCP transport can `initialize`, `tools/list`, and `tools/call`

## Final output expectations

When done, provide:

1. a concise build summary
2. the created/changed files
3. the exact command to run the server
4. the exact `.codex/config.toml` block
5. the current limitations
6. the benchmark takeaway:
   - whether token usage improved
   - whether raw local speed improved or not
   - whether accuracy matched the source-of-truth path
