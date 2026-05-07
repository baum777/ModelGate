import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const assetsDir = join(process.cwd(), "web", "dist", "assets");

const budgets = [
  { label: "vendor bundle", pattern: /^vendor-.*\.js$/, maxBytes: 320 * 1024 },
  { label: "app shell bundle", pattern: /^index-.*\.js$/, maxBytes: 140 * 1024 },
  { label: "matrix workspace bundle", pattern: /^MatrixWorkspace-.*\.js$/, maxBytes: 60 * 1024 },
  { label: "github workspace bundle", pattern: /^GitHubWorkspace-.*\.js$/, maxBytes: 35 * 1024 },
  { label: "chat workspace bundle", pattern: /^ChatWorkspace-.*\.js$/, maxBytes: 25 * 1024 },
  { label: "main css bundle", pattern: /^index-.*\.css$/, maxBytes: 100 * 1024 },
];

function formatKiB(bytes) {
  return `${(bytes / 1024).toFixed(2)} KiB`;
}

const assetFiles = readdirSync(assetsDir);
let hasFailure = false;

for (const budget of budgets) {
  const matched = assetFiles.find((file) => budget.pattern.test(file));

  if (!matched) {
    hasFailure = true;
    console.error(`MISSING: ${budget.label} (${budget.pattern})`);
    continue;
  }

  const absolutePath = join(assetsDir, matched);
  const size = statSync(absolutePath).size;
  const withinBudget = size <= budget.maxBytes;
  const status = withinBudget ? "OK" : "FAIL";

  if (!withinBudget) {
    hasFailure = true;
  }

  console.log(
    `${status} ${budget.label}: ${matched} ${formatKiB(size)} / budget ${formatKiB(budget.maxBytes)}`,
  );
}

if (hasFailure) {
  process.exit(1);
}

