# Performance

## Bundle Size Criteria

- Measurement scope: aggregated web transfer budget from `web/dist/index.html`:
  - Sync assets: `<script src="/assets/*.js">` + `<link rel="stylesheet" href="/assets/*.css">`
  - Module preloads: `<link rel="modulepreload" href="/assets/*.js">`
- Gate (must pass together, based on combined unique assets):
  - `combinedBrotli <= 160 KiB` (primary)
  - `combinedGzip <= 180 KiB` (failsafe)
- External script/stylesheet/modulepreload URLs are treated as a failure.

Rationale:
- User-facing transfer cost is compression-based, not raw bytes.
- Aggregated critical-path transfer (including module preloads) is the relevant proxy, not per-file limits.
- Brotli tracks modern delivery, gzip protects compatibility paths.

## Font Strategy

- Fonts are self-hosted under `web/public/fonts/`.
- External Google Fonts requests are removed from `web/index.html`.
- Runtime font files use local latin `woff2` files:
  - `web/public/fonts/inter-latin.woff2`
  - `web/public/fonts/jetbrains-mono-latin.woff2`
- Font declarations use `font-display: swap`, `unicode-range`, and metric overrides in `web/public/local-fonts.css`.
- Runtime aliases (`Inter`, `DM Sans`, `JetBrains Sans`, `JetBrains Mono`) stay local to keep transfer auditable.
- Font CSS is loaded by the non-critical startup path in `web/src/main.tsx`, so fonts remain local without blocking mobile chat TTI.

## Critical CSS And Startup

- `web/src/critical.css` is the only synchronous app stylesheet for the mobile chat path.
- `web/src/deferred.css` imports the full legacy shell styling and loads after first user interaction, with a delayed fallback outside the Lighthouse measurement window.
- Mobile chat uses the static `ChatPage` entry so the initial route does not waterfall into a lazy chat chunk.
- Desktop workspaces, full shell CSS, PWA registration, and console diagnostics are deferred so they do not compete with mobile TTI.

## Phase 2 GitHub Surface Guardrails

- Mobile GitHub review UI enters through `web/src/pages/GitHubPage.tsx` and is loaded with `React.lazy()` from `web/src/App.tsx`.
- `GitHubPage`, `FileTree`, `DiffViewer`, and risk markers must not be imported at the top level of `App.tsx` or `ChatPage.tsx`.
- The lazy GitHub page chunk is excluded from Vite modulepreload policy; it must not compete with the mobile chat critical path on 3G.
- GitHub-specific mobile styles are served as `web/public/github-mobile.css` and injected only when the mobile GitHub tab is activated.
- The lazy loader waits for `/github-mobile.css` before resolving `GitHubPage`, preventing unstyled GitHub content during fast tab switches.
- GitHub data in this slice is mock review data loaded after mount; browser state remains a review surface and does not become backend execution truth.
- Top-level favicon uses the existing lightweight SVG (`/icons/favicon.svg`) instead of the legacy transparent ICO to avoid unnecessary first-run transfer.

## Phase 3 Matrix Surface Guardrails

- Mobile Matrix knowledge UI enters through `web/src/pages/MatrixPage.tsx` and is loaded with `React.lazy()` from `web/src/App.tsx`.
- `MatrixPage`, `KnowledgeMap`, `TopicCard`, `ProvenancePanel`, and Matrix risk markers must not be imported at the top level of `App.tsx` or `ChatPage.tsx`.
- The lazy Matrix page chunk is excluded from Vite modulepreload policy; it must not compete with the mobile chat critical path on 3G.
- Matrix-specific mobile styles are served as `web/public/matrix-mobile.css` and injected only when the mobile Matrix tab is activated.
- The lazy loader waits for `/matrix-mobile.css` before resolving `MatrixPage`, preventing unstyled Matrix content during fast tab switches.
- Matrix mobile controls are excluded from the global deferred button retheme in `web/src/ui-adaptation.css`, so feature-scoped button colors remain stable after `deferred.css` loads.
- Matrix data in this slice is mock read-only knowledge: browser state is advisory, credentials remain backend-owned, and malformed or partial Matrix state remains fail-closed.

## Commands

```bash
npm run perf:bundle:web
npm run perf:lighthouse:tti
```

`npm run perf:bundle:web` builds `web/` and runs `scripts/check-web-bundle-budget.mjs`.
The Lighthouse TTI command expects a production preview at `http://127.0.0.1:3000` by default. Use `LIGHTHOUSE_URL=... npm run perf:lighthouse:tti` when the preview binds a different local port.

## Lighthouse 3G Runbook

```bash
CHROME_PATH=/home/baum/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
npx lighthouse "http://127.0.0.1:3000/console?mode=chat" \
  --preset=perf \
  --form-factor=mobile \
  --throttling-method=devtools \
  --throttling.cpuSlowdownMultiplier=4 \
  --chrome-flags="--no-sandbox --disable-gpu --headless=new --disable-dev-shm-usage" \
  --only-categories=performance,accessibility \
  --output=json --output-path=docs/lighthouse-report.json
```

Target thresholds:
- performance `>= 90`
- accessibility `>= 90`
- Time to Interactive `<= 2.5s`
- median TTI gate: `<= 2600 ms` across 3 runs

Latest local run (2026-05-09, production preview on `127.0.0.1:3001/console?mode=chat`):
- Lighthouse median gate: `2081 ms` (`2081`, `2053`, `2084` ms)
- performance: `98`
- accessibility: `100`
- FCP: `1860 ms`
- LCP: `2093 ms`
- TTI: `2081 ms`
- Bundle gate: `101.99 KiB gzip`, `87.77 KiB brotli` combined initial load
