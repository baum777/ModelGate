# Model Routing Contract

This document describes the current backend-owned model routing surface in ModelGate.

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
- `POST /chat` streaming order is `start -> route -> token* -> done|error`.
- Route metadata surfaces `selectedAlias`, `taskClass`, `fallbackUsed`, `degraded`, `streaming`, and optional decision fields.

## Authority Chain

For chat requests:

1. Validate request contract and block provider override keys.
2. Resolve public alias via `server/src/lib/model-policy.ts`.
3. Resolve backend provider target candidates via `resolveChatModel()` in `server/src/lib/workflow-model-router.ts`.
4. Produce one route decision object in `server/src/lib/routing-authority.ts`.
5. Execute OpenRouter calls with backend-only provider targets.
6. Return bounded route metadata to browser responses/stream events.

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

## Boundary Guarantees

- Browser remains non-authoritative.
- Backend remains the runtime/model-routing authority.
- Approval/write flows remain backend-controlled.
- Fallback/degraded behavior is visible in route metadata and backend logs.
