import type { FastifyInstance, FastifyReply } from "fastify";
import { createSessionCookie, clearSessionCookie, verifyAdminPassword, verifySessionFromRequest, type AuthConfig } from "../lib/auth.js";
import { z } from "zod";

type AuthRouteDependencies = {
  config: AuthConfig;
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

export function authRoutes(app: FastifyInstance, deps: AuthRouteDependencies) {
  app.post("/api/auth/login", async (request, reply) => {
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
