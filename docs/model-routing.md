# Model Routing Contract

This document describes the current backend-owned model routing surface in MosaicStack.

## Objective

- Keep model/provider routing backend-authoritative.
- Expose only bounded public alias and route metadata to the browser.
- Keep fallback/degraded behavior explicit and observable.
- Keep approval/write paths backend-owned.

## Current Truth

- Chat routing is resolved by one authority module: `server/src/lib/routing-authority.ts`.
- Local and Vercel runtimes share one startup source of truth: `server/src/runtime/create-runtime-config.ts`.
- The browser can request bounded intent fields (`task`, `mode`, `preference`, `modelAlias`) but cannot select raw provider targets.
- `GET /models` returns a public alias registry (labels/capabilities/tier), not provider IDs.
- User-configured OpenRouter chat uses `GET /settings/openrouter/status` for safe aliases and `POST /settings/openrouter/credentials` for backend-only credential storage.
- User profile authority comes only from a backend-created signed/httpOnly local preview profile cookie. Request bodies must not supply `profileId`, `userId`, `tenantId`, or credential owner authority.
- `POST /chat` streaming order is `start -> route -> token* -> done|error`.
- Route metadata surfaces `selectedAlias`, `taskClass`, `fallbackUsed`, `degraded`, `streaming`, and optional decision fields.

## Authority Chain

For chat requests:

1. Validate request contract and block provider override keys.
2. If `modelAlias` is `user_openrouter_default`, resolve signed profile cookie -> encrypted credential store -> decrypted OpenRouter key + stored model ID.
3. Otherwise resolve public alias via `server/src/lib/model-policy.ts`.
4. Resolve backend provider target candidates via `resolveChatModel()` in `server/src/lib/workflow-model-router.ts`.
5. Produce one route decision object in `server/src/lib/routing-authority.ts` or the user OpenRouter resolver.
6. Execute OpenRouter calls with backend-only credentials/provider targets.
7. Return bounded route metadata to browser responses/stream events.

No frontend path can access raw OpenRouter provider/model IDs.

## Public Contracts

### `GET /models`

- `defaultModel`: default public alias
- `models`: public alias list (compatibility)
- `registry`: bounded public entries
  - `alias`
  - `label`
  - `description`
  - `capabilities`
  - `tier`
  - `streaming`
  - `recommendedFor`
  - optional `default`
  - optional `available`

Excluded from response:

- raw provider model IDs
- provider selection internals
- fallback target chain internals

### `POST /chat`

Request accepts:

- `messages` (required)
- `stream` (optional)
- bounded intent fields: `task`, `mode`, `preference`, `modelAlias`
- legacy compatibility field: `model` (interpreted as alias, not provider target)

MosaicStack browser chat sends only `modelAlias`. Raw provider IDs, unknown aliases, missing profile credentials, credential decryption failure, and missing production credential encryption all fail closed before upstream calls.

Response includes:

- `model` (public alias)
- `text`
- `route` metadata object

SSE events:

- `start`
- `route`
- `token`
- `done`
- `error`

## Config and Env

- Runtime-loaded config files:
  - `config/model-capabilities.yml`
  - `config/llm-router.yml`
- Runtime env normalization is shared between local and Vercel startup.
- Legacy `LLM_ROUTER_*` variables remain compatibility inputs for the separate rules-first router module, but chat request routing authority is now centralized in `routing-authority.ts`.
- `USER_CREDENTIALS_ENCRYPTION_KEY` is required for production per-profile OpenRouter credential storage.
- The local preview profile cookie is local-only/dev-only until a full user-auth system becomes authoritative.
- `OPENROUTER_API_KEY` is legacy/dev-only compatibility and must not silently satisfy user-owned OpenRouter chat.

## Vercel Matrix Adapter Posture

- Keep the dedicated Matrix adapter split in `vercel.json` (`api/matrix/[...path].ts` + `/api/matrix/:path*` rewrite) as the current tested deployment posture.
- Do not merge Matrix routing into only `api/[...path].ts` until route normalization and rewrite equivalence for all Matrix endpoints is proven with explicit tests.

## Boundary Guarantees

- Browser remains non-authoritative.
- Backend remains the runtime/model-routing authority.
- Approval/write flows remain backend-controlled.
- Fallback/degraded behavior is visible in route metadata and backend logs.
