import type { AppEnv } from "./env.js";
import type { ChatRequest, ChatRouteMetadata } from "./chat-contract.js";
import type { ModelRegistry, ResolvedModelSelection } from "./model-policy.js";
import {
  resolveChatModel,
  type ModelCapabilitiesConfig,
  type WorkflowModelPolicy
} from "./workflow-model-router.js";

export type RouteTaskClass = ChatRouteMetadata["taskClass"];

export type RoutingAuthorityDecision = {
  selection: ResolvedModelSelection;
  route: ChatRouteMetadata;
  providerTargets: string[];
};

function normalizeTaskClass(value: ChatRequest["task"]): RouteTaskClass | null {
  if (!value) {
    return null;
  }

  return value;
}

function classifyByMessageContent(messages: ChatRequest["messages"]): RouteTaskClass {
  const latestUserMessage = [...messages]
    .reverse()
    .find((message) => message.role === "user")?.content.toLowerCase() ?? "";

  if (/\b(code|coding|implement|refactor|debug|fix|test)\b/.test(latestUserMessage)) {
    return "coding";
  }

  if (/\b(review|audit|risk|verify|regression)\b/.test(latestUserMessage)) {
    return "review";
  }

  if (/\b(architecture|design|tradeoff|migration|analysis)\b/.test(latestUserMessage)) {
    return "analysis";
  }

  return "dialog";
}

function deriveTaskClass(request: ChatRequest): RouteTaskClass {
  const explicitTask = normalizeTaskClass(request.task);

  if (explicitTask) {
    return explicitTask;
  }

  if (request.mode === "fast") {
    return "dialog";
  }

  if (request.preference === "quality") {
    return "analysis";
  }

  return classifyByMessageContent(request.messages);
}

function buildDecisionReason(policy: WorkflowModelPolicy, taskClass: RouteTaskClass) {
  return [
    `task_class=${taskClass}`,
    `selection_source=${policy.selectionSource}`,
    `fallback=${policy.fallbackUsed ? "used" : "not_used"}`
  ].join(";");
}

function sanitizeProviderTargets(policy: WorkflowModelPolicy) {
  return [...new Set(policy.candidateModels.map((value) => value.trim()).filter(Boolean))];
}

export function resolveChatRouteDecision(options: {
  env: AppEnv;
  request: ChatRequest;
  modelRegistry: ModelRegistry;
  modelCapabilitiesConfig: ModelCapabilitiesConfig;
}): RoutingAuthorityDecision {
  const requestedAlias = options.request.modelAlias ?? options.request.model;
  const resolution = options.modelRegistry.resolveModel(requestedAlias);

  if (!resolution.ok) {
    const reason = "reason" in resolution ? resolution.reason : "unknown";
    throw new Error(`Chat route resolution failed: ${reason}`);
  }

  const policy = resolveChatModel(options.env, options.modelCapabilitiesConfig);
  const providerTargets = sanitizeProviderTargets(policy);

  if (providerTargets.length === 0) {
    throw new Error("Chat route resolution failed: no provider targets available");
  }

  const taskClass = deriveTaskClass(options.request);
  const selection: ResolvedModelSelection = {
    ...resolution.selection,
    providerTargets
  };
  const route: ChatRouteMetadata = {
    selectedAlias: selection.publicModelAlias,
    taskClass,
    fallbackUsed: policy.fallbackUsed,
    degraded: policy.fallbackUsed,
    streaming: options.request.stream,
    policyVersion: "model-capabilities/v1",
    decisionReason: buildDecisionReason(policy, taskClass),
    retryCount: Math.max(0, providerTargets.length - 1)
  };

  return {
    selection,
    route,
    providerTargets
  };
}
