# Model Routing Contract

This document describes the current backend-owned model routing surface in ModelGate.

## Objective

- Keep model selection server-side.
- Allow the frontend to request workflow intent, not provider targets.
- Preserve fail-closed behavior for malformed or missing structured output.
- Keep execute paths approval-gated and non-model-driven.

## Current Truth

- `GET /models` exposes only the public alias list. It does not expose provider IDs.
- Chat continues to use backend-owned routing and the existing OpenRouter policy layer.
- GitHub proposal planning is backend-owned and now resolves its model through workflow policy.
- Matrix analyze remains deterministic in this slice. The workflow model env is parsed and policy-resolved, but Matrix execute/write behavior is still not model-driven.
- Approval-gated GitHub and Matrix writes stay server-side.

## Configuration Contract

### Environment

The server reads backend-only env vars for both legacy OpenRouter compatibility and workflow-specific routing.

- `OPENROUTER_MODEL` is a legacy compatibility slot for the chat provider target.
- `OPENROUTER_MODELS` is the hidden provider target pool behind the public alias.
- `CHAT_MODEL` is the explicit backend-owned chat workflow model.
- `CODE_AGENT_MODEL` is the proposal-planning model for GitHub workflows.
- `STRUCTURED_PLAN_MODEL` is the structured-output model for schema-critical plan objects.
- `MATRIX_ANALYZE_MODEL` is parsed for Matrix analysis policy, but Matrix analyze remains deterministic in this slice.
- `FAST_FALLBACK_MODEL` and `DIALOG_FALLBACK_MODEL` are backend-owned fallback slots.
- `MODEL_ROUTING_MODE=policy` is the only supported workflow routing mode.
- `ALLOW_MODEL_FALLBACK=true` allows fallback on non-execute phases only.
- `MODEL_ROUTING_FAIL_CLOSED=true` keeps missing or malformed routing closed.
- `MODEL_ROUTING_LOG_ENABLED` and `MODEL_ROUTING_LOG_PATH` enable local workflow routing evidence logs.

Matrix workflow booleans are parsed as contract inputs:

- `MATRIX_ANALYZE_LLM_ENABLED`
- `MATRIX_EXECUTE_APPROVAL_REQUIRED`
- `MATRIX_VERIFY_AFTER_EXECUTE`
- `MATRIX_ALLOWED_ACTION_TYPES`
- `MATRIX_FAIL_CLOSED`

### `config/model-capabilities.yml`

The backend loads `config/model-capabilities.yml` at runtime. It is not docs-only.

- Each role section is validated on startup/first load.
- The file describes purpose, strengths, best practices, structured-output requirements, approval requirements, and fallback links.
- `global_policy` describes the frontend boundary and execute restrictions.

## Runtime Routing

### Chat

- The frontend can request the public alias `default`.
- The backend resolves the actual provider target set.
- `CHAT_MODEL` is preferred when set.
- `OPENROUTER_MODEL` remains available for backward compatibility.
- Hidden provider targets stay server-side.

### GitHub proposal planning

- GitHub proposal generation is routed through `CODE_AGENT_MODEL` by default.
- Structured output is validated after model response parsing.
- The model can propose only. It does not write repos directly.
- Fallback is allowed only before execute, never during execute.

### Structured plan objects

- `STRUCTURED_PLAN_MODEL` is available for schema-critical structured objects.
- If the primary structured model is missing, the policy falls back to `CODE_AGENT_MODEL`, then to the backend safe default chain when fallback is enabled.
- Malformed structured output fails closed.

### Matrix analyze

- The `MATRIX_ANALYZE_MODEL` env is parsed and policy-resolved.
- The current Matrix analyze route still behaves deterministically.
- Matrix execute and verify remain backend-owned and approval-gated.

## Frontend Boundary

- The frontend may not set privileged provider targets.
- `assertNoFrontendProviderModelOverride()` blocks provider-target override fields.
- The browser should only see public aliases and backend-returned workflow results.

## Safety Gates

- Structured output validation is required for workflow policy paths that need it.
- Execute paths must not silently fallback.
- Malformed structured output fails closed.
- Approval remains backend-owned for GitHub and Matrix writes.
- The server never exposes raw secret values through model routing responses.

## Known Gaps

- Matrix analyze remains deterministic in this slice.
- The Matrix workflow env is parsed, but the repo does not yet use the new Matrix routing policy keys to drive a model-backed analyze/execute split.
- The workflow routing log is local and advisory only.
