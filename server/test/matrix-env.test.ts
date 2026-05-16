import assert from "node:assert/strict";
import test from "node:test";
import { createMatrixConfig } from "../src/lib/matrix-env.js";

test("matrix config defaults to disabled", () => {
  const config = createMatrixConfig({});

  assert.equal(config.enabled, false);
  assert.equal(config.required, false);
  assert.equal(config.ready, false);
  assert.equal(config.baseUrl, null);
  assert.equal(config.homeserverUrl, null);
  assert.equal(config.accessToken, null);
  assert.equal(config.refreshToken, null);
  assert.equal(config.clientId, null);
  assert.equal(config.tokenExpiresAt, null);
  assert.equal(config.expectedUserId, null);
  assert.equal(config.callbackUrl, null);
  assert.equal(config.issues.length, 0);
});

test("matrix config fails closed when required but disabled", () => {
  assert.throws(
    () => createMatrixConfig({
      MATRIX_ENABLED: "false",
      MATRIX_REQUIRED: "true"
    }),
    /Matrix backend is required but not configured/
  );
});

test("matrix config becomes ready when enabled with a valid origin and token", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_BASE_URL: "https://matrix.example",
    MATRIX_ACCESS_TOKEN: "token",
    MATRIX_SSO_CALLBACK_URL: "https://app.example.test/api/auth/matrix/callback",
    MATRIX_EXPECTED_USER_ID: "@user:matrix.example",
    MATRIX_REQUEST_TIMEOUT_MS: "4000"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.required, false);
  assert.equal(config.ready, true);
  assert.equal(config.baseUrl, "https://matrix.example");
  assert.equal(config.homeserverUrl, "https://matrix.example");
  assert.equal(config.accessToken, "token");
  assert.equal(config.refreshToken, null);
  assert.equal(config.clientId, null);
  assert.equal(config.tokenExpiresAt, null);
  assert.equal(config.expectedUserId, "@user:matrix.example");
  assert.equal(config.callbackUrl, "https://app.example.test/api/auth/matrix/callback");
  assert.equal(config.requestTimeoutMs, 4000);
  assert.deepEqual(config.issues, []);
});

test("matrix config becomes ready when enabled with refresh credentials", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_BASE_URL: "https://matrix.example",
    MATRIX_REFRESH_TOKEN: "refresh-token",
    MATRIX_CLIENT_ID: "client-id",
    MATRIX_SSO_CALLBACK_URL: "https://app.example.test/api/auth/matrix/callback",
    MATRIX_TOKEN_EXPIRES_AT: "2026-04-16T10:00:00.000Z",
    MATRIX_REQUEST_TIMEOUT_MS: "4000"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.required, false);
  assert.equal(config.ready, true);
  assert.equal(config.baseUrl, "https://matrix.example");
  assert.equal(config.homeserverUrl, "https://matrix.example");
  assert.equal(config.accessToken, null);
  assert.equal(config.refreshToken, "refresh-token");
  assert.equal(config.clientId, "client-id");
  assert.equal(config.tokenExpiresAt, "2026-04-16T10:00:00.000Z");
  assert.equal(config.callbackUrl, "https://app.example.test/api/auth/matrix/callback");
  assert.equal(config.requestTimeoutMs, 4000);
  assert.deepEqual(config.issues, []);
});

test("matrix config rejects enabled Matrix without a callback url", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_BASE_URL: "https://matrix.example",
    MATRIX_ACCESS_TOKEN: "token",
    MATRIX_REQUEST_TIMEOUT_MS: "4000"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.ready, false);
  assert.equal(config.callbackUrl, null);
  assert.match(config.issues.join("; "), /MATRIX_SSO_CALLBACK_URL is required when MATRIX_ENABLED=true/);
});

test("matrix config rejects malformed expected user ids when set", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_BASE_URL: "https://matrix.example",
    MATRIX_ACCESS_TOKEN: "token",
    MATRIX_SSO_CALLBACK_URL: "https://app.example.test/api/auth/matrix/callback",
    MATRIX_EXPECTED_USER_ID: "not-a-matrix-user",
    MATRIX_REQUEST_TIMEOUT_MS: "4000"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.ready, false);
  assert.equal(config.expectedUserId, null);
  assert.match(config.issues.join("; "), /MATRIX_EXPECTED_USER_ID must be a Matrix user ID/);
});

test("matrix config rejects malformed token expiry when set", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_BASE_URL: "https://matrix.example",
    MATRIX_REFRESH_TOKEN: "refresh-token",
    MATRIX_CLIENT_ID: "client-id",
    MATRIX_SSO_CALLBACK_URL: "https://app.example.test/api/auth/matrix/callback",
    MATRIX_TOKEN_EXPIRES_AT: "not-a-timestamp",
    MATRIX_REQUEST_TIMEOUT_MS: "4000"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.ready, false);
  assert.equal(config.tokenExpiresAt, null);
  assert.match(config.issues.join("; "), /MATRIX_TOKEN_EXPIRES_AT must be an ISO timestamp/);
});

test("matrix config accepts MATRIX_HOMESERVER_URL as a base url alias", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_HOMESERVER_URL: "https://matrix.example",
    MATRIX_ACCESS_TOKEN: "token",
    MATRIX_SSO_CALLBACK_URL: "https://app.example.test/api/auth/matrix/callback",
    MATRIX_REQUEST_TIMEOUT_MS: "4000"
  });

  assert.equal(config.enabled, true);
  assert.equal(config.ready, true);
  assert.equal(config.baseUrl, "https://matrix.example");
  assert.equal(config.homeserverUrl, "https://matrix.example");
  assert.equal(config.callbackUrl, "https://app.example.test/api/auth/matrix/callback");
  assert.equal(config.accessToken, "token");
});

test("matrix config can route all evidence writes to one dedicated evidence room", () => {
  const config = createMatrixConfig({
    MATRIX_ENABLED: "true",
    MATRIX_REQUIRED: "false",
    MATRIX_BASE_URL: "https://matrix.example",
    MATRIX_ACCESS_TOKEN: "token",
    MATRIX_SSO_CALLBACK_URL: "https://app.example.test/api/auth/matrix/callback",
    MATRIX_REQUEST_TIMEOUT_MS: "4000",
    MATRIX_EVIDENCE_WRITES_ENABLED: "true",
    MATRIX_EVIDENCE_ROOM_ID: "!evidence:matrix.example"
  });

  assert.equal(config.ready, true);
  assert.equal(config.evidenceWritesEnabled, true);
  assert.equal(config.evidenceWritesRequired, false);
  assert.deepEqual(config.evidenceRooms, {
    approvals: "!evidence:matrix.example",
    provenance: "!evidence:matrix.example",
    verification: "!evidence:matrix.example",
    topicChanges: "!evidence:matrix.example"
  });
});
