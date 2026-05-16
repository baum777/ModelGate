import type { FastifyInstance } from "fastify";
import type { AuthConfig } from "../lib/auth.js";
import { ChatRequestSchema, type ChatErrorResponse } from "../lib/chat-contract.js";
import {
  DEFAULT_FREE_MODEL_ALIAS,
  resolveDefaultFreeConfiguration,
  type DefaultFreeConfiguration
} from "../lib/default-free-model.js";
import type { AppEnv } from "../lib/env.js";
import { buildCorsHeaders, writeSseEvent } from "../lib/http.js";
import type { LocalProfileSessionManager } from "../lib/local-profile-session.js";
import type { ModelRegistry } from "../lib/model-policy.js";
import {
  USER_OPENROUTER_ALIAS,
  type UserOpenRouterCredentialStore
} from "../lib/openrouter-credential-store.js";
import { type OpenRouterClient, OpenRouterError } from "../lib/openrouter.js";
import type { AppRateLimiter } from "../lib/rate-limit.js";
import type { RuntimeJournal } from "../lib/runtime-journal.js";
import type { RuntimeObservability } from "../lib/runtime-observability.js";
import { resolveChatRouteDecision } from "../lib/routing-authority.js";
import { assertNoFrontendProviderModelOverride, type ModelCapabilitiesConfig } from "../lib/workflow-model-router.js";

type ChatRouteDependencies = {
  env: AppEnv;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
  modelCapabilitiesConfig: ModelCapabilitiesConfig;
  authConfig: AuthConfig;
  rateLimiter: AppRateLimiter;
  runtimeObservability: RuntimeObservability;
  runtimeJournal: RuntimeJournal;
  profileSessions: LocalProfileSessionManager;
  openRouterCredentialStore: UserOpenRouterCredentialStore;
};

function buildInvalidRequestResponse(): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid chat request"
    }
  };
}

function buildModelNotAvailableResponse(message = "Requested model alias is not available"): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "model_not_available",
      message
    }
  };
}

function buildConfigErrorResponse(
  code: "missing_api_key" | "missing_default_model",
  message: string
): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code,
      message
    }
  };
}

function buildProviderUnavailableResponse(message = "Chat provider request failed"): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "provider_unavailable",
      message
    }
  };
}

function buildUpstreamErrorResponseFromError(error: unknown): { status: number; body: ChatErrorResponse } {
  if (error instanceof OpenRouterError) {
    const normalizedMessage = error.message.toLowerCase();
    const isMissingApiKey = normalizedMessage.includes("api key") && normalizedMessage.includes("not configured");
    const isMissingModel = normalizedMessage.includes("default model") && normalizedMessage.includes("not configured");

    if (isMissingApiKey) {
      return {
        status: 503,
        body: buildConfigErrorResponse("missing_api_key", "OpenRouter API key is not configured")
      };
    }

    if (isMissingModel) {
      return {
        status: 503,
        body: buildConfigErrorResponse("missing_default_model", "Default free model is not configured")
      };
    }

    return {
      status: error.status,
      body: buildProviderUnavailableResponse(error.message)
    };
  }

  return {
    status: 502,
    body: buildProviderUnavailableResponse()
  };
}

function buildInternalErrorResponse(message = "Chat backend model policy unavailable"): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "internal_error",
      message
    }
  };
}

function buildRateLimitedResponse(): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "rate_limited",
      message: "Chat rate limit exceeded"
    }
  };
}

function buildCredentialsNotConfiguredResponse(): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "credentials_not_configured",
      message: "OpenRouter credentials not configured"
    }
  };
}

function buildDefaultFreeConfigurationError(configuration: DefaultFreeConfiguration): { status: number; body: ChatErrorResponse } {
  if (configuration.status === "missing_key") {
    return {
      status: 503,
      body: buildConfigErrorResponse("missing_api_key", "OpenRouter API key is not configured")
    };
  }

  if (configuration.status === "missing_model") {
    return {
      status: 503,
      body: buildConfigErrorResponse("missing_default_model", "Default free model is not configured")
    };
  }

  return {
    status: 503,
    body: buildInternalErrorResponse("Default free model configuration unavailable")
  };
}

function resolveRequestedAlias(modelAlias: string | undefined, model: string | undefined) {
  const alias = modelAlias?.trim();

  if (alias) {
    return alias;
  }

  const legacy = model?.trim();

  if (legacy) {
    return legacy;
  }

  return null;
}

function shouldResolveDefaultFreeConfiguration(requestedAlias: string | null, defaultAlias: string) {
  return requestedAlias === DEFAULT_FREE_MODEL_ALIAS
    || (requestedAlias === null && defaultAlias === DEFAULT_FREE_MODEL_ALIAS);
}

function isModelNotAvailableResolutionError(message: string) {
  return message.includes("unsupported_model") || message.includes("no_eligible_provider_targets");
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

export function chatRoutes(app: FastifyInstance, deps: ChatRouteDependencies) {
  app.post("/chat", async (request, reply) => {
    deps.runtimeObservability.increment("chatRequests");
    const limit = deps.rateLimiter.check("chat", request, deps.authConfig);

    if (!limit.allowed) {
      reply.header("Retry-After", String(limit.retryAfterSeconds));
      return reply.status(429).send(buildRateLimitedResponse());
    }

    try {
      assertNoFrontendProviderModelOverride(request.body);
    } catch {
      return reply.status(400).send(buildInvalidRequestResponse());
    }

    const parsed = ChatRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(buildInvalidRequestResponse());
    }

    const body = parsed.data;
    const requestedAlias = resolveRequestedAlias(body.modelAlias, body.model);
    let routeDecision: ReturnType<typeof resolveChatRouteDecision>;
    let requestApiKey: string | null = null;

    if (body.modelAlias === USER_OPENROUTER_ALIAS || body.model === USER_OPENROUTER_ALIAS) {
      const profile = deps.profileSessions.resolve(request, reply);
      const credential = deps.openRouterCredentialStore.read(profile.profileId);

      if (!credential) {
        return reply.status(403).send(buildCredentialsNotConfiguredResponse());
      }

      requestApiKey = credential.apiKey;
      routeDecision = {
        selection: {
          publicModelId: USER_OPENROUTER_ALIAS,
          publicModelAlias: USER_OPENROUTER_ALIAS,
          logicalModelId: "user-openrouter-default",
          providerTargets: [credential.modelId]
        },
        route: {
          selectedAlias: USER_OPENROUTER_ALIAS,
          taskClass: body.task ?? "dialog",
          fallbackUsed: false,
          degraded: false,
          streaming: body.stream,
          policyVersion: "user-openrouter/v1",
          decisionReason: "source=user_configured",
          retryCount: 0
        },
        providerTargets: [credential.modelId]
      };
    } else {
      const shouldResolveDefaultFree = shouldResolveDefaultFreeConfiguration(requestedAlias, deps.modelRegistry.defaultModelAlias);
      let defaultFreeConfiguration: DefaultFreeConfiguration | null = null;

      if (shouldResolveDefaultFree) {
        const profile = deps.profileSessions.resolve(request, reply);
        const userCredential = deps.openRouterCredentialStore.read(profile.profileId);
        defaultFreeConfiguration = resolveDefaultFreeConfiguration(deps.env, userCredential);

        if (defaultFreeConfiguration.status !== "configured") {
          const configurationError = buildDefaultFreeConfigurationError(defaultFreeConfiguration);
          return reply.status(configurationError.status).send(configurationError.body);
        }
      }

      try {
        routeDecision = resolveChatRouteDecision({
          env: deps.env,
          request: body,
          modelRegistry: deps.modelRegistry,
          modelCapabilitiesConfig: deps.modelCapabilitiesConfig
        });
      } catch (error) {
        const message = error instanceof Error ? error.message : "unknown";
        if (isModelNotAvailableResolutionError(message)) {
          return reply.status(400).send(buildModelNotAvailableResponse());
        }

        request.log.error({
          error: message
        }, "chat route resolution failed");
        return reply.status(500).send(buildInternalErrorResponse());
      }

      if (routeDecision.route.selectedAlias === DEFAULT_FREE_MODEL_ALIAS) {
        const profile = deps.profileSessions.resolve(request, reply);
        const userCredential = deps.openRouterCredentialStore.read(profile.profileId);
        const resolvedDefaultFree = defaultFreeConfiguration ?? resolveDefaultFreeConfiguration(deps.env, userCredential);

        if (resolvedDefaultFree.status !== "configured" || !resolvedDefaultFree.modelId || !resolvedDefaultFree.apiKey) {
          const configurationError = buildDefaultFreeConfigurationError(resolvedDefaultFree);
          return reply.status(configurationError.status).send(configurationError.body);
        }

        routeDecision.selection.providerTargets = [...resolvedDefaultFree.providerTargets];
        routeDecision.providerTargets = [...resolvedDefaultFree.providerTargets];
        routeDecision.route.retryCount = Math.max(0, resolvedDefaultFree.providerTargets.length - 1);
        routeDecision.route.decisionReason = `source=${resolvedDefaultFree.source}`;
        requestApiKey = resolvedDefaultFree.apiKey;
      }
    }

    request.log.info({
      selectedAlias: routeDecision.route.selectedAlias,
      taskClass: routeDecision.route.taskClass,
      fallbackUsed: routeDecision.route.fallbackUsed,
      degraded: routeDecision.route.degraded,
      retryCount: routeDecision.route.retryCount
    }, "chat route decision");

    if (body.stream) {
      const origin = request.headers.origin;
      const corsHeaders = buildCorsHeaders(origin, deps.env.CORS_ORIGINS);
      const abortController = new AbortController();

      reply.hijack();

      for (const [headerName, headerValue] of Object.entries({
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-cache, no-transform",
        Connection: "keep-alive",
        "X-Accel-Buffering": "no",
        ...corsHeaders
      })) {
        reply.raw.setHeader(headerName, headerValue);
      }

      reply.raw.writeHead(200);
      reply.raw.flushHeaders?.();

      writeSseEvent(reply.raw, "start", {
        ok: true,
        model: routeDecision.selection.publicModelAlias
      });
      deps.runtimeObservability.increment("chatStreamStarted");
      deps.runtimeJournal.append({
        source: "chat",
        eventType: "chat_stream_started",
        authorityDomain: "chat",
        severity: "info",
        outcome: "accepted",
        summary: "Chat stream started",
        modelRouteSummary: {
          selectedAlias: routeDecision.route.selectedAlias,
          taskClass: routeDecision.route.taskClass,
          fallbackUsed: routeDecision.route.fallbackUsed,
          degraded: routeDecision.route.degraded,
          streaming: true
        }
      });
      writeSseEvent(reply.raw, "route", {
        ok: true,
        route: routeDecision.route
      });

      const onClientAbort = () => {
        deps.runtimeObservability.increment("chatStreamAborted");
        deps.runtimeJournal.append({
          source: "chat",
          eventType: "chat_stream_aborted",
          authorityDomain: "chat",
          severity: "warning",
          outcome: "blocked",
          summary: "Chat stream aborted by client",
          modelRouteSummary: {
            selectedAlias: routeDecision.route.selectedAlias,
            taskClass: routeDecision.route.taskClass,
            fallbackUsed: routeDecision.route.fallbackUsed,
            degraded: routeDecision.route.degraded,
            streaming: true
          }
        });
        abortController.abort();
      };

      request.raw.on("aborted", onClientAbort);

      try {
        const result = await deps.openRouter.relayChatCompletionStream(body, routeDecision.selection, {
          signal: abortController.signal,
          apiKey: requestApiKey ?? undefined,
          onToken: (delta) => {
            writeSseEvent(reply.raw, "token", { delta });
          }
        });

        if (!abortController.signal.aborted) {
          writeSseEvent(reply.raw, "done", {
            ok: true,
            model: result.model,
            text: result.text,
            route: routeDecision.route
          });
          deps.runtimeObservability.increment("chatStreamCompleted");
          deps.runtimeJournal.append({
            source: "chat",
            eventType: "chat_stream_completed",
            authorityDomain: "chat",
            severity: "info",
            outcome: "executed",
            summary: "Chat stream completed",
            modelRouteSummary: {
              selectedAlias: routeDecision.route.selectedAlias,
              taskClass: routeDecision.route.taskClass,
              fallbackUsed: routeDecision.route.fallbackUsed,
              degraded: routeDecision.route.degraded,
              streaming: true
            }
          });
        }
      } catch (error) {
        if (abortController.signal.aborted || isAbortError(error)) {
          return;
        }

        const upstream = buildUpstreamErrorResponseFromError(error);
        request.log.error({
          status: upstream.status
        }, "streaming chat request failed");
        deps.runtimeObservability.increment("chatStreamError");
        deps.runtimeObservability.increment("upstreamError");
        deps.runtimeJournal.append({
          source: "chat",
          eventType: "chat_stream_error",
          authorityDomain: "chat",
          severity: "error",
          outcome: "failed",
          summary: "Chat stream failed",
          modelRouteSummary: {
            selectedAlias: routeDecision.route.selectedAlias,
            taskClass: routeDecision.route.taskClass,
            fallbackUsed: routeDecision.route.fallbackUsed,
            degraded: routeDecision.route.degraded,
            streaming: true
          },
          safeMetadata: {
            status: upstream.status,
            code: upstream.body.error.code
          }
        });

        writeSseEvent(reply.raw, "error", upstream.body);
      } finally {
        request.raw.off("aborted", onClientAbort);
        reply.raw.end();
      }

      return;
    }

    try {
      const result = await deps.openRouter.createChatCompletion(body, routeDecision.selection, {
        apiKey: requestApiKey ?? undefined
      });

      return reply.status(200).send({
        ok: true,
        model: result.model,
        text: result.text,
        route: routeDecision.route
      });
    } catch (error) {
      const upstream = buildUpstreamErrorResponseFromError(error);

      request.log.error({
        status: upstream.status
      }, "chat request failed");
      deps.runtimeObservability.increment("upstreamError");

      return reply.status(upstream.status).send(upstream.body);
    }
  });
}
