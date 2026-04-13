import type { FastifyInstance } from "fastify";
import { ChatRequestSchema, type ChatErrorResponse } from "../lib/chat-contract.js";
import type { AppEnv } from "../lib/env.js";
import { buildCorsHeaders, writeSseEvent } from "../lib/http.js";
import { type OpenRouterClient, OpenRouterError } from "../lib/openrouter.js";

type ChatRouteDependencies = {
  env: AppEnv;
  openRouter: OpenRouterClient;
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

export function chatRoutes(app: FastifyInstance, deps: ChatRouteDependencies) {
  app.post("/chat", async (request, reply) => {
    const parsed = ChatRequestSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(buildInvalidRequestResponse());
    }

    const body = parsed.data;

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
        model: body.model ?? deps.env.OPENROUTER_MODEL
      });

      const onClose = () => {
        abortController.abort();
      };

      request.raw.on("close", onClose);

      try {
        const result = await deps.openRouter.relayChatCompletionStream(body, {
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
        request.raw.off("close", onClose);
        reply.raw.end();
      }

      return;
    }

    try {
      const result = await deps.openRouter.createChatCompletion(body);

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
