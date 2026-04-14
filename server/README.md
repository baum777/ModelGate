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
- `OPENROUTER_MODEL` - provider execution target for the public default alias
- `OPENROUTER_MODELS` - comma-separated hidden provider fallback pool
- `APP_NAME` - defaults to `local-openrouter-chat`
- `DEFAULT_SYSTEM_PROMPT` - injected server-side before forwarding to OpenRouter
- `CORS_ORIGINS` - comma-separated list of allowed frontend origins

## Local Run

```bash
npm install
npm run dev
```

Run the UI separately in another terminal if you are still using the local Vite client.

## HTTP Contract

The backend owns request validation, provider translation, and streaming semantics.

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

## Current Limitations

- No persistence or conversation history storage
- No auth or multi-tenant routing
- No tools/MCP support
- No file upload or RAG
- No multi-provider orchestration
- Stream framing is backend-owned only; the client must treat the SSE response as authoritative
