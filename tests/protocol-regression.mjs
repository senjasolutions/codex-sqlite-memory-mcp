import assert from "node:assert/strict";
import path from "node:path";
import { resetSqliteFiles, spawnRawServer, startSdkClient } from "./helpers/server-test-utils.mjs";

const rawDbPath = path.resolve(process.cwd(), "tmp/protocol-regression.sqlite");
const sdkDbPath = path.resolve(process.cwd(), "tmp/protocol-sdk.sqlite");

resetSqliteFiles(rawDbPath);
resetSqliteFiles(sdkDbPath);

const rawServer = spawnRawServer({ dbPath: rawDbPath, debug: true });

try {
  rawServer.sendRaw("not valid json\n");

  rawServer.sendJson({
    jsonrpc: "2.0",
    id: 1,
    method: "initialize",
    params: {
      protocolVersion: "2025-03-26",
      capabilities: {},
      clientInfo: { name: "raw-probe", version: "1.0.0" },
    },
  });

  const initializeResponse = await rawServer.readJson();
  assert.equal(initializeResponse.id, 1);
  assert.equal(initializeResponse.result.serverInfo.name, "codex-sqlite-memory-mcp");

  rawServer.sendJson({
    jsonrpc: "2.0",
    method: "notifications/initialized",
  });

  rawServer.sendJson({
    jsonrpc: "2.0",
    method: "notifications/custom_ignored",
    params: { probe: true },
  });

  rawServer.sendJson({
    jsonrpc: "2.0",
    id: 2,
    method: "bogus/method",
    params: {},
  });

  const unsupportedResponse = await rawServer.readJson();
  assert.equal(unsupportedResponse.id, 2);
  assert.equal(unsupportedResponse.error.code, -32601);
  assert.match(unsupportedResponse.error.message, /Unsupported method: bogus\/method/);

  const stderr = rawServer.getStderr();
  assert.match(stderr, /protocol-error|transport-error/);
  assert.match(stderr, /ignored-notification/);
  assert.match(stderr, /unsupported-request/);
} finally {
  await rawServer.close();
}

const { client, close } = await startSdkClient({ dbPath: sdkDbPath });

try {
  const seeded = await client.callTool({
    name: "upsert_memory",
    arguments: {
      memory_key: "protocol.lookup",
      scope: "task",
      project: "protocol-regression",
      kind: "checkpoint",
      content: "Protocol lookup seed.",
      tags: ["protocol", "lookup"],
      source: "protocol regression",
      confidence: 1,
    },
  });

  assert.equal(seeded.isError, undefined);

  const missingArgResult = await client.callTool({
    name: "save_memory",
    arguments: {
      kind: "fact",
      content: "Missing required scope should fail.",
    },
  });

  assert.equal(missingArgResult.isError, true);
  assert.match(
    missingArgResult.content[0].text,
    /Input validation error|Invalid arguments|required/i,
  );

  const invalidArchiveResult = await client.callTool({
    name: "archive_memory",
    arguments: {},
  });

  assert.equal(invalidArchiveResult.isError, true);
  assert.match(
    invalidArchiveResult.content[0].text,
    /Input validation error|Invalid arguments|required/i,
  );

  const foundByKey = await client.callTool({
    name: "get_memory_by_key",
    arguments: {
      memory_key: "protocol.lookup",
    },
  });

  assert.equal(foundByKey.isError, undefined);
  assert.equal(foundByKey.structuredContent.found, true);
  assert.equal(foundByKey.structuredContent.memory.memory_key, "protocol.lookup");

  const listed = await client.callTool({
    name: "list_memories",
    arguments: {
      project: "protocol-regression",
      kind: "checkpoint",
      archived: false,
      limit: 10,
    },
  });

  assert.equal(listed.isError, undefined);
  assert.equal(listed.structuredContent.memories.length, 1);
  assert.equal(listed.structuredContent.memories[0].memory_key, "protocol.lookup");

  const missingByKey = await client.callTool({
    name: "get_memory_by_key",
    arguments: {
      memory_key: "protocol.missing",
    },
  });

  assert.equal(missingByKey.isError, undefined);
  assert.equal(missingByKey.structuredContent.found, false);
  assert.equal(missingByKey.structuredContent.memory, null);

  const blockedDelete = await client.callTool({
    name: "delete_memory",
    arguments: {
      memory_key: "protocol.lookup",
      confirm: false,
    },
  });

  assert.equal(blockedDelete.isError, true);
  assert.match(blockedDelete.content[0].text, /confirm=true/i);

  const deleted = await client.callTool({
    name: "delete_memory",
    arguments: {
      memory_key: "protocol.lookup",
      confirm: true,
    },
  });

  assert.equal(deleted.isError, undefined);
  assert.equal(deleted.structuredContent.deleted, true);
  assert.equal(deleted.structuredContent.memory.memory_key, "protocol.lookup");

  const afterDelete = await client.callTool({
    name: "get_memory_by_key",
    arguments: {
      memory_key: "protocol.lookup",
    },
  });

  assert.equal(afterDelete.isError, undefined);
  assert.equal(afterDelete.structuredContent.found, false);
} finally {
  await close();
}

console.log(
  JSON.stringify(
    {
      ok: true,
      verified: [
        "malformed_json_does_not_crash_server",
        "unsupported_method_returns_structured_error",
        "custom_notifications_are_ignored",
        "missing_required_tool_args_fail_readably",
        "get_memory_by_key_returns_seeded_record",
        "get_memory_by_key_handles_missing_keys_cleanly",
        "list_memories_filters_results",
        "delete_memory_blocks_without_confirmation",
        "delete_memory_removes_record",
      ],
    },
    null,
    2,
  ),
);
