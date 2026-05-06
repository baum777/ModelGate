# Vercel Deployment

MosaicStack is deployed as a static frontend plus serverless API handlers.

## Topology

- Static frontend output: `web/dist`
- API handlers:
  - `api/[...path].ts`
  - `api/matrix/[...path].ts`
- Shared backend app implementation: `server/src/app.ts`
- Shared runtime initialization for local + Vercel:
  - `server/src/runtime/create-runtime-config.ts`

## Fixed Deployment Mismatch

The previous deployment path mixed server and frontend build assumptions by running the root `build` script while also setting `outputDirectory` to `web/dist`.

Current fix:

- `vercel.json` now uses `buildCommand: "npm run build:web"` so Vercel builds only the static frontend output for `outputDirectory`.
- API execution remains on `api/*` serverless handlers.
- Rewrites explicitly route API traffic through serverless handlers while keeping static assets served from `web/dist`.

## Runtime Config Bundling

Both API handlers include runtime-loaded YAML config files:

- `config/llm-router.yml`
- `config/model-capabilities.yml`

This is configured in `vercel.json` via `functions[*].includeFiles`.

## Route Mapping

Frontend-facing endpoints are rewritten to backend handlers:

- `/health` -> `/api/health`
- `/models` -> `/api/models`
- `/chat` -> `/api/chat`
- `/api/matrix/*` -> `/api/matrix/[...path]`
- `/api/auth/*` -> `/api/[...path]`
- `/api/github/*` -> `/api/[...path]`
- `/api/*` -> `/api/[...path]`

## Verification Checklist

After deploy, verify:

1. `/health` returns 200.
2. `/models` returns public alias registry without provider IDs.
3. `/chat` works for non-stream + stream (`start -> route -> token* -> done|error`).
4. `api` routes remain functional (`auth`, `github`, `matrix`).
5. No runtime config file loading errors on cold start.
