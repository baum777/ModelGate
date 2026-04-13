# ModelGate

Local OpenRouter proxy plus chat UI.

The backend contract and SSE framing used by the UI branch are documented in [`server/README.md`](server/README.md).

## Structure

- `server/` - Fastify proxy for health, models, and chat streaming
- `web/` - Vite + React chat client

## Setup

1. Install dependencies:

```bash
npm install
```

2. Copy `server/.env.example` to `server/.env` and set `OPENROUTER_API_KEY`.

3. Copy `web/.env.example` to `web/.env` if you want to override the backend URL.

## Run

```bash
npm run dev:server
```

In another terminal:

```bash
npm run dev:web
```

## Verify

- `GET http://127.0.0.1:8787/health`
- `GET http://127.0.0.1:8787/models`
- `POST http://127.0.0.1:8787/chat`
