# ModelGate Operating Contract

This repo is a backend-first console overlay.

## Authority

- Backend owns provider calls, SSE framing, model routing, and execution truth
- Browser owns rendering, local UI state, stream consumption, and approval intent
- Matrix is an external contract surface unless the server explicitly implements it here

## Hard Rules

- Never expose provider IDs as UI truth
- Never hold Matrix credentials in the browser
- Never treat restored local state as backend-fresh truth
- Never silently repair malformed SSE or Matrix responses
- Never allow browser writes to bypass backend approval gating

## Working Rules

- Prefer small, reviewable slices
- Keep consumer UI thin and deterministic
- Record when a surface is implemented, contract-only, or missing
- Fail closed on ambiguous or partial state

