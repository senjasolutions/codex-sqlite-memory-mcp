import path from "node:path";
import process from "node:process";
import { getRepoRoot } from "../src/lib/paths.mjs";

const repoRoot = getRepoRoot();
const serverPath = path.resolve(repoRoot, "src/main.mjs");

const options = parseArgs(process.argv.slice(2));
const resolved = buildConfig(options);

process.stdout.write(renderOutput(resolved));

function parseArgs(argv) {
  const options = {
    mode: "project",
    dbPath: null,
    dbBaseDir: null,
    snippetOnly: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === "--mode") {
      options.mode = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--mode=")) {
      options.mode = arg.split("=")[1];
      continue;
    }

    if (arg === "--db-path") {
      options.dbPath = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--db-path=")) {
      options.dbPath = arg.slice("--db-path=".length);
      continue;
    }

    if (arg === "--db-base-dir") {
      options.dbBaseDir = argv[++index] || "";
      continue;
    }

    if (arg.startsWith("--db-base-dir=")) {
      options.dbBaseDir = arg.slice("--db-base-dir=".length);
      continue;
    }

    if (arg === "--snippet-only") {
      options.snippetOnly = true;
      continue;
    }

    if (arg === "--help" || arg === "-h") {
      printHelpAndExit();
    }

    throw new Error(`Unknown argument: ${arg}`);
  }

  if (!["project", "shared"].includes(options.mode)) {
    throw new Error(`Invalid mode: ${options.mode}`);
  }

  return options;
}

function buildConfig(options) {
  const mode = options.mode;
  const dbPath = normalizeDbPath(mode, options.dbPath);
  const dbBaseDir = normalizeText(options.dbBaseDir);

  return {
    mode,
    serverPath,
    dbPath,
    dbBaseDir,
    toml: renderToml({
      serverPath,
      dbPath,
      dbBaseDir,
    }),
    snippetOnly: options.snippetOnly,
  };
}

function normalizeDbPath(mode, explicitDbPath) {
  const dbPath = normalizeText(explicitDbPath);
  if (dbPath) {
    return path.isAbsolute(dbPath) ? dbPath : dbPath;
  }

  if (mode === "shared") {
    return path.resolve(process.env.HOME || "~", ".codex/memory/global.sqlite");
  }

  return path.resolve(repoRoot, "data/codex-memory.sqlite");
}

function renderToml({ serverPath, dbPath, dbBaseDir }) {
  const lines = [
    "[mcp_servers.memory]",
    'command = "node"',
    `args = ["${escapeTomlString(serverPath)}"]`,
    "startup_timeout_sec = 20",
    "tool_timeout_sec = 60",
    "enabled = true",
    "",
    "[mcp_servers.memory.env]",
    `MEMORY_DB_PATH = "${escapeTomlString(dbPath)}"`,
  ];

  if (dbBaseDir) {
    lines.push(
      `MEMORY_DB_BASE_DIR = "${escapeTomlString(dbBaseDir)}"`,
    );
  }

  return `${lines.join("\n")}\n`;
}

function renderOutput(config) {
  if (config.snippetOnly) {
    return config.toml;
  }

  return [
    "# Codex memory config snippet",
    "",
    `Mode: ${config.mode}`,
    `Server path: ${config.serverPath}`,
    `DB path: ${config.dbPath}`,
    config.dbBaseDir ? `DB base dir: ${config.dbBaseDir}` : null,
    "",
    "Copy this into your target project's .codex/config.toml:",
    "",
    "```toml",
    config.toml.trimEnd(),
    "```",
    "",
    "Next steps:",
    "1. Ensure this repository's dependencies are installed with `npm install`.",
    "2. Paste the snippet into the target project's `.codex/config.toml`.",
    "3. Start a fresh Codex session so the MCP server is reloaded.",
    "",
  ]
    .filter(Boolean)
    .join("\n");
}

function escapeTomlString(value) {
  return String(value).replace(/\\/g, "\\\\").replace(/"/g, '\\"');
}

function normalizeText(value) {
  if (value === undefined || value === null) {
    return null;
  }

  const text = String(value).trim();
  return text.length > 0 ? text : null;
}

function printHelpAndExit() {
  process.stdout.write(
    [
      "Usage: node scripts/install-codex-config.mjs [options]",
      "",
      "Options:",
      "  --mode <project|shared>     Generate config for project-local or shared DB mode",
      "  --db-path <path>            Override the generated MEMORY_DB_PATH",
      "  --db-base-dir <path>        Optional MEMORY_DB_BASE_DIR for relative DB paths",
      "  --snippet-only              Print TOML only",
      "  --help                      Show this help",
      "",
    ].join("\n"),
  );
  process.exit(0);
}
