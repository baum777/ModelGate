# ModelGate

ModelGate is a backend-first console overlay for OpenRouter chat, GitHub workspace review, and Matrix workspace operations.

The browser is a thin PWA shell. It renders backend-owned results, keeps local UI state, and sends approval intent only. Provider IDs, Matrix credentials, and execution truth stay server-side.

## Architecture

- PWA / web frontend: `web/` is a Vite + React app with local-only UI state and PWA assets.
- Backend API: `server/` is the Fastify authority layer for chat, GitHub, Matrix, and Vercel serverless reuse through `api/[...path].ts`.
- OpenRouter / LLM routing: the backend exposes only the public alias `default` through `GET /models` and maps it to hidden provider targets from `OPENROUTER_MODEL` and `OPENROUTER_MODELS`.
- Workflow routing contract: `config/model-capabilities.yml` is runtime-loaded, and the routing rules are documented in [docs/model-routing.md](docs/model-routing.md).
- GitHub workspace: the backend owns repo reads, proposal generation, execution, and verification. The browser is review-first and approval-gated.
- Matrix workspace: the backend owns identity, scope, provenance, topic-access, analyze, and approval-gated room topic plan/execute/verify flows.
- Approval-gated writes: GitHub and Matrix writes are created and executed server-side. The browser can only submit review and approval intent.

## Verified Status

### Core chat and model surfaces

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /health` | implemented | Returns backend status, service name, mode, upstream, default public model alias, and public model count. |
| `GET /models` | implemented | Returns the public alias list only. Provider IDs do not appear here. |
| `POST /chat` | implemented | Supports non-stream responses and SSE streaming. Stream order is `start -> token* -> done|error`. |

### GitHub workspace surfaces

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/github/repos` | implemented when configured | Lists only repos allowed by `GITHUB_ALLOWED_REPOS`. |
| `POST /api/github/context` | implemented when configured | Builds backend-owned read context for an allowed repo. |
| `POST /api/github/actions/propose` | implemented when configured | Creates a backend-owned proposal plan with a reviewable diff. |
| `GET /api/github/actions/:planId` | implemented when configured | Returns the stored plan while it is still active. |
| `POST /api/github/actions/:planId/execute` | implemented when configured | Executes only with explicit approval intent and stays fail-closed on stale plans. |
| `GET /api/github/actions/:planId/verify` | implemented when configured | Re-reads GitHub state and reports verified, mismatch, pending, or failed. |
| `GET /api/github/repos/:owner/:repo/tree` | implemented when configured | Read-only tree helper for allowed repos. |
| `GET /api/github/repos/:owner/:repo/file` | implemented when configured | Read-only file helper for allowed repos. |

### Matrix workspace surfaces

| Endpoint | Status | Notes |
| --- | --- | --- |
| `GET /api/matrix/whoami` | implemented when configured | Returns normalized Matrix identity and fails closed when disabled. |
| `GET /api/matrix/joined-rooms` | implemented when configured | Returns normalized joined-room metadata. |
| `POST /api/matrix/scope/resolve` | implemented when configured | Stores an opaque scope snapshot for later summary reads. |
| `GET /api/matrix/scope/:scopeId/summary` | implemented when configured | Returns a bounded read-only summary for the stored scope snapshot. |
| `GET /api/matrix/rooms/:roomId/provenance` | implemented when configured | Returns normalized read-only room provenance from joined rooms. |
| `GET /api/matrix/rooms/:roomId/topic-access` | implemented when configured | Returns room topic power-level access details. |
| `POST /api/matrix/analyze` | implemented when configured | Creates a backend-owned room topic analysis plan. |
| `GET /api/matrix/actions/:planId` | implemented when configured | Returns the stored Matrix plan while active. |
| `POST /api/matrix/actions/:planId/execute` | implemented when configured | Executes only with explicit approval intent and re-checks freshness before write. |
| `GET /api/matrix/actions/:planId/verify` | implemented when configured | Re-reads Matrix state and reports verified, mismatch, pending, or failed. |

## Current Caveats

- Matrix hierarchy preview is browser-side advisory/mock-only in this repo. It is not backend-verified or write-authoritative.
- Matrix and GitHub routes fail closed until their backend env is present and valid. They do not auto-enable.
- `GITHUB_APP_*` fields are reserved placeholders and are not wired into the current runtime path.
- `npm run smoke:matrix` is the manual Matrix topic-retarget smoke and depends on a dedicated Matrix room.
- `npm run test:matrix-live` is the opt-in live smoke wrapper used by the separate `Matrix live smoke` workflow; it skips cleanly when the backend or required env is missing.
- `npm run test:integration-auth-rotation-live` is an opt-in live GitHub OAuth credential-rotation smoke; it skips cleanly when required live env is missing.
- `npm run test:integration-auth-rotation-live:matrix` is an opt-in live Matrix login-token credential-rotation smoke; it skips cleanly when required live env is missing.
- Restored browser state is UI-local only. It is not backend truth.

## Local Development

1. Install dependencies:

```bash
npm install
```

2. Create the backend env file from the repo-root example:

```bash
cp .env.example .env
```

3. Create the optional browser env file if you want to override local API origins:

```bash
cp web/.env.example web/.env
```

4. Set `OPENROUTER_API_KEY` in `.env`.
5. Add `GITHUB_TOKEN` and `GITHUB_ALLOWED_REPOS` only if you want GitHub workspace routes enabled.
   Add `GITHUB_AGENT_API_KEY` if you want approval-gated execute enabled; send it only as `X-ModelGate-Admin-Key` from trusted server-side callers.
6. Add `MATRIX_ENABLED=true`, `MATRIX_BASE_URL`, and `MATRIX_ACCESS_TOKEN` only if you want Matrix routes enabled.

Run the backend:

```bash
npm run dev:server
```

Run the web client in a second terminal:

```bash
npm run dev:web
```

The backend reads the repo-root `.env` file. The web client reads `web/.env` only for browser-side origin overrides.

## Vercel Deployment

ModelGate is deployed as a Vite frontend plus a single Node serverless entrypoint.

1. Use the repository root as the Vercel project root.
2. Set the build command to `npm run build`.
3. Set the output directory to `web/dist`.
4. Keep secrets server-side in Vercel project env settings.
5. Use `vercel dev` for the closest local preview of the production topology.
6. The repo also includes [.github/workflows/vercel-deploy.yml](.github/workflows/vercel-deploy.yml) for the same CLI path in GitHub Actions.

The deployment path uses:

- frontend build output: `web/dist`
- API entrypoint: `api/[...path].ts`
- shared backend implementation: `server/src/app.ts`

## Environment Variables

Secrets stay backend-only. Do not put tokens in Vite public env vars.

### Required backend vars

| Variable | Where | Purpose |
| --- | --- | --- |
| `OPENROUTER_API_KEY` | backend only | Required for OpenRouter chat calls. |
| `OPENROUTER_API_KEY_QWEN3_CODER` | backend only | Optional specialized key for qwen/qwen3-coder provider targets. |
| `OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER` | backend only | Optional specialized key for openai/gpt-oss-120b provider targets. |
| `OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B` | backend only | Optional specialized key for nvidia/nemotron-3-super-120b provider targets. |

### Workflow routing vars

These are backend-owned workflow model inputs. They are resolved server-side and are not provider selection controls in the browser.

The example files use `default` as a backend-owned sentinel in some compatibility slots. The runtime resolves actual provider targets server-side.

| Variable | Where | Purpose |
| --- | --- | --- |
| `CHAT_MODEL` | backend only | Explicit chat workflow model. |
| `CODE_AGENT_MODEL` | backend only | GitHub proposal planning model. |
| `STRUCTURED_PLAN_MODEL` | backend only | Structured proposal object model. |
| `MATRIX_ANALYZE_MODEL` | backend only | Parsed Matrix analyze policy input; still deferred from live Matrix policy authority in this repo slice. |
| `FAST_FALLBACK_MODEL` | backend only | Non-execute fallback model. |
| `DIALOG_FALLBACK_MODEL` | backend only | Safe dialogue fallback model. |
| `MODEL_ROUTING_MODE` | backend only | Workflow routing mode. Only `policy` is supported. |
| `ALLOW_MODEL_FALLBACK` | backend only | Enables fallback on non-execute phases. |
| `MODEL_ROUTING_FAIL_CLOSED` | backend only | Keeps workflow routing fail-closed. |
| `MODEL_ROUTING_LOG_ENABLED` | backend only | Enables local workflow routing evidence logging. |
| `MODEL_ROUTING_LOG_PATH` | backend only | Local workflow routing evidence path. |

### Optional backend vars

| Variable | Where | Purpose |
| --- | --- | --- |
| `OPENROUTER_BASE_URL` | backend only | Overrides the OpenRouter API base URL. |
| `OPENROUTER_MODEL` | backend only | Hidden provider target for the public default alias. |
| `OPENROUTER_MODELS` | backend only | Hidden fallback provider targets. |
| `OPENROUTER_REQUEST_TIMEOUT_MS` | backend only | OpenRouter request timeout in milliseconds. |
| `APP_NAME` | backend only | Upstream application name. |
| `DEFAULT_SYSTEM_PROMPT` | backend only | Server-side system prompt injected before chat forwarding. |
| `CORS_ORIGINS` | backend only | Allowlist of browser origins. |
| `LLM_ROUTER_ENABLED` | backend only | Enables the deterministic rules-first router. |
| `LLM_ROUTER_MODE` | backend only | Router mode, currently `rules_first`. |
| `LLM_REQUIRE_FREE_MODELS` | backend only | Keeps the router on free model targets. |
| `LLM_MAX_FALLBACKS` | backend only | Caps router fallback attempts. |
| `LLM_ROUTER_FAIL_CLOSED` | backend only | Keeps the router fail-closed. |
| `LLM_ROUTER_LOG_ENABLED` | backend only | Enables private append-only router evidence logging. |
| `LLM_ROUTER_POLICY_PATH` | backend only | Path to the router policy file. |
| `LLM_PROMPT_CLASSIFIER_PATH` | backend only | Optional classifier override. |
| `LLM_MODEL_MAP_PATH` | backend only | Optional task-to-model map override. |
| `LLM_FALLBACK_POLICY_PATH` | backend only | Optional fallback policy override. |
| `LLM_DEFAULT_MODEL` | backend only | Router default model target. |
| `LLM_FALLBACK_MODEL` | backend only | Router fallback model target. |
| `LLM_MODEL_CODING` | backend only | Coding task model target. |
| `LLM_MODEL_REPO_REVIEW` | backend only | Repo review task model target. |
| `LLM_MODEL_ARCHITECTURE` | backend only | Architecture task model target. |
| `LLM_MODEL_DEEP_REASONING` | backend only | Deep reasoning task model target. |
| `LLM_MODEL_LONG_CONTEXT` | backend only | Long-context task model target. |
| `LLM_MODEL_UI_REVIEW` | backend only | UI review task model target. |
| `LLM_MODEL_DAILY` | backend only | Daily/general task model target. |
| `GITHUB_TOKEN` | backend only | Required for GitHub workspace routes. |
| `GITHUB_ALLOWED_REPOS` | backend only | Required allowlist for GitHub workspace routes. |
| `GITHUB_AGENT_API_KEY` | backend only | Admin key required for approval-gated execute requests. |
| `GITHUB_API_BASE_URL` | backend only | GitHub API base URL. |
| `GITHUB_DEFAULT_OWNER` | backend only | Optional default owner. |
| `GITHUB_BRANCH_PREFIX` | backend only | Backend-created branch prefix. |
| `GITHUB_REQUEST_TIMEOUT_MS` | backend only | GitHub request timeout. |
| `GITHUB_PLAN_TTL_MS` | backend only | GitHub plan TTL. |
| `GITHUB_MAX_CONTEXT_FILES` | backend only | Context file limit. |
| `GITHUB_MAX_CONTEXT_BYTES` | backend only | Context byte limit. |
| `GITHUB_SMOKE_REPO` | backend only | Manual GitHub smoke repo. |
| `GITHUB_SMOKE_BASE_BRANCH` | backend only | Manual GitHub smoke base branch. |
| `GITHUB_SMOKE_TARGET_BRANCH` | backend only | Manual GitHub smoke target branch. |
| `GITHUB_SMOKE_ENABLED` | backend only | Enables the manual GitHub smoke path. |
| `GITHUB_APP_ID` | backend only | Reserved placeholder, not wired. |
| `GITHUB_APP_PRIVATE_KEY` | backend only | Reserved placeholder, not wired. |
| `GITHUB_APP_INSTALLATION_ID` | backend only | Reserved placeholder, not wired. |
| `MATRIX_ENABLED` | backend only | Enables Matrix routes. |
| `MATRIX_REQUIRED` | backend only | Fails startup closed if Matrix is required but invalid. |
| `MATRIX_BASE_URL` | backend only | Matrix homeserver origin. |
| `MATRIX_HOMESERVER_URL` | backend only | Alias for `MATRIX_BASE_URL`. |
| `MATRIX_ACCESS_TOKEN` | backend only | Matrix access token. |
| `MATRIX_REFRESH_TOKEN` | backend only | Optional Matrix refresh token. |
| `MATRIX_CLIENT_ID` | backend only | Required when refresh token is used. |
| `MATRIX_TOKEN_EXPIRES_AT` | backend only | Optional access token expiry timestamp. |
| `MATRIX_EXPECTED_USER_ID` | backend only | Optional identity guard. |
| `MATRIX_REQUEST_TIMEOUT_MS` | backend only | Matrix request timeout. |
| `MATRIX_SMOKE_ROOM_ID` | backend only | Dedicated room for manual Matrix smoke. |
| `MATRIX_SMOKE_TOPIC_PREFIX` | backend only | Manual Matrix smoke topic prefix. |

The Matrix workflow policy keys are parsed from the environment and documented in [docs/model-routing.md](docs/model-routing.md). They remain parsed-only / deferred in this repo slice and do not override the live backend-owned Matrix flow.

### Optional browser overrides

| Variable | Where | Purpose |
| --- | --- | --- |
| `VITE_API_BASE_URL` | browser build only | Overrides the browser API origin. Leave unset for relative paths in production. |
| `VITE_GITHUB_API_BASE_URL` | browser build only | Overrides the browser GitHub API origin. |
| `VITE_MATRIX_API_BASE_URL` | browser build only | Overrides the browser Matrix API origin. |

## Verification

Suggested checks:

```bash
npm run typecheck
npm test
npm run build
```

For browser coverage:

```bash
npm run test:browser
```

For the opt-in Matrix live smoke:

```bash
npm run test:matrix-live
```

For the opt-in integration auth rotation live smoke:

```bash
npm run test:integration-auth-rotation-live
npm run test:integration-auth-rotation-live:matrix
npm run test:integration-auth-rotation-live:both
```

Live setup and CI instructions: [docs/integration-auth-rotation-live-smoke.md](docs/integration-auth-rotation-live-smoke.md).

For backend-only checks:

```bash
npm run typecheck:server
npm run test:server
```

For browser and UI checks:

```bash
npm run typecheck:web
npm run test:web
```
