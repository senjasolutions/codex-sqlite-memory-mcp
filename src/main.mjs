import path from "node:path";
import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";
import { MemoryStore, formatMemorySummary } from "./lib/store.mjs";

const dbPath = path.resolve(
  process.cwd(),
  process.env.MEMORY_DB_PATH || "data/codex-memory.sqlite"
);

const store = new MemoryStore({ dbPath });

const scopeSchema = z.enum(["global", "project", "repo", "task"]);
const kindSchema = z.enum([
  "fact",
  "decision",
  "bugfix",
  "checkpoint",
  "summary",
  "preference",
]);
const tagsSchema = z.union([z.array(z.string()), z.string()]);

const server = new McpServer({
  name: "codex-sqlite-memory-mcp",
  version: "0.1.0",
});

server.registerTool(
  "save_memory",
  {
    description:
      "Save a durable memory record for facts, decisions, bugfixes, checkpoints, summaries, or preferences.",
    inputSchema: {
      memory_key: z.string().optional(),
      scope: scopeSchema,
      project: z.string().optional(),
      kind: kindSchema,
      content: z.string(),
      tags: tagsSchema.optional(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    },
  },
  async (args) => {
    const memory = store.saveMemory(args);
    return toolResult(`Saved memory ${memory.id}`, {
      memory: formatMemorySummary(memory),
    });
  }
);

server.registerTool(
  "search_memory",
  {
    description:
      "Search memory by text query with optional scope, project, and kind filters.",
    inputSchema: {
      query: z.string(),
      scope: scopeSchema.optional(),
      project: z.string().optional(),
      kind: kindSchema.optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async (args) => {
    const memories = store.searchMemory(args).map(formatMemorySummary);
    return toolResult(`Found ${memories.length} memory result(s)`, {
      memories,
      fts_enabled: store.ftsEnabled,
    });
  }
);

server.registerTool(
  "get_recent_memories",
  {
    description: "List recent or recently used durable memories.",
    inputSchema: {
      scope: scopeSchema.optional(),
      project: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async (args) => {
    const memories = store.getRecentMemories(args).map(formatMemorySummary);
    return toolResult(`Found ${memories.length} recent memory record(s)`, {
      memories,
    });
  }
);

server.registerTool(
  "upsert_memory",
  {
    description:
      "Insert or update a durable memory record using a stable memory_key.",
    inputSchema: {
      memory_key: z.string(),
      scope: scopeSchema,
      project: z.string().optional(),
      kind: kindSchema,
      content: z.string(),
      tags: tagsSchema.optional(),
      source: z.string().optional(),
      confidence: z.number().min(0).max(1).optional(),
    },
  },
  async (args) => {
    const result = store.upsertMemory(args);
    return toolResult(`${result.action} memory ${result.memory.id}`, {
      action: result.action,
      memory: formatMemorySummary(result.memory),
    });
  }
);

server.registerTool(
  "archive_memory",
  {
    description: "Soft-archive a memory so it stops appearing in normal search.",
    inputSchema: {
      id: z.number().int(),
    },
  },
  async (args) => {
    const memory = store.archiveMemory(args.id);
    return toolResult(`Archived memory ${memory.id}`, {
      memory: formatMemorySummary(memory),
    });
  }
);

process.on("exit", () => {
  store.close();
});

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
}

main().catch((error) => {
  console.error("Server error:", error);
  process.exit(1);
});

function toolResult(message, data) {
  return {
    content: [{ type: "text", text: message }],
    structuredContent: data,
  };
}
