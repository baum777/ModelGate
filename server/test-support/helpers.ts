import type { AppEnv } from "../src/lib/env.js";
import type { MatrixClient } from "../src/lib/matrix-client.js";
import { createDisabledMatrixConfig, type MatrixConfig } from "../src/lib/matrix-env.js";
import type { OpenRouterClient } from "../src/lib/openrouter.js";

export function createTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    PORT: overrides.PORT ?? 8787,
    HOST: overrides.HOST ?? "127.0.0.1",
    OPENROUTER_API_KEY: overrides.OPENROUTER_API_KEY ?? "test-openrouter-key",
    OPENROUTER_BASE_URL: overrides.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: overrides.OPENROUTER_MODEL ?? "openrouter/auto",
    OPENROUTER_MODELS: overrides.OPENROUTER_MODELS ?? ["openrouter/auto", "anthropic/claude-3.5-sonnet"],
    APP_NAME: overrides.APP_NAME ?? "modelgate-test",
    DEFAULT_SYSTEM_PROMPT: overrides.DEFAULT_SYSTEM_PROMPT ?? "Backend-owned system prompt.",
    CORS_ORIGINS: overrides.CORS_ORIGINS ?? ["http://localhost:5173"]
  };
}

export function createMockOpenRouterClient(overrides: Partial<OpenRouterClient> = {}): OpenRouterClient {
  return {
    createChatCompletion: overrides.createChatCompletion ?? (async (_request, selection) => ({
      model: selection.publicModelId,
      text: "stub"
    })),
    relayChatCompletionStream: overrides.relayChatCompletionStream ?? (async (_request, selection, options) => {
      options.onToken("stub");
      return {
        model: selection.publicModelId,
        text: "stub"
      };
    })
  };
}

export function createTestMatrixConfig(overrides: Partial<MatrixConfig> = {}): MatrixConfig {
  return {
    ...createDisabledMatrixConfig(),
    enabled: overrides.enabled ?? true,
    required: overrides.required ?? false,
    ready: overrides.ready ?? true,
    baseUrl: overrides.baseUrl ?? "http://matrix.example",
    accessToken: overrides.accessToken ?? "test-matrix-token",
    expectedUserId: overrides.expectedUserId ?? null,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 5000,
    issues: overrides.issues ?? []
  };
}

export function createMockMatrixClient(overrides: Partial<MatrixClient> = {}): MatrixClient {
  return {
    whoami: overrides.whoami ?? (async () => ({
      ok: true,
      userId: "@user:matrix.example",
      deviceId: "DEVICE",
      homeserver: "http://matrix.example"
    })),
    joinedRooms: overrides.joinedRooms ?? (async () => ([
      {
        roomId: "!room:matrix.example",
        name: "Room name",
        canonicalAlias: "#room:matrix.example",
        roomType: "room"
      }
    ])),
    resolveScope: overrides.resolveScope ?? (async () => ({
      scopeId: "scope_test",
      snapshotId: "snapshot_test",
      type: "room",
      createdAt: new Date().toISOString(),
      createdAtMs: Date.now(),
      expiresAtMs: Date.now() + 15 * 60 * 1000,
      rooms: [
        {
          roomId: "!room:matrix.example",
          name: "Room name",
          canonicalAlias: "#room:matrix.example",
          roomType: "room",
          members: 1,
          lastEventSummary: "Room metadata snapshot with 1 joined members"
        }
      ]
    })),
    readRoomTopic: overrides.readRoomTopic ?? (async () => "Room topic"),
    updateRoomTopic: overrides.updateRoomTopic ?? (async () => ({
      transactionId: "txn_test"
    }))
  };
}
