# ModelGate Routing Matrix

Status: source of truth for browser path, Vercel adapter, and server route ownership.

Security copy:

> GitHub and Matrix are not browser integrations. The console sends governed intent. The backend owns credentials, planning, execution, verification, and sanitized errors.

## Contract

- Browser paths are intent surfaces only.
- Vercel adapters preserve `/api/github/*` and `/api/matrix/*` as backend-owned paths.
- Provider IDs, GitHub tokens, Matrix tokens, admin credentials, and raw upstream errors must not become browser truth.
- Write routes must remain approval-gated and produce execution/verification evidence before the UI treats them as complete.

## Matrix

| Browser Path | Vercel Destination | Adapter | Server Route | Owner | Secrets | Write? |
|---|---|---|---|---|---|---|
| `/api/github/repos` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | no |
| `/api/github/context` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | no |
| `/api/github/actions/propose` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN`, model provider key | no external write; creates review plan |
| `/api/github/actions/:planId/execute` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | yes; approval-gated |
| `/api/github/actions/:planId/verify` | `/api/[...path]?path=:path*` | `api/[...path].ts` | `server/src/routes/github.ts` | backend | `GITHUB_TOKEN` | no external write; verifies receipt |
| `/api/matrix/whoami` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | no |
| `/api/matrix/joined-rooms` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | no |
| `/api/matrix/scope/resolve` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | server snapshot only |
| `/api/matrix/analyze` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN`, model provider key | no external write; creates review plan |
| `/api/matrix/actions/:planId/execute` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | yes; approval-gated |
| `/api/matrix/actions/:planId/verify` | `/api/matrix/[...path]?path=:path*` | `api/matrix/[...path].ts` | `server/src/routes/matrix.ts` | backend | `MATRIX_ACCESS_TOKEN` | no external write; verifies receipt |

## Drift Guards

- Route contract tests live in `server/test/vercel-config.test.ts` and `server/test/vercel-handler.test.ts`.
- Browser upstream boundary tests live in `web/test/browser-upstream-boundary.test.ts`.
- Browser flow tests for console URL state and route ownership copy live in `tests/browser/modelgate.spec.ts`.
