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
- Font declarations use `font-display: swap` and `unicode-range` in `web/src/local-fonts.css`.
- Runtime aliases (`Inter`, `DM Sans`, `JetBrains Sans`, `JetBrains Mono`) stay local to keep transfer auditable.

## Commands

```bash
npm run perf:bundle:web
```

This command builds `web/` and runs `scripts/check-web-bundle-budget.mjs`.

## Lighthouse 3G Runbook

```bash
CHROME_PATH=/home/baum/.cache/ms-playwright/chromium-1217/chrome-linux64/chrome \
npx lighthouse http://127.0.0.1:3000 \
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

Latest local run (2026-05-09, production preview on `127.0.0.1:3000`):
- performance: `92`
- accessibility: `96`
- TTI: `2777 ms`
