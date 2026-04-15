# Sovereign Console / Stitch v1

## Status Ledger

- Implemented: backend health, public model alias, SSE chat consumption, thin shell tabs, reducer-driven chat state, Matrix overlay mode switching
- Contract-only: Matrix `/api/matrix/*` endpoints, provenance payload shape, execution verification payload shape
- Missing: local Matrix backend implementation in this repo, repository-local intake contract, browser-side write authority

## UI Boundaries

- `Chat` is a consumer surface for backend-owned SSE
- `Matrix Workspace` is a fail-closed contract overlay for Explore, Analyze, and Review
- restored local state is visible, but it is never backend truth

## Non-Goals

- multi-device sync
- bulk queues
- provider routing in the browser
- direct Matrix writes from the frontend
- silent repair of malformed streams

