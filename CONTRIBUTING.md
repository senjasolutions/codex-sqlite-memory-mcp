# Contributing

This project is intentionally small, local, and boring.

Contributions should preserve that.

## Architecture overview

The system is:

`Codex ⇄ MCP server ⇄ SQLite`

Core layers:

- `src/main.mjs`
  - MCP server entrypoint
  - tool registration
  - protocol-level behavior
- `src/lib/store.mjs`
  - memory persistence
  - validation
  - search
  - archive/delete/list/get operations
- `src/lib/schema.mjs`
  - SQLite schema
  - FTS setup
  - scope/kind normalization
- `src/lib/paths.mjs`
  - deterministic DB path resolution
- `tests/`
  - happy-path verification
  - protocol regressions
  - storage regressions
  - path and secret regressions

Design intent:

- explicit local state
- explicit tool behavior
- inspectable SQLite storage
- low operational complexity

## Tool design principles

When adding or changing a tool:

- prefer one clear tool over overloaded behavior
- keep input schema tight and explicit
- return lightweight structured results
- make missing or empty results friendly and deterministic
- bias toward safety over convenience for destructive actions
- avoid hidden side effects

Good tool shape:

- one job
- bounded output
- easy for agents to reason about

Bad tool shape:

- combines search, mutation, and admin behavior in one call
- returns oversized payloads by default
- silently does surprising things

## Schema philosophy

The schema exists to support durable engineering memory, not chat transcripts.

Prefer:

- `fact`
- `decision`
- `bugfix`
- `checkpoint`
- `summary`
- `preference`

Prefer stable selectors:

- `memory_key` for durable exact lookup

Do not expand the schema casually. New fields should earn their way in by clearly improving retrieval, safety, or maintainability.

## Memory hygiene rules

Never optimize for “store more”.
Optimize for “store what remains useful”.

Good records:

- recurring project facts
- stable decisions
- bug causes and fixes
- meaningful checkpoints
- user preferences that affect future engineering work

Bad records:

- raw conversation dumps
- speculative guesses
- duplicate noise
- transient thoughts
- secrets

Secret detection is best-effort only. The correct policy is still: never intentionally store secrets.

## Testing expectations

Before proposing a change, run the tests that cover your change.

Core local checks:

```bash
npm run verify
npm run verify:paths
npm run verify:protocol
npm run verify:storage
npm run verify:secrets
```

If you change:

- tool behavior: run protocol regressions
- storage logic: run storage regressions
- path handling: run path regressions
- secret blocking: run secret regressions

Do not weaken tests just to make a change pass. Fix the code or sharpen the test so it reflects the true intended behavior.

## How to add or modify a tool

1. Update store behavior if persistence/query logic is needed.
2. Register the tool in `src/main.mjs`.
3. Keep the input schema explicit.
4. Keep the output bounded and structured.
5. Add or extend regression coverage.
6. Update `README.md` if the tool is user-facing.

For destructive tools:

- require explicit confirmation flags
- make selectors explicit
- test blocked and allowed paths

## PR expectations

Keep pull requests narrow.

A good PR:

- changes one coherent thing
- includes tests
- updates docs when behavior changes
- keeps the server easier to reason about

A weak PR:

- mixes refactors and behavior changes
- adds new surface area without tests
- adds complexity without reducing real risk

Default bias:

- smaller changes
- clearer contracts
- fewer moving parts
