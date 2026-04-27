import type { FastifyInstance, FastifyReply } from "fastify";
import { createSessionCookie, clearSessionCookie, verifyAdminPassword, verifySessionFromRequest, type AuthConfig } from "../lib/auth.js";
import type { AppRateLimiter } from "../lib/rate-limit.js";
import { z } from "zod";

type AuthRouteDependencies = {
  config: AuthConfig;
  rateLimiter: AppRateLimiter;
};

const AuthLoginRequestSchema = z.object({
  password: z.string().min(1)
}).strict();

function sendAuthNotConfigured(reply: FastifyReply) {
  return reply.status(503).send({
    code: "auth_not_configured"
  });
}

function sendAuthInvalidCredentials(reply: FastifyReply) {
  return reply.status(401).send({
    code: "auth_invalid_credentials"
  });
}

function sendAuthRateLimited(reply: FastifyReply, retryAfterSeconds: number) {
  reply.header("Retry-After", String(retryAfterSeconds));
  return reply.status(429).send({
    code: "auth_attempts_exceeded"
  });
}

export function authRoutes(app: FastifyInstance, deps: AuthRouteDependencies) {
  app.post("/api/auth/login", async (request, reply) => {
    const limit = deps.rateLimiter.check("auth_login", request);

    if (!limit.allowed) {
      return sendAuthRateLimited(reply, limit.retryAfterSeconds);
    }

    if (!deps.config.ready) {
      return sendAuthNotConfigured(reply);
    }

    const parsedBody = AuthLoginRequestSchema.safeParse(request.body);

    if (!parsedBody.success) {
      return reply.status(400).send({
        code: "invalid_request"
      });
    }

    if (!verifyAdminPassword(parsedBody.data.password, deps.config)) {
      return sendAuthInvalidCredentials(reply);
    }

    reply.header("Set-Cookie", createSessionCookie(deps.config));
    reply.header("Cache-Control", "no-store");

    return reply.status(200).send({
      authenticated: true
    });
  });

  app.get("/api/auth/me", async (_request, reply) => {
    reply.header("Cache-Control", "no-store");

    if (verifySessionFromRequest(_request, deps.config)) {
      return reply.status(200).send({
        authenticated: true
      });
    }

    return reply.status(401).send({
      authenticated: false
    });
  });

  app.post("/api/auth/logout", async (_request, reply) => {
    reply.header("Set-Cookie", clearSessionCookie(deps.config));
    reply.header("Cache-Control", "no-store");

    return reply.status(200).send({
      authenticated: false
    });
  });
}
