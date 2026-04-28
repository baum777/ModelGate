import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createIntegrationAuthStore } from "../src/lib/integration-auth-store.js";

function createTempStorePath() {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), "modelgate-integration-auth-"));
  return path.join(directory, "integration-auth-store.json");
}

test("file-backed integration auth store persists connections and encrypted credentials", () => {
  const storePath = createTempStorePath();
  const encryptionKey = {
    keyId: "integration-auth-v1",
    keyVersion: 1,
    keyMaterial: "integration-auth-secret-v1"
  };
  const store = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: encryptionKey
  });

  store.ensureSession("session-a");
  const stored = store.storeCredential("session-a", "github", {
    accessToken: "gho_session_a_token"
  });
  store.markConnected({
    sessionId: "session-a",
    provider: "github",
    safeIdentityLabel: "octocat",
    source: "user_connected"
  });

  assert.equal(stored, true);

  const restarted = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: encryptionKey
  });

  const connection = restarted.readConnection("session-a", "github");
  const credential = restarted.readCredential("session-a", "github");

  assert.equal(connection?.connected, true);
  assert.equal(connection?.safeIdentityLabel, "octocat");
  assert.equal(credential?.accessToken, "gho_session_a_token");
});

test("integration auth store reads previous key versions and writes with the current key", () => {
  const storePath = createTempStorePath();
  const v1Key = {
    keyId: "integration-auth-v1",
    keyVersion: 1,
    keyMaterial: "integration-auth-secret-v1"
  };
  const v2Key = {
    keyId: "integration-auth-v2",
    keyVersion: 2,
    keyMaterial: "integration-auth-secret-v2"
  };

  const initial = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: v1Key
  });

  assert.equal(initial.storeCredential("session-a", "github", {
    accessToken: "gho_old_token"
  }), true);

  const rotated = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: v2Key,
    previousEncryptionKeys: [v1Key]
  });

  assert.equal(rotated.readCredential("session-a", "github")?.accessToken, "gho_old_token");

  assert.equal(rotated.storeCredential("session-a", "github", {
    accessToken: "gho_new_token"
  }), true);

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
  const githubEnvelope = snapshot.credentials.find((entry) => entry.sessionId === "session-a")?.providers.github;

  assert.equal(githubEnvelope?.keyId, "integration-auth-v2");
  assert.equal(githubEnvelope?.keyVersion, 2);
});

test("integration auth store binds encrypted credentials to session context", () => {
  const storePath = createTempStorePath();
  const encryptionKey = {
    keyId: "integration-auth-v1",
    keyVersion: 1,
    keyMaterial: "integration-auth-secret-v1"
  };
  const store = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: encryptionKey
  });

  assert.equal(store.storeCredential("session-a", "github", {
    accessToken: "gho_session_a_token"
  }), true);
  assert.equal(store.readCredential("session-b", "github"), null);

  const tamperedSnapshot = JSON.parse(fs.readFileSync(storePath, "utf8")) as {
    version: number;
    sessions: Array<{ sessionId: string; connections: unknown }>;
    credentials: Array<{
      sessionId: string;
      providers: Record<string, unknown>;
    }>;
  };
  const sourceEnvelope = tamperedSnapshot.credentials.find((entry) => entry.sessionId === "session-a")?.providers.github;
  assert.ok(sourceEnvelope);
  tamperedSnapshot.credentials.push({
    sessionId: "session-b",
    providers: {
      github: sourceEnvelope
    }
  });
  fs.writeFileSync(storePath, `${JSON.stringify(tamperedSnapshot)}\n`, "utf8");

  const restarted = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: encryptionKey
  });

  assert.equal(restarted.readCredential("session-b", "github"), null);
});

test("integration auth store fails closed in real credential mode when encryption keys are missing", () => {
  const store = createIntegrationAuthStore({
    mode: "memory"
  });

  assert.equal(store.storeCredential("session-a", "github", {
    accessToken: "gho_session_a_token"
  }), false);
});

test("integration auth disconnect semantics remove persisted credentials", () => {
  const storePath = createTempStorePath();
  const encryptionKey = {
    keyId: "integration-auth-v1",
    keyVersion: 1,
    keyMaterial: "integration-auth-secret-v1"
  };
  const store = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: encryptionKey
  });

  assert.equal(store.storeCredential("session-a", "matrix", {
    accessToken: "matrix_session_a_token"
  }), true);
  store.markConnected({
    sessionId: "session-a",
    provider: "matrix",
    safeIdentityLabel: "@user:matrix.example",
    source: "user_connected"
  });

  store.clearCredential("session-a", "matrix");
  store.disconnect("session-a", "matrix");

  const restarted = createIntegrationAuthStore({
    mode: "file",
    filePath: storePath,
    currentEncryptionKey: encryptionKey
  });

  assert.equal(restarted.readCredential("session-a", "matrix"), null);
  assert.equal(restarted.readConnection("session-a", "matrix")?.connected, false);
});
