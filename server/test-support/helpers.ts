import type { AppEnv } from "../src/lib/env.js";
import { createAuthConfig, createSessionCookie } from "../src/lib/auth.js";
import { createDisabledGitHubConfig, type GitHubConfig } from "../src/lib/github-env.js";
import type { MatrixClient } from "../src/lib/matrix-client.js";
import { createDisabledMatrixConfig, type MatrixConfig } from "../src/lib/matrix-env.js";
import type { OpenRouterClient } from "../src/lib/openrouter.js";

export function createTestEnv(overrides: Partial<AppEnv> = {}): AppEnv {
  return {
    PORT: overrides.PORT ?? 8787,
    HOST: overrides.HOST ?? "127.0.0.1",
    OPENROUTER_API_KEY: overrides.OPENROUTER_API_KEY ?? "test-openrouter-key",
    OPENROUTER_API_KEY_QWEN3_CODER: overrides.OPENROUTER_API_KEY_QWEN3_CODER ?? "test-openrouter-qwen-key",
    OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER: overrides.OPENROUTER_API_KEY_GPT_OSS_120B_PLANNER ?? "test-openrouter-planner-key",
    OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B: overrides.OPENROUTER_API_KEY_NEMOTRON_3_SUPER_120B ?? "test-openrouter-nemotron-key",
    OPENROUTER_BASE_URL: overrides.OPENROUTER_BASE_URL ?? "https://openrouter.ai/api/v1",
    OPENROUTER_MODEL: overrides.OPENROUTER_MODEL ?? "openrouter/auto",
    OPENROUTER_DEFAULT_MODEL: overrides.OPENROUTER_DEFAULT_MODEL ?? overrides.OPENROUTER_MODEL ?? "openrouter/auto",
    OPENROUTER_DEFAULT_LABEL: overrides.OPENROUTER_DEFAULT_LABEL ?? "Free default",
    OPENROUTER_MODELS: overrides.OPENROUTER_MODELS ?? ["openrouter/auto", "anthropic/claude-3.5-sonnet"],
    OPENROUTER_REQUEST_TIMEOUT_MS: overrides.OPENROUTER_REQUEST_TIMEOUT_MS ?? 15000,
    USER_CREDENTIALS_ENCRYPTION_KEY: overrides.USER_CREDENTIALS_ENCRYPTION_KEY ?? "",
    USER_CREDENTIALS_PROFILE_SECRET: overrides.USER_CREDENTIALS_PROFILE_SECRET ?? "",
    USER_CREDENTIALS_STORE_MODE: overrides.USER_CREDENTIALS_STORE_MODE ?? "memory",
    USER_CREDENTIALS_STORE_PATH: overrides.USER_CREDENTIALS_STORE_PATH ?? ".local-ai/state/users",
    APP_NAME: overrides.APP_NAME ?? "mosaicstacked-test",
    DEFAULT_SYSTEM_PROMPT: overrides.DEFAULT_SYSTEM_PROMPT ?? "Backend-owned system prompt.",
    CORS_ORIGINS: overrides.CORS_ORIGINS ?? ["http://localhost:5173"],
    CHAT_MODEL: overrides.CHAT_MODEL ?? overrides.OPENROUTER_MODEL ?? "openrouter/auto",
    CODE_AGENT_MODEL: overrides.CODE_AGENT_MODEL ?? "qwen/qwen3-coder:free",
    STRUCTURED_PLAN_MODEL: overrides.STRUCTURED_PLAN_MODEL ?? "openai/gpt-oss-120b:free",
    MATRIX_ANALYZE_MODEL: overrides.MATRIX_ANALYZE_MODEL ?? "nvidia/nemotron-3-super-120b-a12b:free",
    FAST_FALLBACK_MODEL: overrides.FAST_FALLBACK_MODEL ?? "qwen/qwen3-next-80b-a3b-instruct:free",
    DIALOG_FALLBACK_MODEL: overrides.DIALOG_FALLBACK_MODEL ?? "meta-llama/llama-3.3-70b-instruct:free",
    MODEL_ROUTING_MODE: overrides.MODEL_ROUTING_MODE ?? "policy",
    ALLOW_MODEL_FALLBACK: overrides.ALLOW_MODEL_FALLBACK ?? true,
    MODEL_ROUTING_FAIL_CLOSED: overrides.MODEL_ROUTING_FAIL_CLOSED ?? true,
    MODEL_ROUTING_LOG_ENABLED: overrides.MODEL_ROUTING_LOG_ENABLED ?? false,
    MODEL_ROUTING_LOG_PATH: overrides.MODEL_ROUTING_LOG_PATH ?? ".local-ai/logs/WORKFLOW_MODEL_ROUTING.log.md",
    MATRIX_ANALYZE_LLM_ENABLED: overrides.MATRIX_ANALYZE_LLM_ENABLED ?? false,
    MATRIX_EXECUTE_APPROVAL_REQUIRED: overrides.MATRIX_EXECUTE_APPROVAL_REQUIRED ?? true,
    MATRIX_VERIFY_AFTER_EXECUTE: overrides.MATRIX_VERIFY_AFTER_EXECUTE ?? true,
    MATRIX_ALLOWED_ACTION_TYPES: overrides.MATRIX_ALLOWED_ACTION_TYPES ?? ["set_room_topic"],
    MATRIX_FAIL_CLOSED: overrides.MATRIX_FAIL_CLOSED ?? true,
    GITHUB_TOKEN: overrides.GITHUB_TOKEN ?? "",
    GITHUB_ALLOWED_REPOS: overrides.GITHUB_ALLOWED_REPOS ?? [],
    GITHUB_AGENT_API_KEY: overrides.GITHUB_AGENT_API_KEY ?? "",
    GITHUB_API_BASE_URL: overrides.GITHUB_API_BASE_URL ?? "https://api.github.com",
    GITHUB_DEFAULT_OWNER: overrides.GITHUB_DEFAULT_OWNER ?? "",
    GITHUB_BRANCH_PREFIX: overrides.GITHUB_BRANCH_PREFIX ?? "mosaicstacked/github",
    GITHUB_REQUEST_TIMEOUT_MS: overrides.GITHUB_REQUEST_TIMEOUT_MS ?? 8000,
    GITHUB_PLAN_TTL_MS: overrides.GITHUB_PLAN_TTL_MS ?? 720000,
    GITHUB_ACTION_STORE_MODE: overrides.GITHUB_ACTION_STORE_MODE ?? "memory",
    GITHUB_ACTION_STORE_FILE_PATH: overrides.GITHUB_ACTION_STORE_FILE_PATH ?? ".local-ai/state/github-action-store.json",
    GITHUB_MAX_CONTEXT_FILES: overrides.GITHUB_MAX_CONTEXT_FILES ?? 6,
    GITHUB_MAX_CONTEXT_BYTES: overrides.GITHUB_MAX_CONTEXT_BYTES ?? 32768,
    GITHUB_SMOKE_REPO: overrides.GITHUB_SMOKE_REPO ?? "",
    GITHUB_SMOKE_BASE_BRANCH: overrides.GITHUB_SMOKE_BASE_BRANCH ?? "",
    GITHUB_SMOKE_TARGET_BRANCH: overrides.GITHUB_SMOKE_TARGET_BRANCH ?? "",
    GITHUB_SMOKE_ENABLED: overrides.GITHUB_SMOKE_ENABLED ?? false,
    GITHUB_APP_ID: overrides.GITHUB_APP_ID ?? "",
    GITHUB_APP_PRIVATE_KEY: overrides.GITHUB_APP_PRIVATE_KEY ?? "",
    GITHUB_APP_SLUG: overrides.GITHUB_APP_SLUG ?? "",
    GITHUB_APP_INSTALLATION_ID: overrides.GITHUB_APP_INSTALLATION_ID ?? "",
    GITHUB_OAUTH_CLIENT_ID: overrides.GITHUB_OAUTH_CLIENT_ID ?? "",
    GITHUB_OAUTH_CLIENT_SECRET: overrides.GITHUB_OAUTH_CLIENT_SECRET ?? "",
    GITHUB_OAUTH_CALLBACK_URL: overrides.GITHUB_OAUTH_CALLBACK_URL ?? "http://127.0.0.1:8787/api/auth/github/callback",
    GITHUB_OAUTH_AUTHORIZE_URL: overrides.GITHUB_OAUTH_AUTHORIZE_URL ?? "https://github.com/login/oauth/authorize",
    GITHUB_OAUTH_TOKEN_URL: overrides.GITHUB_OAUTH_TOKEN_URL ?? "https://github.com/login/oauth/access_token",
    GITHUB_OAUTH_SCOPES: overrides.GITHUB_OAUTH_SCOPES ?? ["read:user", "user:email"],
    MATRIX_SSO_CALLBACK_URL: overrides.MATRIX_SSO_CALLBACK_URL ?? "http://127.0.0.1:8787/api/auth/matrix/callback",
    MATRIX_SSO_REDIRECT_PATH: overrides.MATRIX_SSO_REDIRECT_PATH ?? "/_matrix/client/v3/login/sso/redirect",
    MATRIX_LOGIN_TOKEN_TYPE: overrides.MATRIX_LOGIN_TOKEN_TYPE ?? "m.login.token",
    INTEGRATION_AUTH_STORE_MODE: overrides.INTEGRATION_AUTH_STORE_MODE ?? "memory",
    INTEGRATION_AUTH_STORE_FILE_PATH: overrides.INTEGRATION_AUTH_STORE_FILE_PATH ?? ".local-ai/state/integration-auth-store.test.json",
    INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID: overrides.INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_ID ?? "test-key",
    INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION: overrides.INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY_VERSION ?? "1",
    INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY: overrides.INTEGRATION_AUTH_ENCRYPTION_CURRENT_KEY ?? "",
    INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS: overrides.INTEGRATION_AUTH_ENCRYPTION_PREVIOUS_KEYS ?? "",
    RATE_LIMIT_ENABLED: overrides.RATE_LIMIT_ENABLED ?? true,
    RATE_LIMIT_WINDOW_MS: overrides.RATE_LIMIT_WINDOW_MS ?? 60_000,
    RATE_LIMIT_CHAT_MAX: overrides.RATE_LIMIT_CHAT_MAX ?? 30,
    RATE_LIMIT_AUTH_LOGIN_MAX: overrides.RATE_LIMIT_AUTH_LOGIN_MAX ?? 8,
    RATE_LIMIT_GITHUB_PROPOSE_MAX: overrides.RATE_LIMIT_GITHUB_PROPOSE_MAX ?? 10,
    RATE_LIMIT_GITHUB_EXECUTE_MAX: overrides.RATE_LIMIT_GITHUB_EXECUTE_MAX ?? 6,
    RATE_LIMIT_MATRIX_EXECUTE_MAX: overrides.RATE_LIMIT_MATRIX_EXECUTE_MAX ?? 6,
    RATE_LIMIT_FAIL_CLOSED: overrides.RATE_LIMIT_FAIL_CLOSED ?? true,
    JOURNAL_ENABLED: overrides.JOURNAL_ENABLED ?? true,
    JOURNAL_STORE_MODE: overrides.JOURNAL_STORE_MODE ?? "memory",
    JOURNAL_FILE_PATH: overrides.JOURNAL_FILE_PATH ?? ".local-ai/state/runtime-journal.json",
    JOURNAL_MAX_ENTRIES: overrides.JOURNAL_MAX_ENTRIES ?? 500,
    JOURNAL_EXPOSE_RECENT_LIMIT: overrides.JOURNAL_EXPOSE_RECENT_LIMIT ?? 50,
    MOSAIC_STACK_ADMIN_PASSWORD: overrides.MOSAIC_STACK_ADMIN_PASSWORD ?? "test-admin-password",
    MOSAIC_STACK_SESSION_SECRET: overrides.MOSAIC_STACK_SESSION_SECRET ?? "test-session-secret",
    MOSAIC_STACK_SESSION_TTL_SECONDS: overrides.MOSAIC_STACK_SESSION_TTL_SECONDS ?? 86_400
  };
}

export function createTestAuthConfig(overrides: Partial<AppEnv> = {}) {
  return createAuthConfig(createTestEnv(overrides));
}

export function createTestSessionCookie(overrides: Partial<AppEnv> = {}) {
  return createSessionCookie(createTestAuthConfig(overrides));
}

export function withTestSession<T extends { inject: (request: Parameters<T["inject"]>[0]) => ReturnType<T["inject"]> }>(
  app: T,
  overrides: Partial<AppEnv> = {}
) {
  const sessionCookie = createTestSessionCookie(overrides);
  const originalInject = app.inject.bind(app);

  app.inject = ((request: Parameters<T["inject"]>[0]) => {
    const normalizedRequest = (request as { headers?: Record<string, string> }) ?? {};

    return originalInject({
      ...request,
      headers: {
        cookie: sessionCookie,
        ...(normalizedRequest.headers ?? {})
      }
    });
  }) as T["inject"];

  return app;
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
    homeserverUrl: overrides.homeserverUrl ?? overrides.baseUrl ?? "http://matrix.example",
    callbackUrl: overrides.callbackUrl ?? "http://127.0.0.1:8787/api/auth/matrix/callback",
    accessToken: overrides.accessToken ?? "test-matrix-token",
    refreshToken: overrides.refreshToken ?? null,
    clientId: overrides.clientId ?? null,
    tokenExpiresAt: overrides.tokenExpiresAt ?? null,
    expectedUserId: overrides.expectedUserId ?? null,
    requestTimeoutMs: overrides.requestTimeoutMs ?? 5000,
    evidenceWritesEnabled: overrides.evidenceWritesEnabled ?? false,
    evidenceWritesRequired: overrides.evidenceWritesRequired ?? false,
    evidenceRooms: overrides.evidenceRooms ?? {
      approvals: null,
      provenance: null,
      verification: null,
      topicChanges: null
    },
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
    readRoomPowerLevels: overrides.readRoomPowerLevels ?? (async () => ({
      users: {
        "@user:matrix.example": 100
      },
      users_default: 0,
      events: {
        "m.room.topic": 50
      },
      events_default: 0,
      state_default: 50
    })),
    updateRoomTopic: overrides.updateRoomTopic ?? (async () => ({
      transactionId: "txn_test"
    })),
    sendRoomMessage: overrides.sendRoomMessage ?? (async () => ({
      transactionId: "$message:matrix.example"
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
    appAuthReady: overrides.appAuthReady ?? true,
    instanceReady: overrides.instanceReady ?? true,
    baseUrl: overrides.baseUrl ?? "https://api.github.example",
    token: overrides.token ?? "test-github-token",
    appId: overrides.appId ?? "123456",
    appPrivateKey: overrides.appPrivateKey ?? "-----BEGIN PRIVATE KEY-----\\ntest\\n-----END PRIVATE KEY-----",
    appSlug: overrides.appSlug ?? "test-app",
    installationId: overrides.installationId ?? 67890,
    installationTokenOverride: overrides.installationTokenOverride === undefined
      ? "test-github-token"
      : overrides.installationTokenOverride,
    allowedRepos,
    allowedRepoSet: overrides.allowedRepoSet ?? new Set(allowedRepos),
    agentApiKey: overrides.agentApiKey ?? null,
    defaultOwner: overrides.defaultOwner ?? "acme",
    branchPrefix: overrides.branchPrefix ?? "mosaicstacked/github",
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
