import assert from "node:assert/strict";
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from "node:fs";
import path from "node:path";
import os from "node:os";
import test from "node:test";
import { createTestEnv } from "../test-support/helpers.js";
import {
  assertExecuteFallbackBlocked,
  assertNoFrontendProviderModelOverride,
  assertStructuredOutputIfRequired,
  loadModelCapabilitiesConfig,
  resolveChatModel,
  resolveGitHubProposalModel,
  resolveMatrixAnalyzeModel,
  resolveStructuredPlanModel
} from "../src/lib/workflow-model-router.js";

function createTempRepo() {
  return mkdtempSync(path.join(os.tmpdir(), "mosaicstack-model-capabilities-"));
}

test("model capabilities config loads the runtime contract", () => {
  const config = loadModelCapabilitiesConfig();

  assert.equal(config.models.chat_primary.model_env, "CHAT_MODEL");
  assert.equal(config.models.github_code_agent.model_env, "CODE_AGENT_MODEL");
  assert.equal(config.global_policy.frontend_may_select_provider_model, false);
  assert.equal(config.global_policy.require_approval_before_execute, true);
});

test("model capabilities config fails closed when the config file is missing", () => {
  const repoRoot = createTempRepo();

  assert.throws(
    () => loadModelCapabilitiesConfig({ repoRoot }),
    /Model capabilities config file not found/
  );

  rmSync(repoRoot, { recursive: true, force: true });
});

test("model capabilities config fails clearly when required sections are invalid", () => {
  const repoRoot = createTempRepo();
  const configDir = path.join(repoRoot, "config");
  mkdirSync(configDir, { recursive: true });
  writeFileSync(path.join(configDir, "model-capabilities.yml"), [
    "models:",
    "  chat_primary:",
    "    model_env: CHAT_MODEL",
    "    recommended_model: google/gemma-4-31b-it:free",
    "    purpose: [chat]",
    "    strengths: [long_context]",
    "    best_practices: [keep_tool_execution_backend_owned]",
    "    structured_output_required: false",
    "    approval_required: false",
    "    may_execute_external_tools: false",
    "    may_write_external_state: false",
    "    fallback_env: DIALOG_FALLBACK_MODEL",
    "global_policy:",
    "  frontend_may_request_workflow: true",
    "  frontend_may_select_provider_model: false",
    "  require_backend_owned_model_resolution: true",
    "  require_schema_validation_for_privileged_paths: true",
    "  require_approval_before_execute: true",
    "  allow_fallback_on_execute: false",
    "  fail_closed_on_malformed_output: true",
    "  fail_closed_on_unknown_action_type: true"
  ].join("\n"));

  assert.throws(
    () => loadModelCapabilitiesConfig({ repoRoot }),
    /Model capabilities config at .* is invalid/
  );

  rmSync(repoRoot, { recursive: true, force: true });
});

test("chat routing resolves the explicit chat model and preserves backend-owned fallback metadata", () => {
  const env = createTestEnv({
    CHAT_MODEL: "google/gemma-4-31b-it:free",
    OPENROUTER_MODEL: "default",
    OPENROUTER_MODELS: ["hidden-provider-a:free"]
  });
  const config = loadModelCapabilitiesConfig();

  const policy = resolveChatModel(env, config);

  assert.equal(policy.selectedModel, "google/gemma-4-31b-it:free");
  assert.equal(policy.fallbackUsed, false);
  assert.equal(policy.approvalRequired, false);
  assert.equal(policy.structuredOutputRequired, false);
  assert.equal(policy.candidateModels[0], "google/gemma-4-31b-it:free");
});

test("chat routing remains backward compatible with the legacy OPENROUTER_MODEL slot", () => {
  const env = createTestEnv({
    CHAT_MODEL: "",
    OPENROUTER_MODEL: "openrouter/auto"
  });
  const config = loadModelCapabilitiesConfig();

  const policy = resolveChatModel(env, config);

  assert.equal(policy.selectedModel, "openrouter/auto");
  assert.equal(policy.selectionSource, "legacy_openrouter_model");
  assert.equal(policy.fallbackUsed, false);
});

test("github proposal routing prefers CODE_AGENT_MODEL", () => {
  const env = createTestEnv({
    CODE_AGENT_MODEL: "qwen/qwen3-coder:free",
    FAST_FALLBACK_MODEL: "qwen/qwen3-next-80b-a3b-instruct:free"
  });
  const config = loadModelCapabilitiesConfig();

  const policy = resolveGitHubProposalModel(env, config);

  assert.equal(policy.selectedModel, "qwen/qwen3-coder:free");
  assert.equal(policy.candidateModels[0], "qwen/qwen3-coder:free");
  assert.equal(policy.approvalRequired, true);
  assert.equal(policy.structuredOutputRequired, true);
});

test("structured plan routing prefers STRUCTURED_PLAN_MODEL and falls back to CODE_AGENT_MODEL when unset", () => {
  const config = loadModelCapabilitiesConfig();
  const fallbackEnv = createTestEnv({
    STRUCTURED_PLAN_MODEL: "",
    CODE_AGENT_MODEL: "qwen/qwen3-coder:free"
  });

  const fallbackPolicy = resolveStructuredPlanModel(fallbackEnv, config);

  assert.equal(fallbackPolicy.selectedModel, "qwen/qwen3-coder:free");
  assert.equal(fallbackPolicy.fallbackUsed, true);
  assert.equal(fallbackPolicy.selectionSource, "fallback_env");

  const primaryEnv = createTestEnv({
    STRUCTURED_PLAN_MODEL: "openai/gpt-oss-120b:free",
    CODE_AGENT_MODEL: "qwen/qwen3-coder:free"
  });
  const primaryPolicy = resolveStructuredPlanModel(primaryEnv, config);

  assert.equal(primaryPolicy.selectedModel, "openai/gpt-oss-120b:free");
  assert.equal(primaryPolicy.fallbackUsed, false);
  assert.equal(primaryPolicy.candidateModels[0], "openai/gpt-oss-120b:free");
});

test("matrix analyze routing reads MATRIX_ANALYZE_MODEL", () => {
  const env = createTestEnv({
    MATRIX_ANALYZE_MODEL: "nvidia/nemotron-3-super-120b-a12b:free"
  });
  const config = loadModelCapabilitiesConfig();

  const policy = resolveMatrixAnalyzeModel(env, config);

  assert.equal(policy.selectedModel, "nvidia/nemotron-3-super-120b-a12b:free");
  assert.equal(policy.structuredOutputRequired, true);
  assert.equal(policy.approvalRequired, true);
});

test("frontend provider model overrides are rejected", () => {
  assert.throws(
    () => assertNoFrontendProviderModelOverride({
      providerModel: "qwen/qwen3-coder:free"
    }),
    /privileged provider model overrides/
  );
});

test("structured outputs fail closed when malformed", () => {
  const env = createTestEnv({
    STRUCTURED_PLAN_MODEL: "openai/gpt-oss-120b:free"
  });
  const config = loadModelCapabilitiesConfig();
  const policy = resolveStructuredPlanModel(env, config);

  assert.throws(
    () => assertStructuredOutputIfRequired(policy, "not-json"),
    /requires structured JSON output/
  );
});

test("execute paths do not silently fallback", () => {
  assert.throws(
    () => assertExecuteFallbackBlocked({
      workflow: "github_code_agent",
      fallbackUsed: true,
      allowFallbackOnExecute: false
    }),
    /must not silently fallback/
  );

  assert.doesNotThrow(() => assertExecuteFallbackBlocked({
    workflow: "github_code_agent",
    fallbackUsed: false,
    allowFallbackOnExecute: false
  }));
});

test("routing fails closed when fallback is disabled and the primary model is missing", () => {
  const env = createTestEnv({
    STRUCTURED_PLAN_MODEL: "",
    CODE_AGENT_MODEL: "",
    ALLOW_MODEL_FALLBACK: false
  });
  const config = loadModelCapabilitiesConfig();

  assert.throws(
    () => resolveStructuredPlanModel(env, config),
    /failed closed/
  );
});
