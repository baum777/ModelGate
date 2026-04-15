import { existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { spawn, spawnSync } from "node:child_process";

const host = "127.0.0.1";
const port = "4173";
const baseUrl = `http://${host}:${port}`;
const nodeCommand = process.execPath;
const npmCli = join(dirname(nodeCommand), "node_modules", "npm", "bin", "npm-cli.js");
const env = {
  ...process.env,
  VITE_API_BASE_URL: baseUrl
};

if (!existsSync(npmCli)) {
  throw new Error(`Unable to locate npm-cli.js at ${npmCli}`);
}

const buildResult = spawnSync(nodeCommand, [npmCli, "run", "build:web"], {
  env,
  stdio: "inherit"
});

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const preview = spawn(
  nodeCommand,
  [npmCli, "run", "preview", "--workspace", "web", "--", "--host", host, "--port", port, "--strictPort"],
  {
    env,
    stdio: "inherit"
  }
);

const stop = (signal) => {
  if (!preview.killed) {
    preview.kill(signal);
  }
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));

preview.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
