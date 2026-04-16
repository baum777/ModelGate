import type { AppEnv } from "../src/lib/env.js";
import { createDisabledGitHubConfig, type GitHubConfig } from "../src/lib/github-env.js";
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
    CORS_ORIGINS: overrides.CORS_ORIGINS ?? ["http://localhost:5173"],
    GITHUB_TOKEN: overrides.GITHUB_TOKEN ?? "",
    GITHUB_ALLOWED_REPOS: overrides.GITHUB_ALLOWED_REPOS ?? [],
    GITHUB_API_BASE_URL: overrides.GITHUB_API_BASE_URL ?? "https://api.github.com",
    GITHUB_DEFAULT_OWNER: overrides.GITHUB_DEFAULT_OWNER ?? "",
    GITHUB_BRANCH_PREFIX: overrides.GITHUB_BRANCH_PREFIX ?? "modelgate/github",
    GITHUB_REQUEST_TIMEOUT_MS: overrides.GITHUB_REQUEST_TIMEOUT_MS ?? 8000,
    GITHUB_PLAN_TTL_MS: overrides.GITHUB_PLAN_TTL_MS ?? 720000,
    GITHUB_MAX_CONTEXT_FILES: overrides.GITHUB_MAX_CONTEXT_FILES ?? 6,
    GITHUB_MAX_CONTEXT_BYTES: overrides.GITHUB_MAX_CONTEXT_BYTES ?? 32768,
    GITHUB_SMOKE_REPO: overrides.GITHUB_SMOKE_REPO ?? "",
    GITHUB_SMOKE_BASE_BRANCH: overrides.GITHUB_SMOKE_BASE_BRANCH ?? "",
    GITHUB_SMOKE_TARGET_BRANCH: overrides.GITHUB_SMOKE_TARGET_BRANCH ?? "",
    GITHUB_SMOKE_ENABLED: overrides.GITHUB_SMOKE_ENABLED ?? false,
    GITHUB_APP_ID: overrides.GITHUB_APP_ID ?? "",
    GITHUB_APP_PRIVATE_KEY: overrides.GITHUB_APP_PRIVATE_KEY ?? "",
    GITHUB_APP_INSTALLATION_ID: overrides.GITHUB_APP_INSTALLATION_ID ?? ""
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
    refreshToken: overrides.refreshToken ?? null,
    clientId: overrides.clientId ?? null,
    tokenExpiresAt: overrides.tokenExpiresAt ?? null,
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

export function createTestGitHubConfig(overrides: Partial<GitHubConfig> = {}): GitHubConfig {
  const base = createDisabledGitHubConfig();
  const allowedRepos = overrides.allowedRepos ?? ["acme/widget"];

  return {
    ...base,
    enabled: overrides.enabled ?? true,
    ready: overrides.ready ?? true,
    baseUrl: overrides.baseUrl ?? "https://api.github.example",
    token: overrides.token ?? "test-github-token",
    allowedRepos,
    allowedRepoSet: overrides.allowedRepoSet ?? new Set(allowedRepos),
    defaultOwner: overrides.defaultOwner ?? "acme",
    branchPrefix: overrides.branchPrefix ?? "modelgate/github",
    requestTimeoutMs: overrides.requestTimeoutMs ?? 5000,
    planTtlMs: overrides.planTtlMs ?? 720000,
    maxContextFiles: overrides.maxContextFiles ?? 6,
    maxContextBytes: overrides.maxContextBytes ?? 32768,
    smokeRepo: overrides.smokeRepo ?? null,
    smokeBaseBranch: overrides.smokeBaseBranch ?? null,
    smokeTargetBranch: overrides.smokeTargetBranch ?? null,
    smokeEnabled: overrides.smokeEnabled ?? false,
    issues: overrides.issues ?? []
  };
}
