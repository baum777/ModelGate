# Settings Login Adapter Mapping

This document maps how user-visible login adapters can become usable from Settings without changing the current backend authority model.

## Current Repo Truth

- Browser-owned: rendering, local UI state, stream consumption, and approval intent.
- Backend-owned: authentication checks, session cookies, provider calls, Matrix credentials, GitHub authority, writes, and execution truth.
- Implemented today: admin password login through `/api/auth/login`, session check through `/api/auth/me`, logout through `/api/auth/logout`, backed by an HttpOnly session cookie.
- UI status today: GitHub Workspace uses the admin login gate; Settings only displays identity/truth snapshots and diagnostics.
- Not implemented today: multi-user account identities, OAuth handshakes, Matrix user login from Settings, or provider-specific user credentials in the browser.

## Adapter Model

All Settings login adapters should expose the same browser-safe shape:

| Field | Purpose | Browser-safe rule |
| --- | --- | --- |
| `id` | Stable adapter key, for example `admin`, `github`, `matrix`, `chat` | No secret or provider target |
| `label` | Human-facing adapter name | Public UI copy only |
| `status` | `available`, `connected`, `locked`, `checking`, `unavailable`, `error` | Derived from backend status |
| `primaryAction` | `connect`, `disconnect`, `open`, `retry`, `configure` | UI intent only |
| `safeIdentityLabel` | Display name, public username, or generic connected state | Never token, provider ID, or credential |
| `scopeSummary` | Repo scope, Matrix identity, or backend policy summary | Beginner-safe summary first |
| `expertDetails` | request id, route state, configured flags, diagnostics | Expert-only |
| `requirements` | Missing env/config/session preconditions | No secret values |
| `authority` | Backend route or contract that owns the adapter | Must point to server-owned truth |

Recommended shared frontend type:

```ts
type SettingsLoginAdapter = {
  id: "admin" | "github" | "matrix" | "chat";
  label: string;
  status: "available" | "connected" | "locked" | "checking" | "unavailable" | "error";
  primaryAction: "connect" | "disconnect" | "open" | "retry" | "configure";
  safeIdentityLabel: string;
  scopeSummary: string;
  expertDetails: Array<{ label: string; value: string }>;
  requirements: string[];
  authority: string;
};
```

## Adapter Mapping

| Adapter | Settings CTA | Backend authority | Beginner display | Expert display | Next implementation slice |
| --- | --- | --- | --- | --- | --- |
| Admin session | `Anmelden` / `Abmelden` | `/api/auth/login`, `/api/auth/me`, `/api/auth/logout` | `Angemeldet` or `Gesperrt`; password form inside Settings | cookie readiness, auth errors, rate-limit state | Move the existing GitHub admin login gate into a reusable Settings adapter card while keeping GitHub gated. |
| GitHub | `GitHub öffnen` or `Session prüfen` | Existing GitHub backend routes plus admin session cookie | `Bereit`, `Gesperrt`, or `Nicht konfiguriert`; no token text | repo count, selected repo, proposal/execute route state | Treat GitHub as a consumer of the admin session first; later add OAuth only if backend routes own the handshake. |
| Matrix | `Matrix prüfen` | `/api/matrix/whoami`, Matrix backend config, Matrix action routes | Matrix identity label or `Nicht verfügbar`; no homeserver/token details in Beginner | homeserver label, configured flag, scope/provenance status | Add a Settings read-only Matrix identity card; login remains server-configured until backend implements a credential flow. |
| Chat / model access | `Verbindung prüfen` | `/health`, `/models`, `/chat` | backend health and public model alias | routing mode, fallback, public alias registry | Keep as status-only adapter; no user credential flow belongs in the browser. |

## Settings IA

Beginner mode should show one compact `Zugänge` section:

1. Primary account card: Admin session status and one action.
2. Work adapters: GitHub, Matrix, Chat as short rows with status and one CTA.
3. A single helper CTA: `Was bedeutet das?`, opening the Settings guide.

Expert mode can add:

- adapter authority route,
- configured/readiness flags,
- rate-limit/auth error code,
- selected repo/scope summaries,
- latest safe diagnostic timestamp.

## Mode-Specific Adapter Behavior

The Beginner / Expert toggle must change how adapter work is guided, not which authority boundary is used.

| Adapter action | Beginner | Expert |
| --- | --- | --- |
| Connect / login | one primary CTA with a short explanation of what becomes available | backend route, cookie/session status, configuration readiness, and last safe error |
| Check GitHub | guided "GitHub öffnen" or "Repo analysieren" after session is valid | repo, branch, proposal, execute, verify, and auth gate details |
| Check Matrix | guided identity/status check and room-safe action | Matrix identity, homeserver label, scope, provenance, topic-access, and route status |
| Check Chat/model access | health and public alias summary | routing mode, fallback, diagnostics, and public alias registry |
| Disconnect | plain "Abmelden" with consequence text | logout route, session invalidation status, and affected adapters |

Beginner must never expose extra write power. Expert may expose more controls and diagnostics, but the same approval and backend authority gates remain binding.

## Login Flow Boundaries

The Settings UI may:

- submit a password to `/api/auth/login`,
- call `/api/auth/me` to refresh state,
- call `/api/auth/logout`,
- request backend-owned GitHub/Matrix status checks,
- display safe identity and scope summaries.

The Settings UI must not:

- store Matrix credentials, GitHub tokens, provider keys, or OAuth tokens,
- infer backend-fresh truth from restored local state,
- bypass GitHub or Matrix approval gates,
- display provider IDs or raw route targets as UI truth,
- treat a visible adapter row as a write-capability grant.

## Implementation Gates

1. Extract the current GitHub admin login state into a neutral `authSession` state name in `App`.
2. Add a pure adapter view-model builder, for example `deriveSettingsLoginAdapters(...)`.
3. Render `SettingsWorkspace` access cards from that view model.
4. Keep GitHub Workspace locked until `authSession.status === "authenticated"`.
5. Add tests for locked, authenticated, unavailable, and logout states.

## Validation Expectations

- Docs-only mapping: review diff and confirm no runtime claims exceed current repo truth.
- UI implementation slice: `npm run typecheck:web`, `npm run test:web`, `npm run test:browser`.
- Backend auth route changes, if introduced later: include server auth tests and full `npm test`.
