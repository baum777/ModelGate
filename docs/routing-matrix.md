# MosaicStack Routing Matrix

Status: source of truth for browser path, Vercel adapter, and server route ownership.

Security copy:

> GitHub and Matrix are not browser integrations. The console sends governed intent. The backend owns credentials, planning, execution, verification, and sanitized errors.

## Contract

- Browser paths are intent surfaces only.
- Vercel adapters preserve `/api/github/*` and `/api/matrix/*` as backend-owned paths.
- Provider IDs, GitHub tokens, Matrix tokens, admin credentials, and raw upstream errors must not become browser truth.
- Write routes must remain approval-gated and produce execution/verification evidence before the UI treats them as complete.

## Matrix

| Browser Path | Vercel Destination | Adapter | Server Route | Owner | Secrets | Write? |
|---|---|---|---|---|---|---|
| `/api/github/repos` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | no |
| `/api/github/context` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | no |
| `/api/github/actions/propose` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN`, model provider key | no external write; creates review plan |
| `/api/github/actions/:planId/execute` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | yes; approval-gated |
| `/api/github/actions/:planId/verify` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | no external write; verifies receipt |
| `/api/integrations/status` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integrations.ts` | backend | none returned to browser | no |
| `/api/auth/github/start` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | session cookie + short-lived state | no external write; connect intent only |
| `/api/auth/github/callback` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | callback state + server-side token exchange | no browser write; backend-owned credential handling |
| `/api/auth/github/disconnect` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | none returned to browser | no external write |
| `/api/auth/github/reverify` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | none returned to browser | no external write |
| `/api/auth/matrix/start` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | session cookie + short-lived state | no external write; connect intent only |
| `/api/auth/matrix/callback` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | callback state + server-side login-token exchange | no browser write; backend-owned credential handling |
| `/api/auth/matrix/disconnect` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | none returned to browser | no external write |
| `/api/auth/matrix/reverify` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/integration-auth.ts` | backend | none returned to browser | no external write |
| `/api/matrix/whoami` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | no |
| `/api/matrix/joined-rooms` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | no |
| `/api/matrix/scope/resolve` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | server snapshot only |
| `/api/matrix/analyze` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN`, model provider key | no external write; creates review plan |
| `/api/matrix/actions/:planId/execute` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | yes; approval-gated |
| `/api/matrix/actions/:planId/verify` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | no external write; verifies receipt |

## Drift Guards

- Route contract tests live in `server/test/vercel-config.test.ts` and `server/test/vercel-handler.test.ts`.
- Browser upstream boundary tests live in `web/test/browser-upstream-boundary.test.ts`.
- Browser flow tests for console URL state and route ownership copy live in `tests/browser/mosaicstack.spec.ts`.
- Opt-in live rotation smoke for GitHub integration auth credentials lives in `tests/live/integration-auth-rotation-live.test.ts` and is run via `npm run test:integration-auth-rotation-live`.
- Opt-in live rotation smoke for Matrix integration auth credentials lives in `tests/live/integration-auth-rotation-live-matrix.test.ts` and is run via `npm run test:integration-auth-rotation-live:matrix`.

## Settings Auth Connect Routing

- Settings CTAs start backend-owned auth intent only.
- Browser opens `/api/auth/{provider}/start` with an allowlisted `returnTo`.
- Backend creates short-lived `state` and keeps it server-side.
- Callback (`/api/auth/{provider}/callback`) validates `state`, performs provider exchange server-side when config is present, stores credentials in a durable encrypted backend store, and redirects to `/console?mode=settings`.
- Stored provider credentials are session-bound and encrypted with key metadata (`keyId`, `keyVersion`) so active writes use the current key while reads can accept configured previous keys during rotation.
- Real credential mode fails closed when encryption config is missing or invalid; stub fallback is allowed only when provider config is absent.
- Stub fallback remains available only when provider OAuth/SSO config is not present.
- Browser reads only sanitized status from `/api/integrations/status`.

Browser must not receive or store GitHub/Matrix tokens. Backend owns auth state, callback validation, credential handling, and execution boundaries.

## Session Credential Routing

- `/api/github/*` is session-credential-aware.
- Route order is fail-closed and deterministic:
  1. Use session-bound GitHub OAuth credential from integration auth store when available (`credentialSource: user_connected`).
  2. Otherwise use instance credential (`GITHUB_TOKEN`) only when instance GitHub config is ready (`credentialSource: instance_config`).
  3. If neither source is available, return `github_not_configured`.
- `GITHUB_ALLOWED_REPOS` policy remains enforced for both credential sources.
- Execute and verify write posture remains approval-gated; session OAuth does not bypass `GITHUB_AGENT_API_KEY` requirements.
