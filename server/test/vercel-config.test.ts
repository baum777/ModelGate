import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

type VercelConfig = {
  functions?: Record<string, {
    maxDuration?: number;
    includeFiles?: string | string[];
  }>;
};

test("vercel config bundles runtime-loaded config files for both api entrypoints", () => {
  const vercelConfigPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8")) as VercelConfig;

  assert.equal(vercelConfig.functions?.["api/[...path].ts"]?.maxDuration, 60);
  assert.deepEqual(vercelConfig.functions?.["api/[...path].ts"]?.includeFiles, [
    "config/llm-router.yml",
    "config/model-capabilities.yml"
  ]);
  assert.equal(vercelConfig.functions?.["api/matrix/[...path].ts"]?.maxDuration, 60);
  assert.deepEqual(vercelConfig.functions?.["api/matrix/[...path].ts"]?.includeFiles, [
    "config/llm-router.yml",
    "config/model-capabilities.yml"
  ]);
});
