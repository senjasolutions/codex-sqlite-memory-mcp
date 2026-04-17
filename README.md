# Codex SQLite Memory MCP

[![CI](https://github.com/senjasolutions/codex-sqlite-memory-mcp/actions/workflows/ci.yml/badge.svg)](https://github.com/senjasolutions/codex-sqlite-memory-mcp/actions/workflows/ci.yml)

Local durable memory for Codex:

`Codex ⇄ MCP memory server ⇄ SQLite`

This project gives Codex a small explicit memory layer for durable facts, decisions, checkpoints, summaries, bugfix context, and user preferences. It is designed to reduce prompt payload and repeated rediscovery work across sessions.

## Why this exists

- Codex instructions alone do not create durable searchable memory.
- SQLite is easy to inspect, back up, and evolve.
- MCP is the clean integration surface Codex already uses.
- The server now uses the official MCP SDK for protocol handling.
- SQLite persistence still uses local Node plus `node:sqlite`.

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
- installed project dependencies

Install dependencies:

```bash
npm install
```

Generate a ready-to-use Codex config snippet:

```bash
npm run codex:config
```

Shared/global DB mode:

```bash
npm run codex:config -- --mode shared
```

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

Continuous integration:

- GitHub Actions runs `npm run verify` and `npm run verify:paths` on every push and pull request.

## Install for Codex users

1. Clone this repository.
2. Prefer using the helper to generate the config snippet:

```bash
npm run codex:config
```

3. Copy the generated snippet into your target project's `.codex/config.toml`.
4. Adjust `MEMORY_DB_PATH` if you want the SQLite file somewhere else.
5. Optionally set `MEMORY_DB_BASE_DIR` if you want relative DB paths resolved against a specific directory.
6. Start a fresh Codex session so it loads the MCP server.

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

Helper examples:

Project-local DB:

```bash
npm run codex:config -- --mode project
```

Shared/global DB:

```bash
npm run codex:config -- --mode shared
```

Snippet only:

```bash
npm run codex:config -- --mode shared --snippet-only
```

Path resolution precedence:

1. `MEMORY_DB_PATH` absolute path
2. `MEMORY_DB_PATH` relative path resolved against `MEMORY_DB_BASE_DIR` when provided
3. `MEMORY_DB_PATH` relative path resolved against the server repo root
4. default path at `data/codex-memory.sqlite` under the server repo root

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
It is resolved relative to the server repo root, not the current working directory.

Project-local example:

```toml
[mcp_servers.memory.env]
MEMORY_DB_PATH = "data/codex-memory.sqlite"
```

Shared/global example:

```toml
[mcp_servers.memory.env]
MEMORY_DB_PATH = "/Users/ali/.codex/memory/global.sqlite"
```

Relative path with explicit base directory:

```toml
[mcp_servers.memory.env]
MEMORY_DB_PATH = "memory/shared.sqlite"
MEMORY_DB_BASE_DIR = "/Users/ali/Shared-Codex-State"
```

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

- this version uses the official MCP SDK over stdio
- it relies on `node:sqlite`, which currently emits an experimental warning in Node
- file reads can still be faster than SQLite lookup for tiny local contexts
- the bigger win is token reduction and repeated-task recall, not sub-millisecond local IO
- search quality is intentionally simple and should stay permissive rather than overconstrained

## Protocol behavior

- supported tools are exposed through normal MCP `tools/list`
- unsupported request methods return a structured `MethodNotFound` error
- notifications that the server does not explicitly use are ignored safely
- debug logging is opt-in only and goes to stderr, never stdout

Enable debug logging:

```bash
MEMORY_DEBUG=1 node src/main.mjs
```

## Troubleshooting

### Check Node version first

Expected:

- Node.js `24+`

Check:

```bash
node -v
```

If you are below `24`, upgrade Node first. A lower version can break both the MCP SDK runtime and `node:sqlite`.

### `node:sqlite` is missing or unsupported

Check:

```bash
node --input-type=module -e "import { DatabaseSync } from 'node:sqlite'; console.log(typeof DatabaseSync);"
```

Expected output:

```text
function
```

Likely failure:

```text
Error [ERR_UNKNOWN_BUILTIN_MODULE]: No such built-in module: node:sqlite
```

Likely fix:

- upgrade Node to a version that includes `node:sqlite`
- rerun `node -v`
- rerun the check above before trying to launch the server again

### Experimental `node:sqlite` warning

Expected warning in current Node:

```text
ExperimentalWarning: SQLite is an experimental feature and might change at any time
```

This warning is expected in the current implementation and does not mean the server is broken.

Verify the actual server still works:

```bash
npm run verify
```

If verification passes, the warning is informational rather than fatal.

### Config path mistakes

The safest install path is to generate the config snippet instead of typing it by hand:

```bash
npm run codex:config
```

Common mistake:

- using a relative `args = ["src/main.mjs"]` in another repo's `.codex/config.toml`

Safer pattern:

- use the helper output, which prints an absolute server path

Quick check:

```bash
npm run codex:config -- --snippet-only
```

If Codex says it cannot start the server, re-check:

- `command = "node"`
- `args` points to the absolute `src/main.mjs`
- `MEMORY_DB_PATH` is the path you actually intend to use

### Working-directory-dependent launch problems

This project now resolves the DB path relative to the server repo root, not the current working directory, unless you provide an explicit absolute path or base directory.

Current precedence:

1. absolute `MEMORY_DB_PATH`
2. relative `MEMORY_DB_PATH` resolved against `MEMORY_DB_BASE_DIR`
3. relative `MEMORY_DB_PATH` resolved against the server repo root
4. default `data/codex-memory.sqlite` under the server repo root

If you want to confirm the generated config is stable even when launched elsewhere:

```bash
npm run codex:config -- --mode project
```

For shared/global memory:

```bash
npm run codex:config -- --mode shared
```

### Database file permission or open errors

Likely failure:

```text
Error: unable to open database file
```

Likely causes:

- parent directory does not exist
- current user cannot write to the parent directory
- `MEMORY_DB_PATH` points somewhere unintended

Checks:

```bash
npm run codex:config -- --snippet-only
ls -ld "$(dirname /absolute/path/to/your.sqlite)"
```

Project-local sanity check:

```bash
ls -ld /Users/ali/AI-Brain/codex-sqlite-memory-mcp/data
```

Likely fix:

- choose a writable path
- prefer a user-owned path such as:

```toml
MEMORY_DB_PATH = "/Users/ali/.codex/memory/global.sqlite"
```

or the project-local default generated by the helper

### Server launches but Codex cannot use tools

Check the server directly:

```bash
node src/main.mjs
```

Check the storage layer:

```bash
npm run verify
npm run verify:paths
```

If local verification passes but Codex still cannot use the tools, the most likely problem is `.codex/config.toml`, not SQLite itself.

### Debugging without polluting stdout

Enable opt-in debug logs on stderr only:

```bash
MEMORY_DEBUG=1 node src/main.mjs
```

This is safe because MCP traffic stays on stdout while debug output goes to stderr.

## Benchmark takeaway

On a repeated task benchmark from the original setup environment:

- direct file retrieval was slightly faster
- memory retrieval reduced payload from about `11,501` bytes to about `839` bytes
- the important gain was lower prompt/context volume, not raw lookup speed

## Versioning and releases

- versioning follows semantic versioning adapted for a pre-1.0 project
- `0.x.0` means significant feature additions or breaking changes
- `0.0.x` means smaller fixes, stability improvements, or docs-only updates
- notable user-facing changes are recorded in `CHANGELOG.md`

Manual release flow:

1. update `package.json` version
2. update `CHANGELOG.md`
3. run:

```bash
npm run verify
npm run verify:paths
```

4. commit the release changes
5. create an annotated tag, for example:

```bash
git tag -a v0.2.0 -m "Release v0.2.0"
```

6. push commit and tag when you are ready to publish

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
