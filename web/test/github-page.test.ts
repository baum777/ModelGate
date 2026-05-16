import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile GitHub uses the original workspace instead of mock review pages", () => {
  const appSource = readFileSync("web/src/App.tsx", "utf8");
  const shellSource = readFileSync("web/src/components/shell/ConsoleShell.tsx", "utf8");
  const topLevelImports = appSource
    .split("\n")
    .filter((line) => line.startsWith("import "));

  assert.ok(
    topLevelImports.every((line) => !line.includes("./pages/GitHubPage")),
    "GitHubPage must remain a lazy mobile route, not a top-level App import",
  );
  assert.doesNotMatch(appSource, /loadMobileGitHubPage/);
  assert.doesNotMatch(appSource, /MobileGitHubPage/);
  assert.doesNotMatch(appSource, /import\("\.\/pages\/GitHubPage\.js"\)/);
  assert.doesNotMatch(appSource, /github-mobile\.css/);
  assert.match(shellSource, /mode === "workbench" \? \(\s*<GitHubWorkspace/);
});
