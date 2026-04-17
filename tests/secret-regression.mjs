import assert from "node:assert/strict";
import path from "node:path";
import { MemoryStore } from "../src/lib/store.mjs";
import { resetSqliteFiles } from "./helpers/server-test-utils.mjs";

const dbPath = path.resolve(process.cwd(), "tmp/secret-regression.sqlite");
resetSqliteFiles(dbPath);

const store = new MemoryStore({ dbPath });

const blockedExamples = [
  "password=supersecret123",
  "api_key: 1234567890abcdef1234567890abcdef",
  "Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.payloadsignature",
  ["sk", "-proj-", "AbCdEfGhIjKlMnOpQrStUvWx"].join(""),
  ["gh", "p_", "1234567890abcdefghijklmnopqrstuvwxyzABCD"].join(""),
  ["github", "_pat_", "1234567890_abcdefghijklmnopqrstuvwxyzABCDE"].join(""),
  ["xox", "b-", "123456789012-abcdefghijklmnopqrstuv"].join(""),
  ["sk", "_live_", "1234567890abcdefghijklmnop"].join(""),
  ["AIza", "SyA123456789012345678901234567890123"].join(""),
  "-----BEGIN PRIVATE KEY-----\nabc\n-----END PRIVATE KEY-----",
];

for (const content of blockedExamples) {
  assert.throws(
    () =>
      store.saveMemory({
        scope: "task",
        project: "secret-regression",
        kind: "fact",
        content,
        tags: ["secret", "blocked"],
        source: "secret regression",
      }),
    /probable secret-bearing content/,
    `Expected blocked secret example to be rejected: ${content}`,
  );
}

const allowedExamples = [
  "This document explains password reset flow and token rotation policy.",
  "Use the format ghp_xxx only as an example placeholder in documentation.",
  "Discuss Bearer token handling conceptually without including a real token value.",
  "Store the fact that Stripe keys should never be committed.",
  "OpenAI keys often begin with sk-, but this text is only instructional.",
];

for (const content of allowedExamples) {
  const memory = store.saveMemory({
    scope: "task",
    project: "secret-regression",
    kind: "summary",
    content,
    tags: ["allowed"],
    source: "secret regression",
  });
  assert.equal(typeof memory.id, "number");
}

const likelyFalsePositiveBoundary = store.saveMemory({
  scope: "task",
  project: "secret-regression",
  kind: "summary",
  content: "Security review note: password fields must be hashed and bearer tokens must expire quickly.",
  tags: ["boundary", "allowed"],
  source: "secret regression",
});
assert.equal(typeof likelyFalsePositiveBoundary.id, "number");

const likelyFalseNegativeBoundary = store.saveMemory({
  scope: "task",
  project: "secret-regression",
  kind: "summary",
  content: "Potential secret split across text: api key is abcde + 12345 and may evade pattern matching.",
  tags: ["boundary", "known-limitation"],
  source: "secret regression",
});
assert.equal(typeof likelyFalseNegativeBoundary.id, "number");

store.close();

console.log(
  JSON.stringify(
    {
      ok: true,
      verified: [
        "blocked_common_secret_formats",
        "allowed_technical_text",
        "likely_false_positive_boundary_allowed",
        "likely_false_negative_boundary_documented",
      ],
    },
    null,
    2,
  ),
);
