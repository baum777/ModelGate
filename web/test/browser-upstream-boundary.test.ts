import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const forbiddenBrowserNeedles = [
  "api.github.com",
  "github.com/repos",
  "/_matrix/client",
  "matrix.org/_matrix",
];

function collectSourceFiles(root: string): string[] {
  const entries = fs.readdirSync(root, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(root, entry.name);

    if (entry.isDirectory()) {
      return collectSourceFiles(fullPath);
    }

    return /\.(ts|tsx)$/.test(entry.name) ? [fullPath] : [];
  });
}

test("browser source never calls GitHub or Matrix upstreams directly", () => {
  const sourceRoot = fileURLToPath(new URL("../src/", import.meta.url));
  const offenders: string[] = [];

  for (const filePath of collectSourceFiles(sourceRoot)) {
    const source = fs.readFileSync(filePath, "utf8");

    for (const needle of forbiddenBrowserNeedles) {
      if (source.includes(needle)) {
        offenders.push(`${path.relative(sourceRoot, filePath)} contains ${needle}`);
      }
    }
  }

  assert.deepEqual(offenders, []);
});
