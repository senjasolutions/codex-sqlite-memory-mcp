import fs from "node:fs";
import path from "node:path";
import { spawn } from "node:child_process";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";

const repoRoot = process.cwd();
const serverEntrypoint = path.resolve(repoRoot, "src/main.mjs");

export function resetSqliteFiles(dbPath) {
  for (const suffix of ["", "-shm", "-wal"]) {
    fs.rmSync(`${dbPath}${suffix}`, { force: true });
  }
}

export async function startSdkClient({ dbPath, cwd = repoRoot, debug = false }) {
  const client = new Client({ name: "regression-client", version: "1.0.0" });
  const transport = new StdioClientTransport({
    command: "node",
    args: [serverEntrypoint],
    cwd,
    env: {
      ...process.env,
      MEMORY_DB_PATH: dbPath,
      ...(debug ? { MEMORY_DEBUG: "1" } : {}),
    },
  });

  await client.connect(transport);

  return {
    client,
    close: async () => {
      await client.close();
    },
  };
}

export function spawnRawServer({ dbPath, debug = false, cwd = repoRoot }) {
  const child = spawn("node", [serverEntrypoint], {
    cwd,
    env: {
      ...process.env,
      MEMORY_DB_PATH: dbPath,
      ...(debug ? { MEMORY_DEBUG: "1" } : {}),
    },
    stdio: ["pipe", "pipe", "pipe"],
  });

  let stdout = "";
  let stderr = "";

  child.stdout.on("data", (chunk) => {
    stdout += chunk.toString();
  });

  child.stderr.on("data", (chunk) => {
    stderr += chunk.toString();
  });

  return {
    child,
    sendJson(message) {
      child.stdin.write(`${JSON.stringify(message)}\n`);
    },
    sendRaw(line) {
      child.stdin.write(line);
    },
    async readJson(timeoutMs = 3000) {
      const startedAt = Date.now();

      while (Date.now() - startedAt < timeoutMs) {
        const newlineIndex = stdout.indexOf("\n");
        if (newlineIndex !== -1) {
          const line = stdout.slice(0, newlineIndex).replace(/\r$/, "");
          stdout = stdout.slice(newlineIndex + 1);
          return JSON.parse(line);
        }
        await sleep(25);
      }

      throw new Error("Timed out waiting for JSON message from server");
    },
    getStderr() {
      return stderr;
    },
    async close() {
      child.kill();
      await new Promise((resolve) => child.once("exit", resolve));
    },
  };
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
