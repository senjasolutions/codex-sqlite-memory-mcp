import assert from "node:assert/strict";
import path from "node:path";
import { getRepoRoot, resolveDbPath } from "../src/lib/paths.mjs";

const repoRoot = getRepoRoot();

assert.equal(
  resolveDbPath({}),
  path.resolve(repoRoot, "data/codex-memory.sqlite"),
);

assert.equal(
  resolveDbPath({ MEMORY_DB_PATH: "/tmp/custom.sqlite" }),
  "/tmp/custom.sqlite",
);

assert.equal(
  resolveDbPath({ MEMORY_DB_PATH: "data/local.sqlite" }),
  path.resolve(repoRoot, "data/local.sqlite"),
);

assert.equal(
  resolveDbPath({
    MEMORY_DB_PATH: "shared.sqlite",
    MEMORY_DB_BASE_DIR: "/tmp/memory-base",
  }),
  "/tmp/memory-base/shared.sqlite",
);

assert.equal(
  resolveDbPath({
    MEMORY_DB_PATH: "shared.sqlite",
    MEMORY_DB_BASE_DIR: "tmp/base",
  }),
  path.resolve(repoRoot, "tmp/base/shared.sqlite"),
);

console.log(
  JSON.stringify(
    {
      ok: true,
      repoRoot,
      verified: [
        "default_repo_root_path",
        "absolute_db_path",
        "relative_db_path_against_repo_root",
        "absolute_base_dir",
        "relative_base_dir_against_repo_root",
      ],
    },
    null,
    2,
  ),
);
