import path from "node:path";
import { fileURLToPath } from "node:url";

const serverFilePath = fileURLToPath(new URL("../main.mjs", import.meta.url));
const repoRoot = path.resolve(path.dirname(serverFilePath), "..");

export function resolveDbPath(env = process.env) {
  const explicitPath = normalizeText(env.MEMORY_DB_PATH);
  const explicitBaseDir = normalizeText(env.MEMORY_DB_BASE_DIR);

  if (explicitPath) {
    if (path.isAbsolute(explicitPath)) {
      return explicitPath;
    }

    const baseDir = explicitBaseDir
      ? resolveBaseDir(explicitBaseDir)
      : repoRoot;

    return path.resolve(baseDir, explicitPath);
  }

  return path.resolve(repoRoot, "data/codex-memory.sqlite");
}

export function getRepoRoot() {
  return repoRoot;
}

function resolveBaseDir(baseDir) {
  if (path.isAbsolute(baseDir)) {
    return baseDir;
  }

  return path.resolve(repoRoot, baseDir);
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}
