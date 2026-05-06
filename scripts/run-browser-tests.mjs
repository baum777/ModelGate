import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { formatPreviewBindFailure, selectPreviewEndpoint } from "./browser-preview-runtime.mjs";

const endpoint = await selectPreviewEndpoint();

if (!endpoint.ok) {
  console.error(formatPreviewBindFailure(endpoint));
  process.exit(1);
}

const npmExecPath = typeof process.env.npm_execpath === "string" && existsSync(process.env.npm_execpath)
  ? process.env.npm_execpath
  : null;
const nodeCommand = process.execPath;
const npmCommandFromPath = process.platform === "win32" ? "npm.cmd" : "npm";
const env = {
  ...process.env,
  MOSAICSTACK_BROWSER_HOST: endpoint.host,
  MOSAICSTACK_BROWSER_PORT: String(endpoint.port),
  MOSAICSTACK_BROWSER_PORTS: String(endpoint.port),
  VITE_API_BASE_URL: endpoint.url
};
const args = ["exec", "playwright", "test", ...process.argv.slice(2)];
const child = npmExecPath
  ? spawn(nodeCommand, [npmExecPath, ...args], { env, stdio: "inherit" })
  : spawn(npmCommandFromPath, args, { env, stdio: "inherit" });

child.on("error", (error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});

child.on("exit", (code, signal) => {
  process.exit(signal ? 1 : (code ?? 0));
});
