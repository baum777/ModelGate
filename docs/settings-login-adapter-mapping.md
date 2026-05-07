# Settings Login Adapter Mapping

This document maps the browser-safe access adapters in Settings for the open-source local MosaicStack console.

## Current Repo Truth

- Browser-owned: rendering, local UI state, stream consumption, and approval intent.
- Backend-owned: authentication checks, session cookies, provider calls, Matrix credentials, GitHub authority, writes, and execution truth.
- Implemented today: Settings exposes backend-owned GitHub and Matrix connect CTAs with server-owned live callback handling, durable encrypted credential storage, session-bound receipts, and sanitized status via `/api/integrations/status`.
- UI status today: GitHub and Matrix are rendered as integration cards with `Connect/Reconnect/Disconnect/Reverify`, credential source, and capability summaries.
- Fallback behavior: when provider OAuth/SSO server config is missing or partial, connect and callback routes fail closed instead of creating local stub receipts.
- Legacy auth routes may remain server-side for compatibility, but the browser UI no longer uses a global admin login gate.

## Adapter Model

All Settings login adapters should expose the same browser-safe shape:

| Field | Purpose | Browser-safe rule |
| --- | --- | --- |
| `id` | Stable adapter key: `github` or `matrix` | No secret or provider target |
| `label` | Human-facing adapter name | Public UI copy only |
| `status` | integration status from `/api/integrations/status` (`connect_available`, `connected`, `missing_server_config`, etc.) | Derived from backend status |
| `authState` | backend auth posture (`user_connected`, legacy `user_connected_stub`, `auth_expired`, `not_configured`, `error`, `not_connected`) | Backend truth only; no secret material |
| `primaryAction` | `connect`, `reconnect`, `disconnect`, `reverify` | UI intent only |
| `secondaryAction` | optional second CTA (`disconnect` for connected states) | UI intent only |
| `credentialSource` | `instance_configured`, `user_connected`, legacy `user_connected_stub`, `not_connected` | Source transparency only; no secret material |
| `safeIdentityLabel` | Display name, public username, or generic connected state | Never token, provider ID, or credential |
| `scopeSummary` | Repo scope, Matrix identity, or backend policy summary | Beginner-safe summary first |
| `expertDetails` | request id, route state, configured flags, diagnostics | Expert-only |
| `requirements` | Missing env/config/session preconditions | No secret values |
| `authority` | Backend route or contract that owns the adapter | Must point to server-owned truth |

Recommended shared frontend type:

```ts
type SettingsLoginAdapter = {
  id: "github" | "matrix";
  label: string;
  status: IntegrationConnectionStatus | "checking";
  authState?: "user_connected" | "user_connected_stub" | "auth_expired" | "not_configured" | "error" | "not_connected";
  primaryAction: "connect" | "reconnect" | "disconnect" | "reverify";
  secondaryAction: "disconnect" | null;
  credentialSource: "instance_configured" | "user_connected" | "user_connected_stub" | "not_connected";
  safeIdentityLabel: string;
  scopeSummary: string;
  expertDetails: Array<{ label: string; value: string }>;
  requirements: string[];
  authority: string;
};
```

## Adapter Mapping

| Adapter | Settings CTA | Backend authority | Beginner display | Expert display | Current slice note |
| --- | --- | --- | --- | --- | --- |
| GitHub | `Connect` / `Reconnect` / `Disconnect` / `Reverify` | `/api/auth/github/*`, `/api/github/*`, `/api/integrations/status` | safe identity + scope summary | credential source, capability vector, last verified, last error | Live OAuth callback exchange is required; missing or partial server config fails closed. |
| Matrix | `Connect` / `Reconnect` / `Disconnect` / `Reverify` | `/api/auth/matrix/*`, `/api/matrix/*`, `/api/integrations/status` | safe identity + scope summary | homeserver, room access posture, capability vector, last verified | Live SSO login-token exchange is required; missing or partial server config fails closed. |

## Settings IA

Beginner mode should show one compact `Zugänge` section:

1. Integration adapters: GitHub and Matrix as short rows with status and governed CTAs.
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
| Connect / reconnect | starts `/api/auth/{provider}/start` with allowlisted `returnTo` | shows route authority, credential source, and last safe error |
| Reverify | calls `/api/auth/{provider}/reverify` and refreshes sanitized status | same, with deterministic timestamp refresh |
| Disconnect | calls `/api/auth/{provider}/disconnect` and preserves instance-level credentials | same, with explicit credential-source change visibility |

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
2. Render `SettingsWorkspace` integration cards from that view model.
3. Keep GitHub and Matrix credentials backend-owned.
4. Keep `/api/integrations/status` sanitized (no provider IDs/tokens/raw upstream errors).
5. Add tests for connect/reconnect/disconnect/reverify actions and browser-safe adapter states.

## Validation Expectations

- Docs-only mapping: review diff and confirm no runtime claims exceed current repo truth.
- UI implementation slice: `npm run typecheck:web`, `npm run test:web`, `npm run test:browser`.
- Backend auth route changes, if introduced later: include server auth tests and full `npm test`.
- Integration auth key-rotation gate (opt-in live): `npm run test:integration-auth-rotation-live` with explicit live env only.
- Matrix integration auth key-rotation gate (opt-in live): `npm run test:integration-auth-rotation-live:matrix` with explicit live env only.
