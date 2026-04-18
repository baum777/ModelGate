# Vercel Deployment

ModelGate can be deployed on Vercel as a static Vite frontend plus a single serverless API entrypoint that reuses the existing Fastify app.

## Chosen Architecture

- Frontend build output: `web/dist`
- API entrypoint: `api/[...path].ts`
- Shared backend implementation: `server/src/app.ts`
- Route behavior:
  - `/health`
  - `/models`
  - `/chat`
  - `/api/auth/...`
  - `/api/github/...`
  - `/api/matrix/...`
- Production browser API calls use relative paths by default.
- Secrets stay server-side and are not exposed through Vite public env vars.

## Vercel Project Setup

Use the repository root as the Vercel project root.

- Root directory: repository root
- Build command: `npm run build`
- Output directory: `web/dist`
- Runtime: Node.js 20

The deployment is intentionally simple enough for the free or hobby plan:

- one static frontend bundle
- one Node serverless function bundle
- no background jobs
- no deployment-time smoke test

## Required Environment Variables

Set these in Vercel project settings. Keep all secrets in server-side env settings only.

### Backend authority

| Name | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `OPENROUTER_API_KEY` | yes | yes | Required for chat provider calls. |
| `OPENROUTER_BASE_URL` | no | no | OpenRouter API base URL. |
| `OPENROUTER_MODEL` | no | no | Hidden provider target for the public default alias. |
| `OPENROUTER_MODELS` | no | no | Hidden fallback provider targets. |
| `OPENROUTER_REQUEST_TIMEOUT_MS` | no | no | OpenRouter request timeout in milliseconds. |
| `APP_NAME` | no | no | Upstream application name. |
| `DEFAULT_SYSTEM_PROMPT` | no | no | Server-side system prompt. |
| `CORS_ORIGINS` | no | no | Allowlist for browser origins and preview URLs. |

### Workflow routing

The backend loads `config/model-capabilities.yml` at runtime. The routing contract is documented in [../docs/model-routing.md](../docs/model-routing.md).

| Name | Required | Secret | Purpose | Status |
| --- | --- | --- | --- | --- |
| `CHAT_MODEL` | no | no | Explicit chat workflow model. | backend-owned |
| `CODE_AGENT_MODEL` | no | no | GitHub proposal planning model. | backend-owned |
| `STRUCTURED_PLAN_MODEL` | no | no | Structured-output plan model. | backend-owned |
| `MATRIX_ANALYZE_MODEL` | no | no | Parsed Matrix analyze policy input. | parsed; current Matrix analyze stays deterministic |
| `FAST_FALLBACK_MODEL` | no | no | Non-execute fallback model. | backend-owned |
| `DIALOG_FALLBACK_MODEL` | no | no | Safe dialogue fallback model. | backend-owned |
| `MODEL_ROUTING_MODE` | no | no | Workflow routing mode. | only `policy` is supported |
| `ALLOW_MODEL_FALLBACK` | no | no | Enables fallback on non-execute phases. | backend-owned |
| `MODEL_ROUTING_FAIL_CLOSED` | no | no | Keeps workflow routing fail-closed. | backend-owned |
| `MODEL_ROUTING_LOG_ENABLED` | no | no | Enables local workflow routing evidence logging. | local/advisory |
| `MODEL_ROUTING_LOG_PATH` | no | no | Workflow routing log path. | local/advisory |

### GitHub backend authority

GitHub stays backend-only. The remote flow remains fail-closed until the required server-side variables are present.

| Name | Required | Secret | Purpose | Status |
| --- | --- | --- | --- | --- |
| `GITHUB_TOKEN` | yes | yes | Auth token for the server-side GitHub API client. | required |
| `GITHUB_ALLOWED_REPOS` | yes | no | Comma-separated `owner/repo` allowlist for `/api/github/*`. | required |
| `GITHUB_AGENT_API_KEY` | yes | yes | Admin key for approval-gated GitHub execute requests. Send only in `X-ModelGate-Admin-Key`. | required for execute |
| `MODEL_GATE_ADMIN_PASSWORD` | yes | yes | Admin password for the server-side GitHub session login. | required for auth |
| `MODEL_GATE_SESSION_SECRET` | yes | yes | Signing secret for the HttpOnly session cookie. | required for auth |
| `MODEL_GATE_SESSION_TTL_SECONDS` | no | no | Session cookie lifetime in seconds. Defaults to `86400`. | optional |
| `GITHUB_API_BASE_URL` | no | no | GitHub API base URL. | optional |
| `GITHUB_DEFAULT_OWNER` | no | no | Default owner used by GitHub routing helpers. | optional |
| `GITHUB_BRANCH_PREFIX` | no | no | Prefix for backend-created branches. | optional |
| `GITHUB_REQUEST_TIMEOUT_MS` | no | no | Upstream GitHub request timeout. | optional |
| `GITHUB_PLAN_TTL_MS` | no | no | TTL for stored GitHub plans. | optional |
| `GITHUB_MAX_CONTEXT_FILES` | no | no | Max files included in `/api/github/context`. | optional |
| `GITHUB_MAX_CONTEXT_BYTES` | no | no | Max byte budget for `/api/github/context`. | optional |
| `GITHUB_SMOKE_REPO` | no | no | Dedicated repo for manual GitHub smoke testing. | optional |
| `GITHUB_SMOKE_BASE_BRANCH` | no | no | Base branch for manual smoke testing. | optional |
| `GITHUB_SMOKE_TARGET_BRANCH` | no | no | Target branch for manual smoke testing. | optional |
| `GITHUB_SMOKE_ENABLED` | no | no | Enables the manual smoke path. | optional |
| `GITHUB_APP_ID` | no | no | Reserved app-auth placeholder; currently not wired into runtime. | reserved/unwired |
| `GITHUB_APP_PRIVATE_KEY` | no | yes | Reserved app-auth placeholder; currently not wired into runtime. | reserved/unwired |
| `GITHUB_APP_INSTALLATION_ID` | no | no | Reserved app-auth placeholder; currently not wired into runtime. | reserved/unwired |

### Rules-first router policy

| Name | Required | Purpose |
| --- | --- | --- |
| `LLM_ROUTER_ENABLED` | no | Defaults to `false`. |
| `LLM_ROUTER_MODE` | no | Currently `rules_first`. |
| `LLM_REQUIRE_FREE_MODELS` | no | Defaults to `true`. |
| `LLM_MAX_FALLBACKS` | no | Caps fallback attempts. |
| `LLM_ROUTER_FAIL_CLOSED` | no | Defaults to `true`. |
| `LLM_ROUTER_LOG_ENABLED` | no | Private local-only logging toggle. |
| `LLM_ROUTER_LOG_PATH` | no | Private router evidence log path. |
| `LLM_MODEL_RUN_LOG_PATH` | no | Private model run log path. |
| `LLM_PROMPT_EVIDENCE_LOG_PATH` | no | Private prompt evidence log path. |
| `LLM_ROUTER_POLICY_PATH` | no | Repo-relative policy file path. |
| `LLM_PROMPT_CLASSIFIER_PATH` | no | Policy override. |
| `LLM_MODEL_MAP_PATH` | no | Policy override. |
| `LLM_FALLBACK_POLICY_PATH` | no | Policy override. |
| `LLM_DEFAULT_MODEL` | no | Backend-internal default model target. |
| `LLM_FALLBACK_MODEL` | no | Backend-internal fallback model target. |
| `LLM_MODEL_CODING` | no | Backend-internal coding model target. |
| `LLM_MODEL_REPO_REVIEW` | no | Backend-internal repo review model target. |
| `LLM_MODEL_ARCHITECTURE` | no | Backend-internal architecture model target. |
| `LLM_MODEL_DEEP_REASONING` | no | Backend-internal deep-reasoning model target. |
| `LLM_MODEL_LONG_CONTEXT` | no | Backend-internal long-context model target. |
| `LLM_MODEL_UI_REVIEW` | no | Backend-internal UI review model target. |
| `LLM_MODEL_DAILY` | no | Backend-internal default daily model target. |

### Matrix workflow policy

These keys are parsed by the backend even though Matrix analyze remains deterministic in the current repo slice.

| Name | Required | Secret | Purpose | Status |
| --- | --- | --- | --- | --- |
| `MATRIX_ANALYZE_LLM_ENABLED` | no | no | Parsed Matrix workflow flag. | parsed, not yet wired to model-driven analyze |
| `MATRIX_EXECUTE_APPROVAL_REQUIRED` | no | no | Parsed Matrix workflow flag. | parsed, approval gating remains backend-owned |
| `MATRIX_VERIFY_AFTER_EXECUTE` | no | no | Parsed Matrix workflow flag. | parsed, verify route remains backend-owned |
| `MATRIX_ALLOWED_ACTION_TYPES` | no | no | Parsed Matrix workflow allowlist. | parsed, current route surface stays deterministic |
| `MATRIX_FAIL_CLOSED` | no | no | Parsed Matrix workflow fail-closed flag. | parsed, current routes already fail closed |

### Matrix backend authority

Matrix credentials stay server-side only.

| Name | Required | Secret | Purpose |
| --- | --- | --- | --- |
| `MATRIX_ENABLED` | no | no | Set `true` to enable the Matrix routes. |
| `MATRIX_REQUIRED` | no | no | Fail startup closed if Matrix is required but invalid. |
| `MATRIX_BASE_URL` | yes when Matrix is enabled | no | Matrix homeserver origin. |
| `MATRIX_HOMESERVER_URL` | no | no | Alias for `MATRIX_BASE_URL`. |
| `MATRIX_ACCESS_TOKEN` | yes when Matrix is enabled and no refresh token is used | yes | Matrix access token. |
| `MATRIX_REFRESH_TOKEN` | no | yes | Optional server-side Matrix refresh token. |
| `MATRIX_CLIENT_ID` | yes when `MATRIX_REFRESH_TOKEN` is set | no | Refresh-token client ID. |
| `MATRIX_TOKEN_EXPIRES_AT` | no | no | Optional ISO timestamp for the current access token expiry. |
| `MATRIX_EXPECTED_USER_ID` | no | no | Optional identity guard. |
| `MATRIX_REQUEST_TIMEOUT_MS` | no | no | Upstream request timeout. |
| `MATRIX_SMOKE_ROOM_ID` | no | no | Dedicated room for the manual live topic smoke. |
| `MATRIX_SMOKE_TOPIC_PREFIX` | no | no | Optional topic prefix for the manual live smoke. |

### Optional browser overrides

These are only needed when you want the browser build to talk to a non-default backend origin. In production they should usually stay unset so the client uses relative paths.

| Name | Purpose |
| --- | --- |
| `VITE_API_BASE_URL` | Browser API origin override. |
| `VITE_GITHUB_API_BASE_URL` | Browser GitHub API origin override. |
| `VITE_MATRIX_API_BASE_URL` | Browser Matrix API origin override. |

## Local Preview

The closest local preview to the Vercel topology is:

```bash
vercel dev
```

Before running it locally:

1. Copy `.env.example` to `.env`.
2. Set `OPENROUTER_API_KEY`.
3. Set GitHub or Matrix variables only if you want those surfaces enabled locally.
4. Copy `web/.env.example` to `web/.env` only if you need browser origin overrides.

If you prefer the existing split dev workflow, you can still use:

```bash
npm run dev:server
npm run dev:web
```

That workflow is separate from the Vercel deployment path.

## Production Verification Checklist

After deployment, verify:

1. `/health` returns a healthy backend response.
2. `/models` returns the public alias list and does not expose provider IDs.
3. `/chat` works for non-stream and stream requests.
4. `/api/auth/login`, `/api/auth/me`, and `/api/auth/logout` work and do not expose secrets.
5. `/api/github/repos` and the proposal/execute/verify flow are fail-closed or live as configured.
6. `/api/github/*` returns `401` until a valid admin session cookie is present.
7. `/api/matrix/whoami` and `/api/matrix/joined-rooms` are fail-closed or live as configured.
8. The browser uses relative paths in production and does not depend on a Vite public API host.
9. No Matrix token, GitHub session secret, or provider secret appears in browser DOM, logs, or client bundles.
10. `npm run smoke:matrix` remains manual-only and is not part of deployment.
