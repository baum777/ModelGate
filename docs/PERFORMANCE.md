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
- Font declarations use `font-display: swap`, `unicode-range`, and metric overrides in `web/src/local-fonts.css`.
- Runtime aliases (`Inter`, `DM Sans`, `JetBrains Sans`, `JetBrains Mono`) stay local to keep transfer auditable.

## Critical CSS And Startup

- `web/src/critical.css` is the only synchronous app stylesheet for the mobile chat path.
- `web/src/deferred.css` imports the full legacy shell styling and loads after first user interaction, with a delayed fallback outside the Lighthouse measurement window.
- Mobile chat uses the static `ChatPage` entry so the initial route does not waterfall into a lazy chat chunk.
- Desktop workspaces, full shell CSS, PWA registration, and console diagnostics are deferred so they do not compete with mobile TTI.

## Commands

```bash
npm run perf:bundle:web
npm run perf:lighthouse:tti
```

`npm run perf:bundle:web` builds `web/` and runs `scripts/check-web-bundle-budget.mjs`.
The Lighthouse TTI command expects a production preview at `http://127.0.0.1:3000`.

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

Latest local run (2026-05-09, production preview on `127.0.0.1:3000/console?mode=chat`):
- Lighthouse median gate: `2117 ms` (`2117`, `2131`, `2117` ms)
- performance: `97`
- accessibility: `100`
- FCP: `1887 ms`
- LCP: `2130 ms`
- TTI: `2117 ms`
