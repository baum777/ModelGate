import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import {
  DEFAULT_FREE_MODEL_ALIAS,
  resolveDefaultFreeConfiguration
} from "../lib/default-free-model.js";
import type { AppEnv } from "../lib/env.js";
import type { LocalProfileSessionManager } from "../lib/local-profile-session.js";
import {
  USER_OPENROUTER_ALIAS,
  type UserOpenRouterCredentialStore
} from "../lib/openrouter-credential-store.js";
import type { OpenRouterClient } from "../lib/openrouter.js";
import { normalizeConfiguredModelId } from "../lib/model-id.js";

const MAX_MODEL_ID_LENGTH = 200;
const MIN_API_KEY_LENGTH = 20;

const CredentialRequestSchema = z.object({
  apiKey: z.string(),
  modelId: z.string()
}).strict();

type SettingsOpenRouterDependencies = {
  env: AppEnv;
  profileSessions: LocalProfileSessionManager;
  credentialStore: UserOpenRouterCredentialStore;
  openRouter: OpenRouterClient;
};

function buildInvalidRequest() {
  return {
    ok: false,
    error: {
      code: "invalid_request",
      message: "Invalid OpenRouter credential request"
    }
  };
}

function buildEncryptionMissing() {
  return {
    ok: false,
    error: {
      code: "credential_encryption_not_configured",
      message: "User credential encryption is not configured"
    }
  };
}

function containsWhitespaceOrControl(value: string) {
  return /[\s\x00-\x1F\x7F]/.test(value);
}

function validateApiKey(input: string) {
  const trimmed = input.trim();

  if (trimmed.length < MIN_API_KEY_LENGTH || containsWhitespaceOrControl(trimmed)) {
    return null;
  }

  return trimmed;
}

function validateModelId(input: string) {
  const normalized = normalizeConfiguredModelId(input) ?? input.trim();

  if (
    normalized.length === 0
    || normalized.length > MAX_MODEL_ID_LENGTH
    || containsWhitespaceOrControl(normalized)
    || !/^[A-Za-z0-9_.:-]+\/[A-Za-z0-9_.:-]+$/.test(normalized)
  ) {
    return null;
  }

  return normalized;
}

function safeModel(modelId: string) {
  return {
    alias: USER_OPENROUTER_ALIAS,
    label: modelId,
    source: "user_configured" as const
  };
}

function parseCredentialRequest(body: unknown) {
  const parsed = CredentialRequestSchema.safeParse(body);

  if (!parsed.success) {
    return null;
  }

  const apiKey = validateApiKey(parsed.data.apiKey);
  const modelId = validateModelId(parsed.data.modelId);

  if (!apiKey || !modelId) {
    return null;
  }

  return {
    apiKey,
    modelId
  };
}

function sendInvalidRequest(reply: FastifyReply) {
  return reply.status(400).send(buildInvalidRequest());
}

export function settingsOpenRouterRoutes(app: FastifyInstance, deps: SettingsOpenRouterDependencies) {
  app.get("/settings/openrouter/status", async (request, reply) => {
    const profile = deps.profileSessions.resolve(request, reply);
    const credential = deps.credentialStore.read(profile.profileId);
    const defaultFree = resolveDefaultFreeConfiguration(deps.env, credential);
    reply.header("Cache-Control", "no-store");
    return {
      ...deps.credentialStore.status(profile.profileId),
      defaultFree: {
        alias: DEFAULT_FREE_MODEL_ALIAS,
        label: defaultFree.label,
        source: defaultFree.source,
        status: defaultFree.status,
        modelId: defaultFree.modelId
      }
    };
  });

  app.post("/settings/openrouter/credentials", async (request, reply) => {
    const credential = parseCredentialRequest(request.body);

    if (!credential) {
      return sendInvalidRequest(reply);
    }

    const profile = deps.profileSessions.resolve(request, reply);
    const stored = deps.credentialStore.write(profile.profileId, credential);
    reply.header("Cache-Control", "no-store");

    if (stored !== "stored") {
      return reply.status(503).send(buildEncryptionMissing());
    }

    return {
      ok: true,
      configured: true,
      model: safeModel(credential.modelId),
      status: "OpenRouter key configured"
    };
  });

  app.post("/settings/openrouter/test", async (request, reply) => {
    const credential = parseCredentialRequest(request.body);

    if (!credential) {
      return sendInvalidRequest(reply);
    }

    deps.profileSessions.resolve(request, reply);
    reply.header("Cache-Control", "no-store");

    try {
      await deps.openRouter.createChatCompletion(
        {
          stream: false,
          temperature: 0,
          messages: [
            {
              role: "user",
              content: "Connection test"
            }
          ]
        },
        {
          publicModelId: USER_OPENROUTER_ALIAS,
          publicModelAlias: USER_OPENROUTER_ALIAS,
          logicalModelId: "user-openrouter-default",
          providerTargets: [credential.modelId]
        },
        {
          apiKey: credential.apiKey
        }
      );

      return {
        ok: true,
        configured: false,
        model: safeModel(credential.modelId)
      };
    } catch {
      return reply.status(502).send({
        ok: false,
        error: {
          code: "openrouter_test_failed",
          message: "OpenRouter connection test failed"
        }
      });
    }
  });
}
