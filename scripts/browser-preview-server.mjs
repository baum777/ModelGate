import { existsSync } from "node:fs";
import { spawn, spawnSync } from "node:child_process";
import { formatPreviewBindFailure, selectPreviewEndpoint } from "./browser-preview-runtime.mjs";

const endpoint = await selectPreviewEndpoint();

if (!endpoint.ok) {
  console.error(formatPreviewBindFailure(endpoint));
  process.exit(1);
}

const { host, port, url: baseUrl } = endpoint;
const nodeCommand = process.execPath;
const npmExecPath = typeof process.env.npm_execpath === "string" && existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : null;
const npmCommandFromPath = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  MOSAICSTACK_BROWSER_HOST: host,
  MOSAICSTACK_BROWSER_PORT: String(port),
  VITE_API_BASE_URL: baseUrl
};

function runNpmSync(args) {
  const npmArgs = ["--global=false", ...args];

  if (npmExecPath) {
    return spawnSync(nodeCommand, [npmExecPath, ...npmArgs], {
      env,
      stdio: "inherit"
    });
  }

  return spawnSync(npmCommandFromPath, npmArgs, {
    env,
    stdio: "inherit"
  });
}

function spawnNpm(args) {
  const npmArgs = ["--global=false", ...args];

  if (npmExecPath) {
    return spawn(nodeCommand, [npmExecPath, ...npmArgs], {
      env,
      stdio: "inherit"
    });
  }

  return spawn(npmCommandFromPath, npmArgs, {
    env,
    stdio: "inherit"
  });
}

const buildResult = runNpmSync(["run", "build:web"]);

if (buildResult.error) {
  throw buildResult.error;
}

if (buildResult.status !== 0) {
  process.exit(buildResult.status ?? 1);
}

const preview = spawnNpm(["run", "preview", "--workspace", "web", "--", "--host", host, "--port", port, "--strictPort"]);

const stop = (signal) => {
  if (!preview.killed) {
    preview.kill(signal);
  }
};

process.on("SIGINT", () => stop("SIGINT"));
process.on("SIGTERM", () => stop("SIGTERM"));
preview.on("error", () => {
  process.exit(1);
});

preview.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
