#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = resolve(repoRoot, ".env");
const defaultBackendHost = "127.0.0.1";
const defaultBackendPort = "8787";

function parseEnvFile(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadRootEnv() {
  if (!existsSync(rootEnvPath)) {
    return {};
  }

  return parseEnvFile(readFileSync(rootEnvPath, "utf8"));
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function normalizeHost(value) {
  const host = String(value ?? "").trim();

  if (!host || host === "0.0.0.0" || host === "::") {
    return defaultBackendHost;
  }

  return host;
}

function normalizePort(value) {
  const port = String(value ?? "").trim();

  return port || defaultBackendPort;
}

function normalizeBackendBaseUrl(env) {
  return `http://${normalizeHost(env.HOST)}:${normalizePort(env.PORT)}`;
}

function parseRepo(value) {
  const repo = String(value ?? "").trim();
  const [owner, name, extra] = repo.split("/");

  if (!owner || !name || extra) {
    return null;
  }

  return { owner, repo: name, fullName: `${owner}/${name}` };
}

function readGitHubSmokeConfig(sourceEnv = process.env, options = {}) {
  const fileEnv = options.loadRootEnvFile === false ? {} : loadRootEnv();
  const env = {
    ...fileEnv,
    ...sourceEnv
  };
  const missing = [];
  const enabled = truthy(env.GITHUB_SMOKE_ENABLED);
  const repo = parseRepo(env.GITHUB_SMOKE_REPO);
  const baseBranch = String(env.GITHUB_SMOKE_BASE_BRANCH ?? "").trim();
  const targetBranch = String(env.GITHUB_SMOKE_TARGET_BRANCH ?? "").trim();
  const token = String(env.GITHUB_TOKEN ?? "").trim();
  const allowedRepos = String(env.GITHUB_ALLOWED_REPOS ?? "").trim();
  const agentApiKey = String(env.GITHUB_AGENT_API_KEY ?? "").trim();

  if (!enabled) {
    missing.push("GITHUB_SMOKE_ENABLED=true");
  }
  if (!repo) {
    missing.push("GITHUB_SMOKE_REPO=owner/repo");
  }
  if (!baseBranch) {
    missing.push("GITHUB_SMOKE_BASE_BRANCH");
  }
  if (!targetBranch) {
    missing.push("GITHUB_SMOKE_TARGET_BRANCH");
  }
  if (!token) {
    missing.push("GITHUB_TOKEN");
  }
  if (!allowedRepos) {
    missing.push("GITHUB_ALLOWED_REPOS");
  }
  if (!agentApiKey) {
    missing.push("GITHUB_AGENT_API_KEY");
  }

  if (missing.length > 0) {
    return {
      state: "skipped",
      reason: `missing ${missing.join(", ")}`,
      missing
    };
  }

  return {
    state: "ready",
    config: {
      backendBaseUrl: normalizeBackendBaseUrl(env),
      repo,
      baseBranch,
      targetBranch,
      agentApiKey,
      intent: "create or update docs/mosaicstack-smoke.md with a harmless timestamp"
    }
  };
}

async function requestJson(fetchImpl, backendBaseUrl, path, init = {}) {
  let response;

  try {
    response = await fetchImpl(`${backendBaseUrl}${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(init.body ? { "Content-Type": "application/json" } : {}),
        ...(init.headers ?? {})
      }
    });
  } catch {
    return {
      ok: false,
      error: {
        code: "smoke_backend_unreachable",
        message: "fetch failed"
      }
    };
  }

  let payload = null;

  try {
    payload = await response.json();
  } catch {
    return {
      ok: false,
      error: {
        code: "smoke_backend_error",
        message: "Backend returned non-JSON smoke response",
        status: response.status
      }
    };
  }

  if (!response.ok || payload?.ok === false) {
    return {
      ok: false,
      error: {
        code: typeof payload?.error?.code === "string" ? payload.error.code : "smoke_backend_error",
        message: typeof payload?.error?.message === "string" ? payload.error.message : "Backend smoke route failed",
        status: response.status
      }
    };
  }

  return { ok: true, payload };
}

function createSmokeError(code, message, phase, details = {}) {
  return {
    ok: false,
    status: "failed",
    phase,
    error: {
      code,
      message
    },
    ...details
  };
}

export async function runGitHubSmoke(options = {}) {
  const configResult = readGitHubSmokeConfig(options.env ?? process.env, {
    loadRootEnvFile: options.loadRootEnvFile
  });

  if (configResult.state === "skipped") {
    return {
      ok: true,
      status: "skipped",
      reason: configResult.reason,
      missing: configResult.missing
    };
  }

  const { backendBaseUrl, repo, baseBranch, targetBranch, agentApiKey, intent } = configResult.config;
  const fetchImpl = options.fetchImpl ?? fetch;

  const proposal = await requestJson(fetchImpl, backendBaseUrl, "/api/github/actions/propose", {
    method: "POST",
    body: JSON.stringify({
      repo: {
        owner: repo.owner,
        repo: repo.repo
      },
      objective: "Smoke the GitHub proposal, execute, and verify flow",
      baseBranch,
      targetBranch,
      mode: "smoke",
      intent
    })
  });

  if (!proposal.ok) {
    return createSmokeError(proposal.error.code, proposal.error.message, "propose", {
      backendBaseUrl,
      repo: repo.fullName
    });
  }

  const planId = proposal.payload?.plan?.planId;

  if (typeof planId !== "string" || planId.trim().length === 0) {
    return createSmokeError("smoke_backend_error", "Backend returned an invalid GitHub smoke plan", "propose", {
      backendBaseUrl,
      repo: repo.fullName
    });
  }

  const execute = await requestJson(fetchImpl, backendBaseUrl, `/api/github/actions/${encodeURIComponent(planId)}/execute`, {
    method: "POST",
    headers: {
      "X-MosaicStack-Admin-Key": agentApiKey
    },
    body: JSON.stringify({
      approval: true
    })
  });

  if (!execute.ok) {
    return createSmokeError(execute.error.code, execute.error.message, "execute", {
      backendBaseUrl,
      repo: repo.fullName,
      planId
    });
  }

  const verify = await requestJson(fetchImpl, backendBaseUrl, `/api/github/actions/${encodeURIComponent(planId)}/verify`);

  if (!verify.ok) {
    return createSmokeError(verify.error.code, verify.error.message, "verify", {
      backendBaseUrl,
      repo: repo.fullName,
      planId
    });
  }

  const verificationStatus = verify.payload?.verification?.status;

  if (verificationStatus !== "verified") {
    return createSmokeError("github_smoke_unverified", "GitHub smoke verification did not return verified", "verify", {
      backendBaseUrl,
      repo: repo.fullName,
      planId,
      verificationStatus
    });
  }

  return {
    ok: true,
    status: "passed",
    backendBaseUrl,
    repo: repo.fullName,
    planId,
    branchName: execute.payload?.result?.branchName ?? null,
    prUrl: execute.payload?.result?.prUrl ?? null,
    verificationStatus
  };
}

export function formatGitHubSmokeResult(result) {
  return JSON.stringify(result, null, 2);
}

async function main() {
  const result = await runGitHubSmoke();
  const isSkipped = result.ok && result.status === "skipped";

  console.log(formatGitHubSmokeResult(result));
  process.exitCode = result.ok || isSkipped ? 0 : 1;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown smoke failure";

    console.error(formatGitHubSmokeResult({
      ok: false,
      status: "failed",
      phase: "main",
      error: {
        code: "smoke_unhandled_error",
        message
      }
    }));
    process.exitCode = 1;
  });
}
