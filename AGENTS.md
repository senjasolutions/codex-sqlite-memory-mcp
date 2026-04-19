# Codex SQLite Memory MCP — Guidance

- Search memory before significant work when prior durable facts, decisions, or checkpoints are likely to matter.
- Save only durable records: facts, decisions, bugfixes, checkpoints, summaries, and preferences.
- Prefer `upsert_memory` with a stable `memory_key` instead of duplicating records.
- Never store secrets, passwords, tokens, or private keys.
- Keep memory concise, scoped, and factual.
- Prefer compact current-state summaries for active projects over raw session notes.
- Archive low-signal seed or test rows once a better durable summary exists.
- Treat source code and checked-in docs as authoritative when memory and source disagree.
