import type { FastifyInstance, FastifyRequest } from "fastify";
import { ChatRequestSchema, type ChatErrorResponse } from "../lib/chat-contract.js";
import type { AppEnv } from "../lib/env.js";
import { buildCorsHeaders, writeSseEvent } from "../lib/http.js";
import { resolveLlmRouterSelection, type LlmRouterPolicy } from "../lib/llm-router.js";
import { recordRouterDecision } from "../lib/local-evidence-log.js";
import type { ModelRegistry } from "../lib/model-policy.js";
import { type OpenRouterClient, OpenRouterError } from "../lib/openrouter.js";

type ChatRouteDependencies = {
  env: AppEnv;
  openRouter: OpenRouterClient;
  modelRegistry: ModelRegistry;
  llmRouterPolicy: LlmRouterPolicy;
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

function buildInternalErrorResponse(): ChatErrorResponse {
  return {
    ok: false,
    error: {
      code: "internal_error",
      message: "Chat backend model policy unavailable"
    }
  };
}

function getUpstreamStatus(error: unknown) {
  if (error instanceof OpenRouterError) {
    return error.status;
  }

  if (error && typeof error === "object" && "status" in error && typeof (error as { status?: unknown }).status === "number") {
    return (error as { status: number }).status;
  }

  return undefined;
}

function isAbortError(error: unknown) {
  return error instanceof Error && error.name === "AbortError";
}

async function logRouterDecision(
  request: FastifyRequest,
  policy: LlmRouterPolicy,
  entry: Parameters<typeof recordRouterDecision>[1]
) {
  if (!policy.enabled || !policy.logging.enabled) {
    return;
  }

  try {
    await recordRouterDecision(policy.logging, entry);
  } catch (error) {
    request.log.warn({
      error: error instanceof Error ? error.message : "unknown"
    }, "llm router evidence logging failed");
  }
}

export function chatRoutes(app: FastifyInstance, deps: ChatRouteDependencies) {
  app.post("/chat", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(buildInvalidRequestResponse());
    }

    const body = parsed.data;
    const resolution = deps.modelRegistry.resolveModel(body.model);

    if (!resolution.ok) {
      if (resolution.reason === "unsupported_model") {
        return reply.status(400).send(buildInvalidRequestResponse());
      }

      request.log.error({
        reason: resolution.reason
      }, "model policy resolution failed");

      return reply.status(500).send(buildInternalErrorResponse());
    }

    const routerResolution = resolveLlmRouterSelection({
      messages: body.messages,
      baseProviderTargets: resolution.selection.providerTargets,
      policy: deps.llmRouterPolicy
    });

    if (!routerResolution.ok) {
      await logRouterDecision(request, deps.llmRouterPolicy, {
        taskType: routerResolution.taskType,
        publicModelId: resolution.selection.publicModelId,
        providerModelId: null,
        fallbackUsed: false,
        candidateCount: routerResolution.candidateModels.length,
        reason: routerResolution.reason,
        result: "failed"
      });

      request.log.error({
        reason: routerResolution.reason,
        taskType: routerResolution.taskType
      }, "llm router selection failed");

      return reply.status(502).send(buildUpstreamErrorResponse());
    }

    const selection = {
      ...resolution.selection,
      providerTargets: routerResolution.candidateModels
    };

    await logRouterDecision(request, deps.llmRouterPolicy, {
      taskType: routerResolution.taskType,
      publicModelId: selection.publicModelId,
      providerModelId: routerResolution.selectedModel,
      fallbackUsed: routerResolution.fallbackUsed,
      candidateCount: routerResolution.candidateModels.length,
      reason: routerResolution.reason,
      result: "selected"
    });

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
        model: selection.publicModelId
      });

      // `close` can fire after a normal response finishes, so only treat an
      // explicit client abort as a cancellation signal.
      const onClientAbort = () => {
        abortController.abort();
      };

      request.raw.on("aborted", onClientAbort);

      try {
        const result = await deps.openRouter.relayChatCompletionStream(body, selection, {
          signal: abortController.signal,
          onToken: (delta) => {
            writeSseEvent(reply.raw, "token", { delta });
          }
        });

        if (!abortController.signal.aborted) {
          writeSseEvent(reply.raw, "done", {
            ok: true,
            model: result.model,
            text: result.text
          });
        }
      } catch (error) {
        if (abortController.signal.aborted || isAbortError(error)) {
          return;
        }

        const upstreamStatus = getUpstreamStatus(error);
        request.log.error({
          status: upstreamStatus
        }, "streaming chat request failed");

        writeSseEvent(reply.raw, "error", buildUpstreamErrorResponse());
      } finally {
        request.raw.off("aborted", onClientAbort);
        reply.raw.end();
      }

      return;
    }

    try {
      const result = await deps.openRouter.createChatCompletion(body, selection);

      return reply.status(200).send({
        ok: true,
        model: result.model,
        text: result.text
      });
    } catch (error) {
      const upstreamStatus = getUpstreamStatus(error);

      request.log.error({
        status: upstreamStatus
      }, "chat request failed");

      return reply.status(502).send(buildUpstreamErrorResponse());
    }
  });
}
