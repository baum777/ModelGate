import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createApp } from "../../server/src/app.js";
import { createIntegrationAuthStore } from "../../server/src/lib/integration-auth-store.js";
import { createMockOpenRouterClient, createTestEnv, createTestMatrixConfig } from "../../server/test-support/helpers.js";

type RotationKeyConfig = {
  keyId: string;
  keyVersion: string;
  keyMaterial: string;
};

type MatrixLiveRotationConfig = {
  matrixBaseUrl: string;
  matrixLoginTokenType: string;
  matrixLoginTokenVn: string;
  matrixLoginTokenVn1: string;
  expectedUserId: string | null;
  keyVn: RotationKeyConfig;
  keyVn1: RotationKeyConfig;
};

type MatrixLiveRotationConfigResult =
  | {
    state: "skipped";
    reason: "missing_required_env";
    missing: string[];
  }
  | {
    state: "ready";
    config: MatrixLiveRotationConfig;
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

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicstacked-live-integration-auth-matrix-rotation-"));
  return path.join(directory, "integration-auth-store.json");
}

function readMatrixLiveRotationConfig(sourceEnv: NodeJS.ProcessEnv = process.env): MatrixLiveRotationConfigResult {
  const env = sourceEnv;
  const missing: string[] = [];
  const liveEnabled = /^(1|true|yes|on)$/i.test(String(env.INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_ENABLED ?? "").trim());
  const matrixBaseUrl = String(env.MATRIX_BASE_URL ?? env.MATRIX_HOMESERVER_URL ?? "").trim();
  const matrixLoginTokenType = String(env.MATRIX_LOGIN_TOKEN_TYPE ?? "m.login.token").trim() || "m.login.token";
  const matrixLoginTokenVn = String(env.INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_LOGIN_TOKEN_VN ?? "").trim();
  const matrixLoginTokenVn1 = String(env.INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_LOGIN_TOKEN_VN1 ?? "").trim();
  const expectedUserIdRaw = String(env.INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_EXPECTED_USER_ID ?? "").trim();
  const expectedUserId = expectedUserIdRaw.length > 0 ? expectedUserIdRaw : null;
  const keyVnId = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_ID ?? "").trim();
  const keyVnMaterial = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_MATERIAL ?? "").trim();
  const keyVnVersion = parsePositiveIntStringOrDefault(String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_VERSION ?? "1"), 1);
  const keyVn1Id = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_ID ?? "").trim();
  const keyVn1Material = String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_MATERIAL ?? "").trim();
  const keyVn1Version = parsePositiveIntStringOrDefault(String(env.INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_VERSION ?? "2"), 2);

  if (!liveEnabled) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_ENABLED=true");
  }

  if (matrixBaseUrl.length === 0) {
    missing.push("MATRIX_BASE_URL or MATRIX_HOMESERVER_URL");
  }

  if (matrixLoginTokenVn.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_LOGIN_TOKEN_VN");
  }

  if (matrixLoginTokenVn1.length === 0) {
    missing.push("INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_LOGIN_TOKEN_VN1");
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
      matrixBaseUrl,
      matrixLoginTokenType,
      matrixLoginTokenVn,
      matrixLoginTokenVn1,
      expectedUserId,
      keyVn: {
        keyId: keyVnId,
        keyVersion: keyVnVersion,
        keyMaterial: keyVnMaterial
      },
      keyVn1: {
        keyId: keyVn1Id,
        keyVersion: keyVn1Version,
        keyMaterial: keyVn1Material
      }
    }
  };
}

function createMatrixAuthStore(
  storePath: string,
  config: MatrixLiveRotationConfig,
  stage: "vn" | "vn1"
) {
  const current = stage === "vn" ? config.keyVn : config.keyVn1;
  const previous = stage === "vn"
    ? []
    : [{
      keyId: config.keyVn.keyId,
      keyVersion: Number.parseInt(config.keyVn.keyVersion, 10),
      keyMaterial: config.keyVn.keyMaterial
    }];

  return createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: {
      keyId: current.keyId,
      keyVersion: Number.parseInt(current.keyVersion, 10),
      keyMaterial: current.keyMaterial
    },
    previousEncryptionKeys: previous
  });
}

function createMatrixLiveEnv(config: MatrixLiveRotationConfig) {
  return createTestEnv({
    MOSAIC_STACK_SESSION_SECRET: "integration-auth-live-rotation-session-secret",
    MATRIX_LOGIN_TOKEN_TYPE: config.matrixLoginTokenType
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
        matrix?: {
          keyId: string;
          keyVersion: number;
        };
      };
    }>;
  };
  const matrixEnvelope = snapshot.credentials
    .find((entry) => entry.sessionId === sessionId)
    ?.providers.matrix;

  assert.equal(matrixEnvelope?.keyId, expected.keyId);
  assert.equal(matrixEnvelope?.keyVersion, expected.keyVersion);
}

test("integration auth live smoke: matrix credential key rotation across restart", async (t) => {
  const configResult = readMatrixLiveRotationConfig();

  if (configResult.state === "skipped") {
    t.skip(`Matrix integration auth live smoke skipped (${configResult.reason}): missing ${configResult.missing.join(", ")}`);
    return;
  }

  const config = configResult.config;
  const storePath = createTempStorePath();
  const stageVnStore = createMatrixAuthStore(storePath, config, "vn");
  const session = stageVnStore.ensureSession(null);
  const stageVnIntent = stageVnStore.createIntent({
    provider: "matrix",
    sessionId: session.sessionId,
    returnTo: "/console?mode=settings"
  });
  const appVn = createApp({
    env: createMatrixLiveEnv(config),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: config.matrixBaseUrl,
      homeserverUrl: config.matrixBaseUrl,
      expectedUserId: config.expectedUserId
    }),
    integrationAuthStore: stageVnStore,
    logger: false
  });
  let appVnClosed = false;
  t.after(async () => {
    if (!appVnClosed) {
      await appVn.close();
      appVnClosed = true;
    }
  });

  const callbackVn = await appVn.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(stageVnIntent.state)}&loginToken=${encodeURIComponent(config.matrixLoginTokenVn)}`
  });

  assert.equal(callbackVn.statusCode, 302);
  assert.equal(callbackVn.headers.location, "/console?mode=settings");

  const sessionCookie = readSetCookie(callbackVn);
  assert.ok(sessionCookie);

  const statusVn = await appVn.inject({
    method: "GET",
    url: "/api/integrations/status",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  const statusPayloadVn = JSON.parse(statusVn.body) as {
    matrix: {
      status: string;
      authState: string;
      credentialSource: string;
    };
  };

  assert.equal(statusPayloadVn.matrix.status, "connected");
  assert.equal(statusPayloadVn.matrix.authState, "user_connected");
  assert.equal(statusPayloadVn.matrix.credentialSource, "user_connected");
  assertSnapshotKeyVersion(storePath, session.sessionId, {
    keyId: config.keyVn.keyId,
    keyVersion: Number.parseInt(config.keyVn.keyVersion, 10)
  });

  await appVn.close();
  appVnClosed = true;

  const stageVn1Store = createMatrixAuthStore(storePath, config, "vn1");
  const appVn1 = createApp({
    env: createMatrixLiveEnv(config),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: config.matrixBaseUrl,
      homeserverUrl: config.matrixBaseUrl,
      expectedUserId: config.expectedUserId
    }),
    integrationAuthStore: stageVn1Store,
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
    url: "/api/auth/matrix/reverify",
    headers: {
      cookie: sessionCookie ?? ""
    }
  });
  assert.equal(reverifyVn1BeforeWrite.statusCode, 200);

  const stageVn1Intent = stageVn1Store.createIntent({
    provider: "matrix",
    sessionId: session.sessionId,
    returnTo: "/console?mode=settings"
  });
  const callbackVn1 = await appVn1.inject({
    method: "GET",
    url: `/api/auth/matrix/callback?state=${encodeURIComponent(stageVn1Intent.state)}&loginToken=${encodeURIComponent(config.matrixLoginTokenVn1)}`,
    headers: {
      cookie: sessionCookie ?? ""
    }
  });

  assert.equal(callbackVn1.statusCode, 302);
  assert.equal(callbackVn1.headers.location, "/console?mode=settings");
  assertSnapshotKeyVersion(storePath, session.sessionId, {
    keyId: config.keyVn1.keyId,
    keyVersion: Number.parseInt(config.keyVn1.keyVersion, 10)
  });

  await appVn1.close();
  appVn1Closed = true;

  const stageVn1RestartStore = createMatrixAuthStore(storePath, config, "vn1");
  const appVn1Restart = createApp({
    env: createMatrixLiveEnv(config),
    openRouter: createMockOpenRouterClient(),
    matrixConfig: createTestMatrixConfig({
      enabled: true,
      ready: true,
      baseUrl: config.matrixBaseUrl,
      homeserverUrl: config.matrixBaseUrl,
      expectedUserId: config.expectedUserId
    }),
    integrationAuthStore: stageVn1RestartStore,
    logger: false
  });

  t.after(async () => {
    await appVn1Restart.close();
  });

  const reverifyVn1AfterRestart = await appVn1Restart.inject({
    method: "POST",
    url: "/api/auth/matrix/reverify",
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
    matrix: {
      status: string;
      authState: string;
      credentialSource: string;
      labels: {
        identity: string | null;
      };
    };
  };

  assert.equal(finalStatusPayload.matrix.status, "connected");
  assert.equal(finalStatusPayload.matrix.authState, "user_connected");
  assert.equal(finalStatusPayload.matrix.credentialSource, "user_connected");

  if (config.expectedUserId) {
    assert.equal(finalStatusPayload.matrix.labels.identity, config.expectedUserId);
  }
});
