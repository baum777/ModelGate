import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../../server/src/app.js";
import { createMockOpenRouterClient, createTestEnv } from "../../server/test-support/helpers.js";

type RotationKeyConfig = {
  keyId: string;
  keyVersion: string;
  keyMaterial: string;
};

type LiveRotationConfig = {
  githubClientId: string;
  githubClientSecret: string;
  githubCallbackUrl: string;
  githubCodeVn: string;
  githubCodeVn1: string;
  keyVn: RotationKeyConfig;
  keyVn1: RotationKeyConfig;
  expectedLogin: string | null;
};

type LiveRotationConfigResult =
  | {
    state: "skipped";
    reason: "missing_required_env";
    missing: string[];
  }
  | {
    state: "ready";
    config: LiveRotationConfig;
  };

function parsePositiveIntStringOrDefault(raw: string, fallback: number) {
  const normalized = raw.trim();
  const parsed = Number.parseInt(normalized, 10);

  if (!Number.isFinite(parsed) || Number.isNaN(parsed) || parsed < 1) {
    return String(fallback);
  }

  return String(parsed);
}

function readSetCookie(response: { headers: Record<string, unknown> }) {
  const header = response.headers["set-cookie"];

  if (Array.isArray(header)) {
    return header[0] ?? null;
  }

  return typeof header === "string" ? header : null;
}

function readCookieValue(cookieHeader: string, key: string) {
  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${key}=`)) {
      continue;
    }

    return decodeURIComponent(trimmed.slice(key.length + 1));
  }

  return null;
}

function readGitHubStateFromAuthorizeLocation(location: string) {
  return new URL(location).searchParams.get("state");
}

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicstacked-live-integration-auth-rotation-"));
  return path.join(directory, "integration-auth-store.json");
}

function readLiveRotationConfig(sourceEnv: NodeJS.ProcessEnv = process.env): LiveRotationConfigResult {
  const env = sourceEnv;
  const missing: string[] = [];
  const liveEnabled = /^(1|true|yes|on)$/i.test(String(env.INTEGRATION_AUTH_ROTATION_LIVE_ENABLED ?? "").trim());
  const githubClientId = String(env.GITHUB_OAUTH_CLIENT_ID ?? "").trim();
  const githubClientSecret = String(env.GITHUB_OAUTH_CLIENT_SECRET ?? "").trim();
  const githubCallbackUrl = String(env.GITHUB_OAUTH_CALLBACK_URL ?? "").trim();
  const githubCodeVn = String(env.INTEGRATION_AUTH_ROTATION_LIVE_GITHUB_CODE_VN ?? "").trim();
  const githubCodeVn1 = String(env.INTEGRATION_AUTH_ROTATION_LIVE_GITHUB_CODE_VN1 ?? "").trim();
  const keyVnId = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_ID ?? "").trim();
  const keyVnMaterial = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_MATERIAL ?? "").trim();
  const keyVnVersion = parsePositiveIntStringOrDefault(String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_VERSION ?? "1"), 1);
  const keyVn1Id = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_ID ?? "").trim();
  const keyVn1Material = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_MATERIAL ?? "").trim();
  const keyVn1Version = parsePositiveIntStringOrDefault(String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_VERSION ?? "2"), 2);
  const expectedLoginRaw = String(env.INTEGRATION_AUTH_ROTATION_LIVE_EXPECTED_GITHUB_LOGIN ?? "").trim();
  const expectedLogin = expectedLoginRaw.length > 0 ? expectedLoginRaw : null;

  if (!liveEnabled) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_ENABLED=true");
  }

  if (githubClientId.length === 0) {
    missing.push("GITHUB_OAUTH_CLIENT_ID");
  }

  if (githubClientSecret.length === 0) {
    missing.push("GITHUB_OAUTH_CLIENT_SECRET");
  }

  if (githubCallbackUrl.length === 0) {
    missing.push("GITHUB_OAUTH_CALLBACK_URL");
  }

  if (githubCodeVn.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_GITHUB_CODE_VN");
  }

  if (githubCodeVn1.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_GITHUB_CODE_VN1");
  }

  if (keyVnId.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_ID");
  }

  if (keyVnMaterial.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_MATERIAL");
  }

  if (keyVn1Id.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_ID");
  }

  if (keyVn1Material.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_MATERIAL");
  }

  if (missing.length > 0) {
    return {
      state: "skipped",
      reason: "missing_required_env",
      missing
    };
  }

  return {
    state: "ready",
    config: {
      githubClientId,
      githubClientSecret,
      githubCallbackUrl,
      githubCodeVn,
      githubCodeVn1,
      keyVn: {
        keyId: keyVnId,
        keyVersion: keyVnVersion,
        keyMaterial: keyVnMaterial
      },
      keyVn1: {
        keyId: keyVn1Id,
        keyVersion: keyVn1Version,
        keyMaterial: keyVn1Material
      },
      expectedLogin
    }
  };
}

function createLiveEnv(storePath: string, liveConfig: LiveRotationConfig, stage: "vn" | "vn1") {
  const current = stage === "vn" ? liveConfig.keyVn : liveConfig.keyVn1;
  const previous = stage === "vn"
    ? ""
    : `${liveConfig.keyVn.keyId}@${liveConfig.keyVn.keyVersion}:${liveConfig.keyVn.keyMaterial}`;

  return createTestEnv({
    GITHUB_OAUTH_CLIENT_ID: liveConfig.githubClientId,
    GITHUB_OAUTH_CLIENT_SECRET: liveConfig.githubClientSecret,
    GITHUB_OAUTH_CALLBACK_URL: liveConfig.githubCallbackUrl,
    MOSAIC_STACK_SESSION_SECRET: "integration-auth-live-rotation-session-secret",
    INTEGRATION_AUTH_STORE_MODE: "file",
    INTEGRATION_AUTH_STORE_FILE_PATH: storePath,
    INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: current.keyId,
    INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: current.keyVersion,
    INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: current.keyMaterial,
    INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: previous
  });
}

function assertSnapshotKeyVersion(
  storePath: string,
  sessionId: string,
  expected: { keyId: string; keyVersion: number }
) {
  const snapshot = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
    credentials: Array<{
      sessionId: string;
      providers: {
        github?: {
          keyId: string;
          keyVersion: number;
        };
      };
    }>;
  };
  const githubEnvelope = snapshot.credentials
    .find((entry) => entry.sessionId === sessionId)
    ?.providers.github;

  assert.equal(githubEnvelope?.keyId, expected.keyId);
  assert.equal(githubEnvelope?.keyVersion, expected.keyVersion);
}

test("integration auth live smoke: github credential key rotation across restart", async (t) => {
  const configResult = readLiveRotationConfig();

  if (configResult.state === "skipped") {
    t.skip(`Integration auth live smoke skipped (${configResult.reason}): missing ${configResult.missing.join(", ")}`);
    return;
  }

  const liveConfig = configResult.config;
  const storePath = createTempStorePath();
  const appVn = createApp({
    env: createLiveEnv(storePath, liveConfig, "vn"),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });
  let appVnClosed = false;
  t.after(async () => {
    if (!appVnClosed) {
      await appVn.close();
      appVnClosed = true;
    }
  });

  const startVn = await appVn.inject({
    method: "GET",
    url: "/api/auth/github/start"
  });
  const sessionCookie = readSetCookie(startVn);
  const stateVn = readGitHubStateFromAuthorizeLocation(String(startVn.headers.location ?? ""));

  assert.equal(startVn.statusCode, 302);
  assert.ok(sessionCookie);
  assert.ok(stateVn);

  const callbackVn = await appVn.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateVn ?? "")}&code=${encodeURIComponent(liveConfig.githubCodeVn)}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(callbackVn.statusCode, 302);
  assert.equal(callbackVn.headers.location, "/console?mode=settings");

  const statusVn = await appVn.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const statusPayloadVn = JSON.parse(statusVn.body) as {
    github: {
      status: string;
      authState: string;
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };
  assert.equal(statusPayloadVn.github.status, "connected");
  assert.equal(statusPayloadVn.github.authState, "user_connected");
  assert.equal(statusPayloadVn.github.credentialSource, "user_connected");

  const sessionId = readCookieValue(sessionCookie ?? "", "mosaicstacked_integration_session");
  assert.ok(sessionId);
  assertSnapshotKeyVersion(storePath, sessionId ?? "", {
    keyId: liveConfig.keyVn.keyId,
    keyVersion: Number.parseInt(liveConfig.keyVn.keyVersion, 10)
  });

  await appVn.close();
  appVnClosed = true;

  const appVn1 = createApp({
    env: createLiveEnv(storePath, liveConfig, "vn1"),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });
  let appVn1Closed = false;
  t.after(async () => {
    if (!appVn1Closed) {
      await appVn1.close();
      appVn1Closed = true;
    }
  });
  const reverifyVn1BeforeWrite = await appVn1.inject({
    method: "POST",
    url: "/api/auth/github/reverify",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(reverifyVn1BeforeWrite.statusCode, 200);

  const startVn1 = await appVn1.inject({
    method: "GET",
    url: "/api/auth/github/start",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(startVn1.statusCode, 302);
  const stateVn1 = readGitHubStateFromAuthorizeLocation(String(startVn1.headers.location ?? ""));
  assert.ok(stateVn1);

  const callbackVn1 = await appVn1.inject({
    method: "GET",
    url: `/api/auth/github/callback?state=${encodeURIComponent(stateVn1 ?? "")}&code=${encodeURIComponent(liveConfig.githubCodeVn1)}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(callbackVn1.statusCode, 302);
  assert.equal(callbackVn1.headers.location, "/console?mode=settings");

  assertSnapshotKeyVersion(storePath, sessionId ?? "", {
    keyId: liveConfig.keyVn1.keyId,
    keyVersion: Number.parseInt(liveConfig.keyVn1.keyVersion, 10)
  });

  await appVn1.close();
  appVn1Closed = true;

  const appVn1Restart = createApp({
    env: createLiveEnv(storePath, liveConfig, "vn1"),
    openRouter: createMockOpenRouterClient(),
    logger: false
  });

  t.after(async () => {
    await appVn1Restart.close();
  });

  const reverifyVn1AfterRestart = await appVn1Restart.inject({
    method: "POST",
    url: "/api/auth/github/reverify",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(reverifyVn1AfterRestart.statusCode, 200);

  const finalStatus = await appVn1Restart.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const finalStatusPayload = JSON.parse(finalStatus.body) as {
    github: {
      status: string;
      authState: string;
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };

  assert.equal(finalStatusPayload.github.status, "connected");
  assert.equal(finalStatusPayload.github.authState, "user_connected");
  assert.equal(finalStatusPayload.github.credentialSource, "user_connected");

  if (liveConfig.expectedLogin) {
    assert.equal(finalStatusPayload.github.labels.identity, liveConfig.expectedLogin);
  }
});
