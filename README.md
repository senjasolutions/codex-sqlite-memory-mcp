# Codex SQLite Memory MCP

Local durable memory for Codex:

`Codex ⇄ MCP memory server ⇄ SQLite`

This project gives Codex a small explicit memory layer for durable facts, decisions, checkpoints, summaries, bugfix context, and user preferences. It is designed to reduce prompt payload and repeated rediscovery work across sessions.

## Why this exists

- Codex instructions alone do not create durable searchable memory.
- SQLite is easy to inspect, back up, and evolve.
- MCP is the clean integration surface Codex already uses.
- The first version avoids package installation by using local Node plus `node:sqlite`.

## What this project includes

- a local stdio MCP server
- a SQLite schema with FTS5 when available
- the five core memory tools
- a verification script
- Codex config example
- AGENTS guidance for good memory hygiene
- an improved implementation handoff document

## Core tools

- `save_memory`
- `search_memory`
- `get_recent_memories`
- `upsert_memory`
- `archive_memory`

## Quick start

Requirements:

- Node.js `24+`
- Codex with project-scoped MCP support

Start the server directly:

```bash
node src/main.mjs
```

Run verification:

```bash
npm run verify
```

or:

```bash
node tests/verify.mjs
```

## Install for Codex users

1. Clone this repository.
2. Copy `.codex/config.example.toml` into your project's `.codex/config.toml`, or merge the `memory` server block into an existing config.
3. Adjust `MEMORY_DB_PATH` if you want the SQLite file somewhere else.
4. Start a fresh Codex session so it loads the MCP server.

Example config:

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

## Recommended operating policy

Good records:

- architectural decisions
- recurring project facts
- repo conventions
- setup notes
- bug causes and fixes
- task checkpoints
- user preferences that affect future engineering work

Do not store:

- raw conversation dumps
- speculative guesses
- duplicate noise
- secrets, passwords, tokens, private keys

## Database path

Default:

`data/codex-memory.sqlite`

This path is intentionally local state and is ignored by Git.

## Manual inspection

```bash
sqlite3 data/codex-memory.sqlite ".tables"
sqlite3 data/codex-memory.sqlite "SELECT id, memory_key, scope, project, kind, content, updated_at FROM memories ORDER BY updated_at DESC LIMIT 20;"
```

## Backup

```bash
cp data/codex-memory.sqlite data/codex-memory.sqlite.backup
```

If WAL files exist, back them up with the main DB file.

## Known limitations

- this version uses raw stdio MCP handling rather than the official MCP Node SDK
- it relies on `node:sqlite`, which currently emits an experimental warning in Node
- file reads can still be faster than SQLite lookup for tiny local contexts
- the bigger win is token reduction and repeated-task recall, not sub-millisecond local IO
- search quality is intentionally simple and should stay permissive rather than overconstrained

## Benchmark takeaway

On a repeated task benchmark from the original setup environment:

- direct file retrieval was slightly faster
- memory retrieval reduced payload from about `11,501` bytes to about `839` bytes
- the important gain was lower prompt/context volume, not raw lookup speed

## Repository structure

```text
.codex/config.example.toml
AGENTS.md
README.md
docs/CODEX_SQLITE_MEMORY_HANDOFF_IMPROVED.md
src/main.mjs
src/lib/schema.mjs
src/lib/store.mjs
tests/verify.mjs
```
