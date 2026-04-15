# Server

Fastify-based backend authority for OpenRouter chat orchestration.

## Scripts

- `npm run dev` - start the server with watch mode
- `npm run build` - compile TypeScript to `dist/`
- `npm run start` - run the compiled server
- `npm run typecheck` - run the TypeScript compiler without emitting
- `npm run test` - run the backend test slice with Node's test runner

## Environment

Copy `.env.example` to `.env` and set `OPENROUTER_API_KEY`.

Required environment variables:

- `OPENROUTER_API_KEY`

Optional environment variables:

- `PORT` - defaults to `8787`
- `HOST` - defaults to `127.0.0.1`
- `OPENROUTER_BASE_URL` - OpenRouter API base URL, defaults to `https://openrouter.ai/api/v1`
- `OPENROUTER_MODEL` - provider execution target for the public default alias
- `OPENROUTER_MODELS` - comma-separated hidden provider fallback pool
- `APP_NAME` - defaults to `local-openrouter-chat`
- `DEFAULT_SYSTEM_PROMPT` - injected server-side before forwarding to OpenRouter
- `CORS_ORIGINS` - comma-separated list of allowed frontend origins
- `LLM_ROUTER_ENABLED` - defaults to `false`; enables the deterministic rules-first router policy
- `LLM_ROUTER_MODE` - currently only `rules_first`
- `LLM_REQUIRE_FREE_MODELS` - defaults to `true`; filters router candidates to free models
- `LLM_MAX_FALLBACKS` - caps fallback attempts after the primary model
- `LLM_ROUTER_FAIL_CLOSED` - defaults to `true`; keeps routing fail-closed when no valid candidate remains
- `LLM_DEFAULT_MODEL` - backend-internal default model used by the router policy
- `LLM_FALLBACK_MODEL` - backend-internal fallback model used by the router policy
- `LLM_MODEL_*` - task-specific backend-internal model ids for the router policy
- `LLM_ROUTER_POLICY_PATH` - repo-root relative YAML policy path, defaults to `config/llm-router.yml`
- `LLM_PROMPT_CLASSIFIER_PATH` - optional override for classification rules
- `LLM_MODEL_MAP_PATH` - optional override for task-to-model mapping
- `LLM_FALLBACK_POLICY_PATH` - optional override for default/fallback policy values
- `LLM_ROUTER_LOG_ENABLED` - surfaced for later append-only local evidence logging
- `LLM_ROUTER_LOG_PATH` - repository-local router decision log path
- `LLM_MODEL_RUN_LOG_PATH` - repository-local model run log path
- `LLM_PROMPT_EVIDENCE_LOG_PATH` - repository-local prompt evidence log path
- `MATRIX_ENABLED` - defaults to `false`; enables the server-owned Matrix read-only routes when `true`
- `MATRIX_REQUIRED` - defaults to `false`; fails startup closed if Matrix is enabled but invalid
- `MATRIX_BASE_URL` - absolute Matrix homeserver origin used by the server when Matrix is enabled
- `MATRIX_ACCESS_TOKEN` - server-side Matrix access token
- `MATRIX_EXPECTED_USER_ID` - optional Matrix user ID that must match `whoami` when set
- `MATRIX_REQUEST_TIMEOUT_MS` - upstream request timeout in milliseconds, defaults to `5000`

## Local Run

```bash
npm install
npm run dev
```

Run the UI separately in another terminal if you are still using the local Vite client.

## HTTP Contract

The backend owns request validation, provider translation, and streaming semantics.

Matrix read-only routes are disabled by default. When disabled, they return
`matrix_not_configured` and leave the chat backend unaffected.

### `GET /health`

Returns backend status and the public default model alias.

### `GET /models`

Returns the backend-owned consumer-selectable model list.
The current branch exposes a single stable alias (`default`) rather than a provider catalog.
The hidden provider fallback pool stays behind the backend contract and is not exposed here.

### `POST /chat`

Request body:

- `messages` required array of message objects
- each message must have `role` of `user` or `assistant`
- each message must have non-empty `content`
- `model` optional stable public alias override of the backend default model
- `temperature` optional number between `0` and `2`
- `stream` optional boolean, defaults to `false`

The backend injects its own system prompt and rejects unknown top-level fields.
`messages` with `role: "system"` are rejected, so there is no merge behavior to infer.
The server-owned `DEFAULT_SYSTEM_PROMPT` is the sole system instruction used for a request.
The backend maps the public alias to an internal logical model and provider target set before calling OpenRouter.

Non-stream response:

```json
{
  "ok": true,
  "model": "default",
  "text": "Hello from the model"
}
```

Invalid request response:

```json
{
  "ok": false,
  "error": {
    "code": "invalid_request",
    "message": "Invalid chat request"
  }
}
```

Upstream/provider failure response:

```json
{
  "ok": false,
  "error": {
    "code": "upstream_error",
    "message": "Chat provider request failed"
  }
}
```

## SSE Contract

When `stream=true`, the backend returns `Content-Type: text/event-stream; charset=utf-8` and frames events in this order:

```text
event: start
data: {"ok":true,"model":"default"}

event: token
data: {"delta":"Hello"}

event: token
data: {"delta":" world"}

event: done
data: {"ok":true,"model":"default","text":"Hello world"}
```

Successful streams emit `start` exactly once, then zero or more `token` events, then exactly one terminal `done`.
`done` and `error` are mutually exclusive terminal events.

On provider failure after the stream has started, the backend emits a sanitized terminal error event:

```text
event: error
data: {"ok":false,"error":{"code":"upstream_error","message":"Chat provider request failed"}}
```

## Matrix Read-Only Contract

These routes are server-owned and fail closed. They do not expose Matrix credentials or raw upstream payloads.

### `GET /api/matrix/whoami`

Returns normalized identity information:

```json
{
  "ok": true,
  "userId": "@user:matrix.org",
  "deviceId": "DEVICEID_OR_NULL",
  "homeserver": "https://matrix.org"
}
```

### `GET /api/matrix/joined-rooms`

Returns normalized joined room metadata:

```json
{
  "ok": true,
  "rooms": [
    {
      "roomId": "!abc:matrix.org",
      "name": "Room name",
      "canonicalAlias": "#room:matrix.org",
      "roomType": "room"
    }
  ]
}
```

### `POST /api/matrix/scope/resolve`

Accepts normalized room and space selections and returns an opaque scope snapshot:

```json
{
  "roomIds": ["!abc:matrix.org"],
  "spaceIds": []
}
```

```json
{
  "ok": true,
  "scope": {
    "scopeId": "opaque-stable-scope-id",
    "type": "room",
    "rooms": [
      {
        "roomId": "!abc:matrix.org",
        "name": "Room name",
        "canonicalAlias": "#room:matrix.org",
        "roomType": "room"
      }
    ],
    "createdAt": "ISO_TIMESTAMP"
  }
}
```

### `GET /api/matrix/scope/:scopeId/summary`

Returns a bounded read-only summary for a cached scope snapshot:

```json
{
  "ok": true,
  "scopeId": "opaque-stable-scope-id",
  "snapshotId": "snapshot-id",
  "generatedAt": "ISO_TIMESTAMP",
  "items": [
    {
      "roomId": "!abc:matrix.org",
      "name": "Room name",
      "canonicalAlias": "#room:matrix.org",
      "members": 1,
      "freshnessMs": 42,
      "lastEventSummary": "Room metadata snapshot with 1 joined members",
      "selected": true
    }
  ]
}
```

### Matrix Error Response

All Matrix errors are normalized as:

```json
{
  "ok": false,
  "error": {
    "code": "matrix_not_configured",
    "message": "Matrix backend is not configured"
  }
}
```

Supported error codes:

- `matrix_not_configured`
- `invalid_request`
- `matrix_unauthorized`
- `matrix_forbidden`
- `matrix_unavailable`
- `matrix_timeout`
- `matrix_malformed_response`
- `matrix_scope_not_found`
- `matrix_internal_error`

## Current Limitations

- No persistence or conversation history storage
- No auth or multi-tenant routing
- No tools/MCP support
- No file upload or RAG
- No multi-provider orchestration
- Stream framing is backend-owned only; the client must treat the SSE response as authoritative
