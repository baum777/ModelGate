# Performance

## Bundle Size Criteria

- Measurement scope: aggregated initial JS/CSS assets referenced synchronously from `web/dist/index.html`
- Included tags: `<script src="/assets/*.js">` and `<link rel="stylesheet" href="/assets/*.css">`
- Gate (must pass together):
  - `totalBrotli <= 150 KiB` (primary)
  - `totalGzip <= 160 KiB` (failsafe)
- External script/stylesheet URLs are treated as a failure.

Rationale:
- User-facing transfer cost is compression-based, not raw bytes.
- Aggregated critical-path transfer is the relevant proxy, not per-file limits.
- Brotli tracks modern delivery, gzip protects compatibility paths.

## Font Strategy

- Fonts are self-hosted under `web/public/fonts/`.
- External Google Fonts requests are removed from `web/index.html`.
- Font declarations use `font-display: swap` to avoid blocking first render.
- Runtime aliases (`Inter`, `DM Sans`, `JetBrains Sans`, `JetBrains Mono`) are served locally via `web/src/local-fonts.css`.

## Commands

```bash
npm run perf:bundle:web
```

This command builds `web/` and runs `scripts/check-web-bundle-budget.mjs`.

## Lighthouse 3G Runbook

```bash
npx lighthouse http://localhost:3000 \
  --preset=mobile \
  --throttling-method=devtools \
  --throttling.cpuSlowdownMultiplier=4 \
  --only-categories=performance,accessibility \
  --output=json --output-path=docs/lighthouse-report.json
```

Target thresholds:
- performance `>= 90`
- accessibility `>= 90`
- Time to Interactive `<= 2.5s`
