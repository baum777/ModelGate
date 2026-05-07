# Integration Auth Rotation Live Smoke

Status: opt-in only. These smokes are excluded from default test runs.

Purpose: prove durable credential decrypt/read behavior across key rotation (`vN -> vN+1`) after real provider callback exchanges.

## Scope

GitHub smoke validates this sequence against live GitHub OAuth token exchange:

1. callback exchange succeeds and stores a credential with key `vN`
2. app/store restart can still read + reverify the `vN` credential
3. key config rotates to `vN+1` with `vN` configured as previous
4. existing credential still decrypts + reverifies
5. next callback exchange writes credential metadata with `vN+1`
6. second app/store restart can still read + reverify the `vN+1` credential

Matrix smoke validates the same sequence against live Matrix login-token callback exchange without relying on SSO-flow assumptions.

## Run Locally

Use fresh one-time provider codes/tokens for each callback write.

Required env:

- `INTEGRATION_AUTH_ROTATION_LIVE_ENABLED=true`
- `GITHUB_OAUTH_CLIENT_ID`
- `GITHUB_OAUTH_CLIENT_SECRET`
- `GITHUB_OAUTH_CALLBACK_URL`
- `INTEGRATION_AUTH_ROTATION_LIVE_GITHUB_CODE_VN`
- `INTEGRATION_AUTH_ROTATION_LIVE_GITHUB_CODE_VN1`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_ID`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_VERSION` (default: `1`)
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_MATERIAL`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_ID`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_VERSION` (default: `2`)
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_MATERIAL`

Optional env:

- `INTEGRATION_AUTH_ROTATION_LIVE_EXPECTED_GITHUB_LOGIN`

GitHub command:

```bash
npm run test:integration-auth-rotation-live
```

Matrix required env:

- `INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_ENABLED=true`
- `MATRIX_BASE_URL` (or `MATRIX_HOMESERVER_URL`)
- `INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_LOGIN_TOKEN_VN`
- `INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_LOGIN_TOKEN_VN1`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_ID`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_VERSION` (default: `1`)
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN_MATERIAL`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_ID`
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_VERSION` (default: `2`)
- `INTEGRATION_AUTH_ROTATION_LIVE_KEY_VN1_MATERIAL`

Matrix optional env:

- `MATRIX_LOGIN_TOKEN_TYPE` (default: `m.login.token`)
- `INTEGRATION_AUTH_ROTATION_LIVE_MATRIX_EXPECTED_USER_ID`

Matrix command:

```bash
npm run test:integration-auth-rotation-live:matrix
```

Run both:

```bash
npm run test:integration-auth-rotation-live:both
```

If required env is missing, the test is skipped with a missing-variable list.

## Run In CI

Use workflow dispatch:

- `.github/workflows/integration-auth-rotation-live-smoke.yml`
- `.github/workflows/integration-auth-rotation-live-matrix-smoke.yml`

The workflows read required values from GitHub secrets and run:

```bash
npm run test:integration-auth-rotation-live
npm run test:integration-auth-rotation-live:matrix
```

If secrets are incomplete, the test skips and reports exactly which env values are missing.

## Safety Notes

- No provider access token is logged by either smoke test.
- No token is written into browser state.
- The test only inspects encrypted store envelope metadata (`keyId`, `keyVersion`) for rotation assertions.
- The smoke uses the existing backend integration-auth routes and durable store path; it does not create a parallel auth system.
