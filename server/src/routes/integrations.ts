import type { FastifyInstance, FastifyRequest } from "fastify";
import type { GitHubConfig } from "../lib/github-env.js";
import type { AppEnv } from "../lib/env.js";
import { getGitHubOAuthRequirements } from "../lib/integration-auth-config.js";
import type { MatrixConfig } from "../lib/matrix-env.js";
import type { IntegrationAuthStore, IntegrationConnectionRecord, IntegrationProvider } from "../lib/integration-auth-store.js";

const INTEGRATION_SESSION_COOKIE = "mosaicstacked_integration_session";

type IntegrationConnectionStatus =
  | "not_connected"
  | "connect_available"
  | "connected"
  | "auth_expired"
  | "missing_server_config"
  | "scope_denied"
  | "upstream_unreachable"
  | "disabled_by_policy"
  | "error";

type IntegrationCredentialSource =
  | "instance_configured"
  | "user_connected"
  | "user_connected_stub"
  | "not_connected";

type IntegrationAuthState =
  | "user_connected"
  | "user_connected_stub"
  | "auth_expired"
  | "not_configured"
  | "error"
  | "not_connected";

type IntegrationCapabilityLevel = "available" | "blocked" | "unknown";
type IntegrationExecuteCapabilityLevel = "available" | "approval_required" | "blocked" | "unknown";
type IntegrationExecutionMode = "disabled" | "approval_required" | "enabled";

type IntegrationCapability = {
  read: IntegrationCapabilityLevel;
  propose: IntegrationCapabilityLevel;
  execute: IntegrationExecuteCapabilityLevel;
  verify: IntegrationCapabilityLevel;
};

type IntegrationStatusPayload = {
  status: IntegrationConnectionStatus;
  authState: IntegrationAuthState;
  credentialSource: IntegrationCredentialSource;
  capabilities: IntegrationCapability;
  executionMode: IntegrationExecutionMode;
  labels: {
    identity: string | null;
    scope: string | null;
    allowedReposStatus?: "configured" | "restricted" | "missing";
    homeserver?: string | null;
    roomAccess?: "readable" | "blocked" | "unknown";
  };
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  requirements: string[];
};

type IntegrationRouteDependencies = {
  env: AppEnv;
  githubConfig: GitHubConfig;
  matrixConfig: MatrixConfig;
  authStore: IntegrationAuthStore;
};

function readIntegrationSessionCookie(request: FastifyRequest) {
  const cookieHeader = Array.isArray(request.headers.cookie)
    ? request.headers.cookie[0]
    : request.headers.cookie;

  if (!cookieHeader) {
    return null;
  }

  for (const segment of cookieHeader.split(";")) {
    const trimmed = segment.trim();

    if (!trimmed.startsWith(`${INTEGRATION_SESSION_COOKIE}=`)) {
      continue;
    }

    try {
      return decodeURIComponent(trimmed.slice(INTEGRATION_SESSION_COOKIE.length + 1));
    } catch {
      return null;
    }
  }

  return null;
}

function getCredentialSource(configReady: boolean, connection: IntegrationConnectionRecord | null): IntegrationCredentialSource {
  if (connection?.connected) {
    return connection.source;
  }

  if (configReady) {
    return "instance_configured";
  }

  return "not_connected";
}

function getAuthState(options: {
  configReady: boolean;
  connection: IntegrationConnectionRecord | null;
  lastErrorCode: string | null;
}): IntegrationAuthState {
  if (options.lastErrorCode === "auth_expired") {
    return "auth_expired";
  }

  if (options.lastErrorCode) {
    return "error";
  }

  if (options.connection?.connected) {
    return options.connection.source === "user_connected" ? "user_connected" : "user_connected_stub";
  }

  if (!options.configReady) {
    return "not_configured";
  }

  return "not_connected";
}

function getConnectionStatus(options: {
  credentialSource: IntegrationCredentialSource;
  configEnabled: boolean;
  configReady: boolean;
  lastErrorCode: string | null;
}): IntegrationConnectionStatus {
  if (options.lastErrorCode) {
    if (options.lastErrorCode === "auth_expired") {
      return "auth_expired";
    }

    if (options.lastErrorCode === "scope_denied") {
      return "scope_denied";
    }

    if (options.lastErrorCode === "upstream_unreachable") {
      return "upstream_unreachable";
    }

    return "error";
  }

  if (options.credentialSource === "user_connected" || options.credentialSource === "user_connected_stub") {
    return "connected";
  }

  if (options.configEnabled && !options.configReady) {
    return "missing_server_config";
  }

  return "connect_available";
}

function deriveGitHubExecutionMode(config: GitHubConfig): IntegrationExecutionMode {
  if (!config.ready) {
    return "disabled";
  }

  if (!config.agentApiKey || config.agentApiKey.trim().length === 0) {
    return "disabled";
  }

  return "approval_required";
}

function deriveMatrixExecutionMode(config: MatrixConfig): IntegrationExecutionMode {
  if (!config.ready) {
    return "disabled";
  }

  return "approval_required";
}

function buildCapabilities(configReady: boolean, executionMode: IntegrationExecutionMode): IntegrationCapability {
  if (!configReady) {
    return {
      read: "blocked",
      propose: "blocked",
      execute: "blocked",
      verify: "blocked"
    };
  }

  return {
    read: "available",
    propose: "available",
    execute: executionMode === "approval_required"
      ? "approval_required"
      : executionMode === "enabled"
        ? "available"
        : "blocked",
    verify: "available"
  };
}

function deriveAllowedReposStatus(config: GitHubConfig): "configured" | "restricted" | "missing" {
  if (config.allowedRepos.length === 0) {
    return "missing";
  }

  if (config.allowedRepos.length === 1) {
    return "restricted";
  }

  return "configured";
}

function buildGithubScopeLabel(config: GitHubConfig) {
  if (config.allowedRepos.length === 0) {
    return "No allowed repositories configured.";
  }

  return `${config.allowedRepos.length} allowed repos`;
}

function getGitHubWorkspaceRequirements(config: GitHubConfig) {
  const requirements: string[] = [];

  if (!config.token) {
    requirements.push("GITHUB_TOKEN");
  }

  if (config.allowedRepos.length === 0) {
    requirements.push("GITHUB_ALLOWED_REPOS");
  }

  return requirements;
}

function getGitHubStatusRequirements(env: AppEnv, config: GitHubConfig) {
  const oauthRequirements = getGitHubOAuthRequirements(env);

  return oauthRequirements.length > 0
    ? oauthRequirements
    : getGitHubWorkspaceRequirements(config);
}

function buildMatrixScopeLabel(config: MatrixConfig) {
  if (!config.ready) {
    return "Matrix scope unavailable until backend config is ready.";
  }

  return "Matrix room scope remains backend-governed.";
}

function providerIdentityFallback(provider: IntegrationProvider, credentialSource: IntegrationCredentialSource) {
  if (provider === "github") {
    return credentialSource === "instance_configured"
      ? "instance service credential"
      : null;
  }

  return credentialSource === "instance_configured"
    ? "instance service credential"
    : null;
}

function buildGithubStatus(env: AppEnv, config: GitHubConfig, connection: IntegrationConnectionRecord | null): IntegrationStatusPayload {
  const credentialSource = getCredentialSource(config.ready, connection);
  const lastErrorCode = connection?.lastErrorCode ?? null;
  const hasUserCredential = connection?.connected === true && connection.source === "user_connected";
  const githubOperationalReady = hasUserCredential || config.ready;
  const authState = getAuthState({
    configReady: githubOperationalReady,
    connection,
    lastErrorCode
  });
  const status = getConnectionStatus({
    credentialSource,
    configEnabled: config.enabled,
    configReady: githubOperationalReady,
    lastErrorCode
  });
  const executionMode = deriveGitHubExecutionMode(config);

  return {
    status,
    authState,
    credentialSource,
    capabilities: buildCapabilities(githubOperationalReady, executionMode),
    executionMode,
    labels: {
      identity: connection?.safeIdentityLabel ?? providerIdentityFallback("github", credentialSource),
      scope: buildGithubScopeLabel(config),
      allowedReposStatus: deriveAllowedReposStatus(config)
    },
    lastVerifiedAt: connection?.lastVerifiedAt ?? null,
    lastErrorCode,
    requirements: status === "missing_server_config" ? getGitHubStatusRequirements(env, config) : []
  };
}

function buildMatrixStatus(config: MatrixConfig, connection: IntegrationConnectionRecord | null): IntegrationStatusPayload {
  const credentialSource = getCredentialSource(config.ready, connection);
  const lastErrorCode = connection?.lastErrorCode ?? null;
  const authState = getAuthState({
    configReady: config.ready,
    connection,
    lastErrorCode
  });
  const status = getConnectionStatus({
    credentialSource,
    configEnabled: config.enabled,
    configReady: config.ready,
    lastErrorCode
  });
  const executionMode = deriveMatrixExecutionMode(config);

  return {
    status,
    authState,
    credentialSource,
    capabilities: buildCapabilities(config.ready, executionMode),
    executionMode,
    labels: {
      identity: connection?.safeIdentityLabel ?? config.expectedUserId ?? providerIdentityFallback("matrix", credentialSource),
      scope: buildMatrixScopeLabel(config),
      homeserver: config.homeserverUrl,
      roomAccess: config.ready ? "readable" : "unknown"
    },
    lastVerifiedAt: connection?.lastVerifiedAt ?? null,
    lastErrorCode,
    requirements: status === "missing_server_config"
      ? ["MATRIX_ENABLED", "MATRIX_BASE_URL", "MATRIX_ACCESS_TOKEN"]
      : []
  };
}

export function integrationRoutes(app: FastifyInstance, deps: IntegrationRouteDependencies) {
  app.get("/api/integrations/status", async (request, reply) => {
    const sessionId = readIntegrationSessionCookie(request);
    const githubConnection = deps.authStore.readConnection(sessionId, "github");
    const matrixConnection = deps.authStore.readConnection(sessionId, "matrix");

    reply.header("Cache-Control", "no-store");
    return reply.status(200).send({
      ok: true,
      generatedAt: new Date().toISOString(),
      github: buildGithubStatus(deps.env, deps.githubConfig, githubConnection),
      matrix: buildMatrixStatus(deps.matrixConfig, matrixConnection)
    });
  });
}
