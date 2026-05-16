import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

test("mobile Matrix uses the original workspace instead of mock knowledge pages", () => {
  const appSource = readFileSync("web/src/App.tsx", "utf8");
  const shellSource = readFileSync("web/src/components/shell/ConsoleShell.tsx", "utf8");
  const topLevelImports = appSource
    .split("\n")
    .filter((line) => line.startsWith("import "));

  assert.ok(
    topLevelImports.every((line) => !line.includes("./pages/MatrixPage")),
    "MatrixPage must remain a lazy mobile route, not a top-level App import",
  );
  assert.doesNotMatch(appSource, /loadMobileMatrixPage/);
  assert.doesNotMatch(appSource, /MobileMatrixPage/);
  assert.doesNotMatch(appSource, /import\("\.\/pages\/MatrixPage\.js"\)/);
  assert.doesNotMatch(appSource, /matrix-mobile\.css/);
  assert.match(shellSource, /mode === "matrix" \? \(\s*<MatrixWorkspace/);
});
