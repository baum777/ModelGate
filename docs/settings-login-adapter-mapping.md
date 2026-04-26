# Settings Login Adapter Mapping

This document maps the browser-safe access adapters in Settings for the open-source local ModelGate console.

## Current Repo Truth

- Browser-owned: rendering, local UI state, stream consumption, and approval intent.
- Backend-owned: authentication checks, session cookies, provider calls, Matrix credentials, GitHub authority, writes, and execution truth.
- Implemented today: Chat uses public model aliases and backend-owned local provider keys; GitHub uses backend GitHub configuration; Matrix uses backend Matrix configuration.
- UI status today: GitHub, Matrix, and Chat are visible as separate access adapters. The browser opens each workspace only through backend-owned routes and never stores account secrets.
- Not implemented today: multi-user account identities, OAuth handshakes, Matrix user login from Settings, or provider-specific user credentials in the browser.
- Legacy auth routes may remain server-side for compatibility, but the browser UI no longer uses a global admin login gate.

## Adapter Model

All Settings login adapters should expose the same browser-safe shape:

| Field | Purpose | Browser-safe rule |
| --- | --- | --- |
| `id` | Stable adapter key: `github`, `matrix`, or `chat` | No secret or provider target |
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
  id: "github" | "matrix" | "chat";
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
| GitHub | `GitHub öffnen` or `Server konfigurieren` | Existing GitHub backend routes and backend GitHub account/token configuration | `Bereit` or `Nicht konfiguriert`; no token text | configured/ready flags, selected repo, proposal/execute route state | Keep the browser free of GitHub tokens; account authority remains backend-owned. |
| Matrix | `Matrix prüfen` | `/api/matrix/whoami`, Matrix backend config, Matrix action routes | Matrix identity label or `Nicht verfügbar`; no homeserver/token details in Beginner | homeserver label, configured flag, scope/provenance status | Add a Settings read-only Matrix identity card; login remains server-configured until backend implements a credential flow. |
| Chat / model access | `Verbindung prüfen` | `/health`, `/models`, `/chat` | backend health and public model alias | routing mode, fallback, public alias registry | Keep as status-only adapter; local keys stay backend-side and only aliases are public. |

## Settings IA

Beginner mode should show one compact `Zugänge` section:

1. Work adapters: GitHub, Matrix, Chat as short rows with status and one CTA.
2. A single helper CTA: `Was bedeutet das?`, opening the Settings guide.

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
| Connect / login | open the configured workspace, or show server configuration requirements | backend route, configured/readiness flags, and last safe error |
| Check GitHub | guided "GitHub öffnen" or "Repo analysieren" after backend GitHub config is ready | repo, branch, proposal, execute, verify, and GitHub route details |
| Check Matrix | guided identity/status check and room-safe action | Matrix identity, homeserver label, scope, provenance, topic-access, and route status |
| Check Chat/model access | health and public alias summary | routing mode, fallback, diagnostics, and public alias registry |
| Disconnect | not shown for server-configured adapters | future account-specific logout route only if backend implements it |

Beginner must never expose extra write power. Expert may expose more controls and diagnostics, but the same approval and backend authority gates remain binding.

## Login Flow Boundaries

The Settings UI may:

- request backend-owned GitHub/Matrix status checks,
- display safe identity and scope summaries.

The Settings UI must not:

- store Matrix credentials, GitHub tokens, provider keys, or OAuth tokens,
- infer backend-fresh truth from restored local state,
- bypass GitHub or Matrix approval gates,
- require or display a global admin login to unlock GitHub,
- display provider IDs or raw route targets as UI truth,
- treat a visible adapter row as a write-capability grant.

## Implementation Gates

1. Keep `deriveSettingsLoginAdapters(...)` as the pure adapter view-model builder.
2. Render `SettingsWorkspace` access cards from that view model.
3. Keep GitHub, Matrix, and Chat credentials backend-owned.
4. Add tests for configured, unavailable, and browser-safe adapter states.

## Validation Expectations

- Docs-only mapping: review diff and confirm no runtime claims exceed current repo truth.
- UI implementation slice: `npm run typecheck:web`, `npm run test:web`, `npm run test:browser`.
- Backend auth route changes, if introduced later: include server auth tests and full `npm test`.
