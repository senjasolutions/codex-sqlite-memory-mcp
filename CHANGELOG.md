# Changelog

All notable changes to this project will be documented in this file.

The format is based on Keep a Changelog, with semantic versioning adapted for a pre-1.0 project:

- `0.x.0` for significant feature additions or breaking changes
- `0.0.x` for small fixes and documentation-only updates

## [Unreleased]

- No unreleased changes yet.

## [0.2.0] - 2026-04-17

### Added

- official MCP SDK integration over stdio
- deterministic DB path resolution independent of current working directory
- config generation helper at `scripts/install-codex-config.mjs`
- path verification script
- GitHub Actions CI workflow for `verify` and `verify:paths`
- dedicated troubleshooting guidance in the README
- documented protocol behavior with opt-in stderr debug logging
- expanded regex-based secret detection and dedicated secret regression coverage

### Changed

- server protocol handling now uses the official MCP SDK instead of custom JSON-RPC framing
- install flow now includes `npm install`
- README now documents local/project and shared/global DB configuration more clearly

## [0.1.0] - 2026-04-16

### Added

- initial standalone Codex SQLite memory MCP package
- SQLite-backed durable memory store with FTS5 when available
- core tools: `save_memory`, `search_memory`, `get_recent_memories`, `upsert_memory`, `archive_memory`
- verification script
- project-scoped Codex config example
- AGENTS guidance and implementation handoff document
