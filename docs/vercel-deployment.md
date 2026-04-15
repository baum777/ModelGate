# Vercel Deployment

ModelGate can be deployed on Vercel as a static Vite frontend plus a single
serverless API entrypoint that reuses the existing Fastify app.

## Chosen Architecture

- Frontend build output: `web/dist`
- API entrypoint: `api/[...path].ts`
- Shared backend implementation: `server/src/app.ts`
- Route behavior:
  - `/health`
  - `/models`
  - `/chat`
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

Set these in Vercel project settings.

### Backend authority

- `OPENROUTER_API_KEY` - required for chat provider calls
- `OPENROUTER_BASE_URL` - optional, defaults to `https://openrouter.ai/api/v1`
- `OPENROUTER_MODEL` - optional public default model target
- `OPENROUTER_MODELS` - optional hidden provider fallback pool
- `APP_NAME` - optional display name for upstream requests
- `DEFAULT_SYSTEM_PROMPT` - optional backend-owned system prompt
- `CORS_ORIGINS` - optional allowlist for local browser origins and preview URLs

### Rules-first router policy

- `LLM_ROUTER_ENABLED` - optional, defaults to `false`
- `LLM_ROUTER_MODE` - optional, currently `rules_first`
- `LLM_REQUIRE_FREE_MODELS` - optional, defaults to `true`
- `LLM_MAX_FALLBACKS` - optional
- `LLM_ROUTER_FAIL_CLOSED` - optional, defaults to `true`
- `LLM_ROUTER_LOG_ENABLED` - optional, private local-only logging toggle
- `LLM_ROUTER_POLICY_PATH` - optional repo-relative policy file path
- `LLM_PROMPT_CLASSIFIER_PATH` - optional policy override
- `LLM_MODEL_MAP_PATH` - optional policy override
- `LLM_FALLBACK_POLICY_PATH` - optional policy override

### Matrix backend authority

Matrix credentials stay server-side only.

- `MATRIX_ENABLED` - set `true` to enable the Matrix routes
- `MATRIX_BASE_URL` - required when Matrix is enabled
- `MATRIX_ACCESS_TOKEN` - required when Matrix is enabled
- `MATRIX_EXPECTED_USER_ID` - optional identity guard
- `MATRIX_REQUEST_TIMEOUT_MS` - optional timeout, defaults to `5000`

### Optional live smoke vars

These are manual-only and must not be used by the normal build/test path.

- `MATRIX_SMOKE_ROOM_ID` - dedicated room for the live topic smoke
- `MATRIX_SMOKE_TOPIC_PREFIX` - optional topic prefix, defaults to `ModelGate smoke`

## Local Preview

The closest local preview to the Vercel topology is:

```bash
vercel dev
```

Before running it locally:

1. Copy `server/.env.example` to `.env`.
2. Set `OPENROUTER_API_KEY`.
3. Set the Matrix variables if you want Matrix features enabled locally.

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
4. `/api/matrix/whoami` and `/api/matrix/joined-rooms` are fail-closed or live as configured.
5. The browser uses relative paths in production and does not depend on a Vite public API host.
6. No Matrix token or provider secret appears in browser DOM, logs, or client bundles.
7. `npm run smoke:matrix` remains manual-only and is not part of deployment.

