import { createServer } from "node:net";

const DEFAULT_HOST = "127.0.0.1";
const DEFAULT_PORT = 4173;
const DEFAULT_FALLBACK_COUNT = 5;

function readFirstEnv(names, sourceEnv = process.env) {
  for (const name of names) {
    const value = sourceEnv[name];

    if (typeof value === "string" && value.trim().length > 0) {
      return value.trim();
    }
  }

  return null;
}

function parsePort(value) {
  const parsed = Number.parseInt(String(value).trim(), 10);

  if (!Number.isInteger(parsed) || parsed < 1 || parsed > 65535) {
    return null;
  }

  return parsed;
}

function parsePortList(value) {
  if (typeof value !== "string" || value.trim().length === 0) {
    return [];
  }

  return [...new Set(
    value
      .split(",")
      .map(parsePort)
      .filter((port) => port !== null)
  )];
}

export function resolvePreviewHost(sourceEnv = process.env) {
  return readFirstEnv([
    "MOSAICSTACK_BROWSER_HOST",
    "BROWSER_PREVIEW_HOST",
    "HOST"
  ], sourceEnv) ?? DEFAULT_HOST;
}

export function resolvePreviewPortCandidates(sourceEnv = process.env) {
  const configuredPorts = parsePortList(sourceEnv.MOSAICSTACK_BROWSER_PORTS);

  if (configuredPorts.length > 0) {
    return configuredPorts;
  }

  const explicitPort = readFirstEnv([
    "MOSAICSTACK_BROWSER_PORT",
    "BROWSER_PREVIEW_PORT",
    "PORT"
  ], sourceEnv);
  const preferredPort = parsePort(explicitPort ?? DEFAULT_PORT) ?? DEFAULT_PORT;

  if (explicitPort) {
    return [preferredPort];
  }

  return Array.from({ length: DEFAULT_FALLBACK_COUNT }, (_value, index) => preferredPort + index)
    .filter((port) => port <= 65535);
}

export function previewUrl(host, port) {
  return `http://${host}:${port}`;
}

export async function canBind(host, port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", (error) => {
      resolve({
        ok: false,
        code: error && typeof error === "object" && "code" in error ? String(error.code) : "UNKNOWN",
        message: error instanceof Error ? error.message : String(error)
      });
    });

    server.listen({ host, port }, () => {
      server.close(() => {
        resolve({ ok: true });
      });
    });
  });
}

export async function selectPreviewEndpoint(sourceEnv = process.env) {
  const host = resolvePreviewHost(sourceEnv);
  const candidates = resolvePreviewPortCandidates(sourceEnv);
  const attempts = [];

  for (const port of candidates) {
    const bind = await canBind(host, port);

    if (bind.ok) {
      return {
        ok: true,
        host,
        port,
        url: previewUrl(host, port),
        attempts
      };
    }

    attempts.push({
      host,
      port,
      code: bind.code,
      message: bind.message
    });
  }

  return {
    ok: false,
    host,
    candidates,
    attempts
  };
}

export function formatPreviewBindFailure(result) {
  const attempts = result.attempts.length > 0
    ? result.attempts
      .map((attempt) => `- ${attempt.host}:${attempt.port} ${attempt.code}: ${attempt.message}`)
      .join("\n")
    : "- no valid port candidates";

  return [
    "Unable to start browser preview server: no bindable host/port candidate.",
    `Host: ${result.host}`,
    `Ports: ${result.candidates.join(", ") || "none"}`,
    "Attempts:",
    attempts,
    "Set MOSAICSTACK_BROWSER_HOST and MOSAICSTACK_BROWSER_PORT, or MOSAICSTACK_BROWSER_PORTS, to override."
  ].join("\n");
}
