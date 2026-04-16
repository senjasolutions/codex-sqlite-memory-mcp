import path from "node:path";
import process from "node:process";
import { MemoryStore, formatMemorySummary } from "./lib/store.mjs";

const dbPath = path.resolve(
  process.cwd(),
  process.env.MEMORY_DB_PATH || "data/codex-memory.sqlite"
);

const store = new MemoryStore({ dbPath });

const tools = [
  {
    name: "save_memory",
    description: "Save a durable memory record for facts, decisions, bugfixes, checkpoints, summaries, or preferences.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        memory_key: { type: "string" },
        scope: { type: "string", enum: ["global", "project", "repo", "task"] },
        project: { type: "string" },
        kind: { type: "string", enum: ["fact", "decision", "bugfix", "checkpoint", "summary", "preference"] },
        content: { type: "string" },
        tags: {
          oneOf: [
            { type: "array", items: { type: "string" } },
            { type: "string" }
          ]
        },
        source: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["scope", "kind", "content"]
    }
  },
  {
    name: "search_memory",
    description: "Search memory by text query with optional scope, project, and kind filters.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        query: { type: "string" },
        scope: { type: "string", enum: ["global", "project", "repo", "task"] },
        project: { type: "string" },
        kind: { type: "string", enum: ["fact", "decision", "bugfix", "checkpoint", "summary", "preference"] },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      },
      required: ["query"]
    }
  },
  {
    name: "get_recent_memories",
    description: "List recent or recently used durable memories.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        scope: { type: "string", enum: ["global", "project", "repo", "task"] },
        project: { type: "string" },
        limit: { type: "integer", minimum: 1, maximum: 100 }
      }
    }
  },
  {
    name: "upsert_memory",
    description: "Insert or update a durable memory record using a stable memory_key.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        memory_key: { type: "string" },
        scope: { type: "string", enum: ["global", "project", "repo", "task"] },
        project: { type: "string" },
        kind: { type: "string", enum: ["fact", "decision", "bugfix", "checkpoint", "summary", "preference"] },
        content: { type: "string" },
        tags: {
          oneOf: [
            { type: "array", items: { type: "string" } },
            { type: "string" }
          ]
        },
        source: { type: "string" },
        confidence: { type: "number", minimum: 0, maximum: 1 }
      },
      required: ["memory_key", "scope", "kind", "content"]
    }
  },
  {
    name: "archive_memory",
    description: "Soft-archive a memory so it stops appearing in normal search.",
    inputSchema: {
      type: "object",
      additionalProperties: false,
      properties: {
        id: { type: "integer" }
      },
      required: ["id"]
    }
  }
];

const handlers = {
  save_memory: (args) => {
    const memory = store.saveMemory(args);
    return {
      message: `Saved memory ${memory.id}`,
      data: { memory: formatMemorySummary(memory) }
    };
  },
  search_memory: (args) => {
    const memories = store.searchMemory(args).map(formatMemorySummary);
    return {
      message: `Found ${memories.length} memory result(s)`,
      data: { memories, fts_enabled: store.ftsEnabled }
    };
  },
  get_recent_memories: (args) => {
    const memories = store.getRecentMemories(args).map(formatMemorySummary);
    return {
      message: `Found ${memories.length} recent memory record(s)`,
      data: { memories }
    };
  },
  upsert_memory: (args) => {
    const result = store.upsertMemory(args);
    return {
      message: `${result.action} memory ${result.memory.id}`,
      data: {
        action: result.action,
        memory: formatMemorySummary(result.memory)
      }
    };
  },
  archive_memory: (args) => {
    const memory = store.archiveMemory(args.id);
    return {
      message: `Archived memory ${memory.id}`,
      data: { memory: formatMemorySummary(memory) }
    };
  }
};

process.on("exit", () => {
  store.close();
});

process.stdin.on("data", onData);
process.stdin.on("end", () => process.exit(0));

let buffer = Buffer.alloc(0);

function onData(chunk) {
  buffer = Buffer.concat([buffer, chunk]);

  while (true) {
    const headerEnd = buffer.indexOf("\r\n\r\n");
    if (headerEnd === -1) {
      return;
    }

    const headerText = buffer.subarray(0, headerEnd).toString("utf8");
    const match = headerText.match(/Content-Length:\s*(\d+)/i);
    if (!match) {
      throw new Error("Missing Content-Length header");
    }

    const contentLength = Number(match[1]);
    const messageEnd = headerEnd + 4 + contentLength;
    if (buffer.length < messageEnd) {
      return;
    }

    const payload = buffer.subarray(headerEnd + 4, messageEnd).toString("utf8");
    buffer = buffer.subarray(messageEnd);
    handleMessage(JSON.parse(payload));
  }
}

function handleMessage(message) {
  if (message.method === "notifications/initialized") {
    return;
  }

  if (message.method === "initialize") {
    return sendResponse(message.id, {
      protocolVersion: message.params?.protocolVersion || "2025-03-26",
      capabilities: {
        tools: { listChanged: false }
      },
      serverInfo: {
        name: "codex-sqlite-memory-mcp",
        version: "0.1.0"
      }
    });
  }

  if (message.method === "tools/list") {
    return sendResponse(message.id, { tools });
  }

  if (message.method === "tools/call") {
    const handler = handlers[message.params?.name];
    if (!handler) {
      return sendError(message.id, -32601, `Unknown tool: ${message.params?.name}`);
    }

    try {
      const result = handler(message.params?.arguments || {});
      return sendResponse(message.id, {
        content: [{ type: "text", text: result.message }],
        structuredContent: result.data
      });
    } catch (error) {
      return sendError(message.id, -32000, error.message);
    }
  }

  if (message.id !== undefined) {
    sendError(message.id, -32601, `Method not supported: ${message.method}`);
  }
}

function sendResponse(id, result) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    result
  });
}

function sendError(id, code, message) {
  writeMessage({
    jsonrpc: "2.0",
    id,
    error: { code, message }
  });
}

function writeMessage(payload) {
  const body = Buffer.from(JSON.stringify(payload), "utf8");
  const header = Buffer.from(`Content-Length: ${body.length}\r\n\r\n`, "utf8");
  process.stdout.write(Buffer.concat([header, body]));
}
