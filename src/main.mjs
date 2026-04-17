import process from "node:process";
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { ErrorCode, McpError } from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";
import { resolveDbPath } from "./lib/paths.mjs";
import { MemoryStore, formatMemorySummary } from "./lib/store.mjs";

const dbPath = resolveDbPath(process.env);

const store = new MemoryStore({ dbPath });
const debugEnabled = process.env.MEMORY_DEBUG === "1";

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

server.server.onerror = (error) => {
  debugLog("protocol-error", error instanceof Error ? error.message : String(error));
};

server.server.onclose = () => {
  debugLog("transport-close");
};

server.server.fallbackRequestHandler = async (request) => {
  debugLog("unsupported-request", request.method);
  throw new McpError(
    ErrorCode.MethodNotFound,
    `Unsupported method: ${request.method}`
  );
};

server.server.fallbackNotificationHandler = async (notification) => {
  debugLog("ignored-notification", notification.method);
};

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
  "get_memory_by_key",
  {
    description: "Retrieve one memory directly by its stable memory_key.",
    inputSchema: {
      memory_key: z.string(),
      include_archived: z.boolean().optional(),
    },
  },
  async (args) => {
    const memory = store.getMemoryByKey(args.memory_key, {
      includeArchived: args.include_archived,
    });

    if (!memory) {
      return toolResult(`No memory found for key ${args.memory_key}`, {
        found: false,
        memory_key: args.memory_key,
        memory: null,
      });
    }

    return toolResult(`Found memory ${memory.id} for key ${args.memory_key}`, {
      found: true,
      memory_key: args.memory_key,
      memory: formatMemorySummary(memory),
    });
  }
);

server.registerTool(
  "list_memories",
  {
    description:
      "List memories with lightweight summaries and optional admin filters.",
    inputSchema: {
      scope: scopeSchema.optional(),
      project: z.string().optional(),
      kind: kindSchema.optional(),
      archived: z.boolean().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
  },
  async (args) => {
    const memories = store.listMemories(args).map(formatMemorySummary);
    return toolResult(`Listed ${memories.length} memory record(s)`, {
      memories,
      filters: {
        scope: args.scope ?? null,
        project: args.project ?? null,
        kind: args.kind ?? null,
        archived: args.archived ?? false,
        limit: args.limit ?? 10,
      },
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

server.registerTool(
  "delete_memory",
  {
    description:
      "Hard-delete one memory by id or memory_key. Requires confirm=true.",
    inputSchema: {
      id: z.number().int().optional(),
      memory_key: z.string().optional(),
      confirm: z.boolean(),
    },
  },
  async (args) => {
    const deleted = store.deleteMemory(args);

    if (!deleted) {
      return toolResult("No memory found to delete", {
        deleted: false,
        selector: selectorSummary(args),
        memory: null,
      });
    }

    return toolResult(`Deleted memory ${deleted.id}`, {
      deleted: true,
      selector: selectorSummary(args),
      memory: formatMemorySummary(deleted),
    });
  }
);

process.on("exit", () => {
  store.close();
});

async function main() {
  const transport = new StdioServerTransport();
  transport.onerror = (error) => {
    debugLog("transport-error", error instanceof Error ? error.message : String(error));
  };
  await server.connect(transport);
  debugLog("server-ready", { dbPath });
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

function selectorSummary(args) {
  return {
    id: args.id ?? null,
    memory_key: args.memory_key ?? null,
  };
}

function debugLog(event, details) {
  if (!debugEnabled) {
    return;
  }

  const payload =
    details === undefined
      ? { event }
      : { event, details };

  process.stderr.write(`[memory-debug] ${JSON.stringify(payload)}\n`);
}
