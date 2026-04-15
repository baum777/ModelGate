# Sovereign Console Implementation Plan

## Objective

Deliver a thin console overlay that makes backend authority visible, keeps SSE chat deterministic, and keeps Matrix in an external-contract overlay.

## Current Truth

- Chat backend authority already exists in `server/src/routes/chat.ts`
- `/health` and `/models` are implemented backend seams
- Matrix remains a browser-side overlay against an external backend contract

## Gaps

- no local Matrix backend implementation in this repo
- no repo-local Codex intake contract
- no browser-side persistence contract for approved writes

## Next Slices

1. Shell and header truth
2. Chat stream reducer and malformed-stream visibility
3. Matrix explore/analyze/review contract overlay
4. docs and test coverage for state transitions

## Acceptance Criteria

- backend health and public model alias are visible in the header
- chat finalizes exactly one mutable assistant draft on `done`
- malformed SSE is visible, not auto-repaired
- Matrix review stays approval-gated and fail-closed

