import assert from "node:assert/strict";
import { mkdtempSync, readFileSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createApp } from "../src/app.js";
import { appendMarkdownEntry, buildRouterDecisionMarkdown, redactSensitiveText } from "../src/lib/local-evidence-log.js";
import { createMockOpenRouterClient, createTestEnv } from "../test-support/helpers.js";

function createTempRoot() {
  return mkdtempSync(path.join(os.tmpdir(), "mosaicstacked-router-log-"));
}

test("redactSensitiveText redacts secrets and long token-like strings", () => {
  const redacted = redactSensitiveText([
    "Bearer sk-testsecretvalue",
    "Authorization: Bearer abcdefghijklmnopqrstuvwxyz1234567890",
    "sk-live-1234567890abcdef",
    "0123456789abcdef0123456789abcdef"
  ].join(" "));

  assert.doesNotMatch(redacted, /sk-testsecretvalue|sk-live-1234567890abcdef|abcdefghijklmnopqrstuvwxyz1234567890/);
  assert.doesNotMatch(redacted, /Authorization:\s*Bearer\s+[^[]+/i);
  assert.match(redacted, /\[REDACTED\]/);
});

test("buildRouterDecisionMarkdown omits raw prompts by default", () => {
  const markdown = buildRouterDecisionMarkdown({
    taskType: "coding",
    publicModelId: "default",
    providerModelId: "coding-primary:free",
    fallbackUsed: false,
    candidateCount: 2,
    reason: "matched_rule",
    result: "selected"
  });

  assert.match(markdown, /Prompt summary: omitted/);
  assert.match(markdown, /Selected public alias: default/);
  assert.match(markdown, /Selected provider model: coding-primary:free/);
});

test("appendMarkdownEntry appends rather than overwrites", async () => {
  const root = createTempRoot();
  const filePath = path.join(root, "logs", "ROUTER_DECISIONS.log.md");

  await appendMarkdownEntry(filePath, "### first\n- Result: selected\n");
  await appendMarkdownEntry(filePath, "### second\n- Result: selected\n");

  const content = readFileSync(filePath, "utf8");
  assert.match(content, /### first/);
  assert.match(content, /### second/);
  assert.equal((content.match(/### /g) ?? []).length, 2);
});

test("chat response includes bounded routing metadata without leaking provider targets", async (t) => {
  const env = createTestEnv({
    CHAT_MODEL: "google/gemma-4-31b-it:free"
  });
  const app = createApp({
    env,
    openRouter: createMockOpenRouterClient({
      createChatCompletion: async (_request, selection) => ({
        model: selection.publicModelAlias,
        text: "logged"
      })
    }),
    logger: false
  });

  t.after(async () => {
    await app.close();
  });

  const response = await app.inject({
    method: "POST",
    url: "/chat",
    payload: {
      task: "coding",
      messages: [
        {
          role: "user",
          content: "please implement this"
        }
      ]
    }
  });

  assert.equal(response.statusCode, 200);
  const payload = JSON.parse(response.body) as {
    ok: boolean;
    model: string;
    text: string;
    route: {
      selectedAlias: string;
      taskClass: string;
      fallbackUsed: boolean;
      degraded: boolean;
    };
  };
  assert.equal(payload.ok, true);
  assert.equal(payload.model, "default");
  assert.equal(payload.text, "logged");
  assert.equal(payload.route.selectedAlias, "default");
  assert.equal(payload.route.taskClass, "coding");
  assert.doesNotMatch(response.body, /google\/gemma-4-31b-it:free/);
});
