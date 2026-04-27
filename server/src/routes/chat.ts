import type { FastifyInstance } from "fastify";
import type { AuthConfig } from "../lib/auth.js";
import { ChatRequestSchema, type ChatErrorResponse } from "../lib/chat-contract.js";
import type { AppEnv } from "../lib/env.js";
import { buildCorsHeaders, writeSseEvent } from "../lib/http.js";
import type { ModelRegistry } from "../lib/model-policy.js";
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

function buildUpstreamErrorResponse(): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "upstream_error",
      message: "Chat provider request failed"
    }
  };
}

function buildUpstreamErrorResponseFromError(error: unknown): { status: number; body: ChatErrorResponse } {
  if (error instanceof OpenRouterError) {
    return {
      status: error.status,
      body: {
        ok: false,
        error: {
          code: "upstream_error",
          message: error.message
        }
      }
    };
  }

  return {
    status: 502,
    body: buildUpstreamErrorResponse()
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
    let routeDecision: ReturnType<typeof resolveChatRouteDecision>;

    try {
      routeDecision = resolveChatRouteDecision({
        env: deps.env,
        request: body,
        modelRegistry: deps.modelRegistry,
        modelCapabilitiesConfig: deps.modelCapabilitiesConfig
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : "unknown";
      if (message.includes("unsupported_model")) {
        return reply.status(400).send(buildInvalidRequestResponse());
      }

      request.log.error({
        error: message
      }, "chat route resolution failed");
      return reply.status(500).send(buildInternalErrorResponse());
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
      const result = await deps.openRouter.createChatCompletion(body, routeDecision.selection);

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
