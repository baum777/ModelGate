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
  rewrites?: Array<{
    source: string;
    destination: string;
  }>;
};

function assertIncludeFiles(entry: string | string[] | undefined) {
  assert.ok(entry, "includeFiles must be configured");

  if (Array.isArray(entry)) {
    assert.deepEqual(entry, [
      "config/llm-router.yml",
      "config/model-capabilities.yml"
    ]);
    return;
  }

  assert.equal(entry, "config/*.yml");
}

test("vercel config bundles runtime-loaded config files for both api entrypoints", () => {
  const vercelConfigPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8")) as VercelConfig;

  assert.equal(vercelConfig.functions?.["api/[...path].ts"]?.maxDuration, 60);
  assertIncludeFiles(vercelConfig.functions?.["api/[...path].ts"]?.includeFiles);
  assert.equal(vercelConfig.functions?.["api/matrix/[...path].ts"]?.maxDuration, 60);
  assertIncludeFiles(vercelConfig.functions?.["api/matrix/[...path].ts"]?.includeFiles);
});

test("vercel config keeps governed GitHub and Matrix API routes on backend adapters", () => {
  const vercelConfigPath = fileURLToPath(new URL("../../vercel.json", import.meta.url));
  const vercelConfig = JSON.parse(fs.readFileSync(vercelConfigPath, "utf8")) as VercelConfig;
  const rewrites = new Map((vercelConfig.rewrites ?? []).map((rewrite) => [rewrite.source, rewrite.destination]));

  assert.equal(rewrites.get("/api/github/:path*"), "/api/[...path]?path=:path*");
  assert.equal(rewrites.get("/api/matrix/:path*"), "/api/matrix/[...path]?path=:path*");
  assert.equal(rewrites.get("/:path*"), "/");
});
