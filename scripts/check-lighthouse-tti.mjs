import { copyFileSync, existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { spawnSync } from "node:child_process";

const DEFAULT_CHROME_PATH = "/home/baum/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome";
const DEFAULT_URL = "http://127.0.0.1:3000/console?mode=chat";
const RUN_COUNT = Number.parseInt(process.env.LIGHTHOUSE_TTI_RUNS ?? "3", 10);
const TTI_BUDGET_MS = Number.parseInt(process.env.LIGHTHOUSE_TTI_BUDGET_MS ?? "2600", 10);
const TARGET_URL = process.env.LIGHTHOUSE_URL ?? DEFAULT_URL;
const FINAL_REPORT_PATH = process.env.LIGHTHOUSE_REPORT_PATH ?? "docs/lighthouse-report.json";

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function formatMs(value) {
  return `${Math.round(value)} ms`;
}

if (!Number.isInteger(RUN_COUNT) || RUN_COUNT < 1) {
  console.error(`FAIL invalid LIGHTHOUSE_TTI_RUNS: ${process.env.LIGHTHOUSE_TTI_RUNS}`);
  process.exit(1);
}

const chromePath = process.env.CHROME_PATH ?? (existsSync(DEFAULT_CHROME_PATH) ? DEFAULT_CHROME_PATH : undefined);
const workingDir = process.cwd();
const reportDir = mkdtempSync(join(tmpdir(), "mosaicstacked-lighthouse-"));
const runs = [];

try {
  for (let index = 0; index < RUN_COUNT; index += 1) {
    const reportPath = join(reportDir, `lighthouse-${index + 1}.json`);
    const args = [
      "lighthouse",
      TARGET_URL,
      "--preset=perf",
      "--form-factor=mobile",
      "--throttling-method=devtools",
      "--throttling.cpuSlowdownMultiplier=4",
      "--chrome-flags=--no-sandbox --disable-gpu --headless=new --disable-dev-shm-usage",
      "--only-categories=performance,accessibility",
      "--output=json",
      `--output-path=${reportPath}`,
    ];

    const result = spawnSync("npx", args, {
      cwd: workingDir,
      env: {
        ...process.env,
        ...(chromePath ? { CHROME_PATH: chromePath } : {}),
      },
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });

    if (result.status !== 0) {
      process.stderr.write(result.stdout);
      process.stderr.write(result.stderr);
      console.error(`FAIL Lighthouse run ${index + 1}/${RUN_COUNT} exited with ${result.status}`);
      process.exit(result.status ?? 1);
    }

    const report = JSON.parse(readFileSync(reportPath, "utf8"));
    const tti = report.audits?.interactive?.numericValue;
    const performance = report.categories?.performance?.score;
    const accessibility = report.categories?.accessibility?.score;

    if (typeof tti !== "number") {
      console.error(`FAIL Lighthouse run ${index + 1}/${RUN_COUNT} did not include audits.interactive.numericValue`);
      process.exit(1);
    }

    runs.push({
      index: index + 1,
      reportPath,
      tti,
      performance: typeof performance === "number" ? Math.round(performance * 100) : null,
      accessibility: typeof accessibility === "number" ? Math.round(accessibility * 100) : null,
    });

    console.log(
      `RUN ${index + 1}/${RUN_COUNT} TTI ${formatMs(tti)} | performance ${runs.at(-1).performance ?? "n/a"} | accessibility ${runs.at(-1).accessibility ?? "n/a"}`,
    );
  }

  const medianTti = median(runs.map((run) => run.tti));
  const medianRun = runs.find((run) => run.tti === medianTti) ?? runs[0];
  copyFileSync(medianRun.reportPath, FINAL_REPORT_PATH);

  const pass = medianTti <= TTI_BUDGET_MS;
  console.log(`MEDIAN TTI ${formatMs(medianTti)} / budget ${formatMs(TTI_BUDGET_MS)} => ${pass ? "PASS" : "FAIL"}`);

  if (!pass) {
    process.exit(1);
  }
} finally {
  rmSync(reportDir, { recursive: true, force: true });
}
