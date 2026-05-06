# Console Overlay Project

## Objective

Maintain `MosaicStack` as a backend-first console overlay with explicit authority separation between backend execution truth and browser rendering.

## Scope

- chat, GitHub workspace, and Matrix workspace console surfaces
- backend-owned routing and provider abstraction
- approval-gated write flows

## Current Status

- active
- core backend/browser split is documented and partially verified locally
- some Matrix browser views remain advisory or only partially wired

## Next Gates

- keep stable docs aligned with real backend capabilities
- tighten evidence boundaries for Matrix and review flows
- add new stable notes only when behavior changes materially
