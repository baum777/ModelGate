import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import path from "node:path";
import test from "node:test";

test("env parsing fails closed when the OpenRouter key is missing", () => {
  const moduleUrl = new URL("../src/lib/env.ts", import.meta.url);
  const result = spawnSync(
    process.execPath,
    [
      "--import",
      "tsx",
      "--eval",
      `import(${JSON.stringify(moduleUrl.href)}).catch((error) => {
        console.error(error.message);
        process.exit(1);
      });`
    ],
    {
      cwd: path.dirname(fileURLToPath(new URL("../package.json", import.meta.url))),
      env: {
        ...process.env,
        OPENROUTER_API_KEY: "",
        OPENROUTER_BASE_URL: "https://openrouter.ai/api/v1",
        PORT: "8787",
        HOST: "127.0.0.1",
        OPENROUTER_MODEL: "openrouter/auto",
        OPENROUTER_MODELS: "openrouter/auto",
        APP_NAME: "modelgate-test",
        DEFAULT_SYSTEM_PROMPT: "prompt",
        CORS_ORIGINS: "http://localhost:5173"
      },
      encoding: "utf8"
    }
  );

  assert.notEqual(result.status, 0);
  assert.match(result.stderr, /OPENROUTER_API_KEY is required|Required/);
});
