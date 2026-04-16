# Codex Handoff: Build a SQLite-Backed Memory Layer via MCP

## Mission

You are working inside an existing project and must add a **durable local memory layer** for Codex using the following architecture:

**Codex ⇄ MCP memory server ⇄ SQLite**

Do **not** treat undocumented internal or experimental SQLite flags inside Codex as the primary solution. Build a normal, explicit MCP server that exposes memory tools and uses SQLite as the persistence layer.

The result must be practical, easy to reason about, easy to back up, and safe to evolve.

---

## Why this architecture

Codex officially supports MCP servers in both the CLI and IDE extension, configured through `config.toml`. MCP servers can be added either globally in `~/.codex/config.toml` or per project in `.codex/config.toml`. The CLI and IDE share this configuration. Also, Codex supports project guidance via `AGENTS.md`, with more specific files closer to the working directory taking precedence. Therefore, the clean implementation is to build a dedicated memory MCP server and wire it into Codex via config rather than relying on undocumented built-in memory storage behavior.

---

## Primary objectives

1. Build a **local MCP server** for memory.
2. Use **SQLite** as the storage engine.
3. Support both **exact retrieval** and **fast text retrieval**.
4. Keep memory quality high by storing **durable facts, decisions, checkpoints, and summaries** rather than raw conversation dumps.
5. Make the system straightforward to inspect manually with standard SQLite tooling.
6. Make setup reproducible for Codex CLI and Codex IDE.

---

## Non-goals

Do **not** do any of the following unless explicitly requested later:

- Do not implement vector search first.
- Do not add remote hosted databases.
- Do not store every prompt/response pair blindly.
- Do not introduce a heavy framework if a small local service will do.
- Do not rely on undocumented internal Codex memory flags as the production path.

---

## Required deliverables

Create all of the following unless equivalent files already exist and only need modification:

1. A small MCP memory server implementation.
2. A SQLite schema and migration/bootstrap logic.
3. A configuration example for Codex.
4. A short `AGENTS.md` or repo-level memory guidance section telling Codex how to use this memory.
5. A README explaining setup, usage, and maintenance.
6. A basic test suite or at minimum a verification script that proves:
   - memories can be saved,
   - memories can be searched,
   - recent memories can be listed,
   - upserts work,
   - scoped retrieval works.

---

## Preferred stack

Choose the lightest stack already compatible with the repository.

### If the repo is Node-first
Prefer:
- TypeScript or plain Node.js
- SQLite package with solid local support
- Minimal MCP server implementation

### If the repo is Python-first
Prefer:
- Python 3.11+
- `sqlite3` from the standard library if sufficient
- minimal dependencies

If the repository is mixed, prefer the language that best matches the rest of the project.

---

## Required memory model

Implement memory as **structured durable records**, not as raw logs.

Each memory record should support at least:

- `id`
- `scope` — one of `global`, `project`, `repo`, `task`, or similarly clear scopes
- `project`
- `kind` — for example `fact`, `decision`, `bugfix`, `checkpoint`, `summary`, `preference`
- `content`
- `tags`
- `source`
- `confidence`
- `created_at`
- `updated_at`
- `last_used_at`
- `is_archived`

Use clear defaults and keep nullability sensible.

---

## Required SQLite design

Use a normal table for the source of truth and add FTS5 for text retrieval if available.

### Minimum schema

Use this as the baseline and adapt only if needed:

```sql
CREATE TABLE IF NOT EXISTS memories (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
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

### Strongly preferred

Also create an FTS5 virtual table for search, for example using:

- `content`
- `tags`
- `project`
- `kind`

Keep the canonical data in `memories` and keep the search index synchronized.

### Optional but recommended

Create a uniqueness strategy for durable upserts. For example, either:

- a `memory_key` field, or
- a deterministic hash for deduplication

This helps prevent repeated storage of the same fact.

---

## Required MCP tool surface

Expose at least these tools from the MCP server:

### 1. `save_memory`
Store a new memory.

Input:
- `scope`
- `project`
- `kind`
- `content`
- `tags`
- `source`
- `confidence`

Behavior:
- validate required fields
- normalize tags
- write to SQLite
- update the search index
- return the new memory id and normalized record summary

### 2. `search_memory`
Search memory by query.

Input:
- `query`
- `scope` optional
- `project` optional
- `kind` optional
- `limit`

Behavior:
- use FTS when available
- otherwise fall back to `LIKE`
- rank reasonably
- exclude archived rows by default
- return concise records sorted by relevance

### 3. `get_recent_memories`
Return recent memory entries.

Input:
- `scope` optional
- `project` optional
- `limit`

Behavior:
- return newest or recently used records
- exclude archived rows by default

### 4. `upsert_memory`
Create or update a durable memory record.

Input:
- `memory_key` or equivalent stable identifier
- other fields as needed

Behavior:
- update if the memory already exists
- insert otherwise
- preserve clean timestamps

### 5. `archive_memory`
Soft-archive a memory.

Input:
- `id`

Behavior:
- mark archived instead of hard-deleting unless explicitly asked later

---

## Optional MCP tools

Implement only if easy and useful:

- `get_memory_by_id`
- `delete_memory`
- `list_memory_kinds`
- `list_memory_tags`
- `record_memory_use`
- `summarize_old_memories`

Do not let optional tools delay the core build.

---

## Memory quality policy

This is important.

Only store information that is likely to remain useful across tasks or sessions.

### Good things to store

- architectural decisions
- recurring project facts
- naming conventions
- environment quirks
- bug causes and fixes
- setup notes
- task checkpoints
- repository-specific conventions
- user preferences that affect future engineering work

### Bad things to store

- every conversational exchange
- speculative guesses
- one-off temporary thoughts
- noisy duplicate records
- sensitive secrets in plain text

### Secret handling

Never store secrets, access tokens, private keys, passwords, or raw credentials in memory.
If a candidate memory appears secret-bearing, refuse to store it and return a safe warning.

---

## Retrieval behavior policy

When this memory system is used by Codex, retrieval should be selective.

Suggested policy:

1. On session start or task start, retrieve:
   - project facts
   - relevant decisions
   - recent checkpoints
2. Before major implementation work, retrieve memory filtered by project and kind.
3. Before saving, check for an existing equivalent memory.
4. Prefer updating an existing durable memory over creating duplicates.
5. Return short, relevant results rather than huge dumps.

---

## Recommended file layout

Adapt to the repo’s structure, but a good default is:

```text
.codex/
  config.toml
AGENTS.md
memory/
  server/
    ...mcp server code...
  db/
    memory.sqlite
    migrations/
  tests/
README.memory.md
```

If the repo already has a conventional place for tools or services, use that instead.

---

## Codex configuration target

Provide a project-scoped Codex config example for `.codex/config.toml`.

Use the locally running memory MCP server.

### Example pattern for a STDIO MCP server

```toml
[mcp_servers.memory]
command = "python"
args = ["memory/server/main.py"]
startup_timeout_sec = 20
tool_timeout_sec = 60
enabled = true
```

Or the Node equivalent if implemented in Node.

Do not assume global installation if the repo can run locally from checked-in code.

---

## Required AGENTS.md guidance

Create or update repo guidance so Codex knows how to use memory well.

Add a short section along these lines:

- Before starting significant work, search project memory for relevant facts, decisions, and checkpoints.
- Save durable outcomes after completing meaningful work.
- Prefer updating existing memories over writing duplicates.
- Never store secrets.
- Keep memory concise and factual.

Keep this guidance short and practical.

---

## Implementation sequence

Follow this order unless the repo structure strongly suggests a better one:

1. Inspect the repository structure and choose the natural implementation language.
2. Create the SQLite schema and initialization logic.
3. Implement the minimal data access layer.
4. Implement the MCP server tool handlers.
5. Add FTS search.
6. Add project-scoped Codex config.
7. Add AGENTS guidance.
8. Add tests and a verification script.
9. Write the README.
10. Run validation and fix any rough edges.

---

## Acceptance criteria

The work is complete only when all of the following are true:

1. Codex can connect to the MCP memory server through `.codex/config.toml`.
2. A new memory can be saved successfully.
3. Saved memories can be retrieved by text query.
4. Retrieval can be filtered by scope and project.
5. Durable facts can be upserted without uncontrolled duplication.
6. Archived memories do not show up in normal searches.
7. A short README explains setup and usage.
8. The implementation is easy to inspect locally with ordinary SQLite tools.

---

## Testing requirements

At minimum, verify these cases:

### Insert
- save a fact
- save a decision
- save a checkpoint

### Search
- search by keyword
- search with project filter
- search with kind filter

### Upsert
- save a memory with a stable key
- upsert the same key again
- confirm only one durable record remains

### Archive
- archive a record
- confirm it is excluded from normal search

### Safety
- attempt to save obvious secret-like content
- confirm it is rejected or sanitized according to the policy

---

## Documentation requirements

Your README must explain:

1. What the memory layer is.
2. Why MCP is used.
3. Where the SQLite database file lives.
4. How to start the server.
5. How to wire it into Codex.
6. How to inspect the database manually.
7. How to back it up.
8. Known limitations.

Also include a short example flow:

- start Codex
- query memory
- implement a task
- save a resulting decision/checkpoint

---

## Important guardrails

- Keep the implementation small.
- Favor readability over cleverness.
- Minimize dependencies.
- Do not invent a complex ranking system unless needed.
- Do not overdesign for multi-user operation unless the repo already requires it.
- Make the first version strong, local, and boring.

---

## If you discover Codex-native experimental memory flags

You may document them in comments or the README as future possibilities, but:

- do not make them the primary implementation,
- do not depend on them for correctness,
- do not remove the explicit MCP + SQLite path.

---

## Final output format

When you finish, provide:

1. A concise summary of what you built.
2. The files created or changed.
3. Exact commands needed to run the MCP server.
4. Exact `.codex/config.toml` snippet to enable it.
5. Any follow-up improvements worth considering later.

---

## Working style

- Inspect first.
- Make a brief plan.
- Implement in small steps.
- Test before claiming completion.
- Prefer precise changes over broad refactors.

If the repo already contains partial memory infrastructure, integrate with it carefully instead of replacing it blindly.
