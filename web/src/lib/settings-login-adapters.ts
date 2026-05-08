import type {
  IntegrationConnectionStatus,
  IntegrationsStatusResponse
} from "./api.js";

export type SettingsLoginAdapterStatus = IntegrationConnectionStatus | "checking";

export type SettingsLoginAdapterAction =
  | "connect"
  | "reconnect"
  | "disconnect"
  | "reverify";

export type SettingsCredentialSource =
  | "instance_configured"
  | "user_connected"
  | "user_connected_stub"
  | "not_connected";

export type SettingsLoginAdapter = {
  id: "github" | "matrix";
  label: string;
  status: SettingsLoginAdapterStatus;
  primaryAction: SettingsLoginAdapterAction;
  secondaryAction: SettingsLoginAdapterAction | null;
  credentialSource: SettingsCredentialSource;
  safeIdentityLabel: string;
  scopeSummary: string;
  capabilitySummary: string;
  executionMode: "disabled" | "approval_required" | "enabled";
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
  expertDetails: Array<{ label: string; value: string }>;
  requirements: string[];
  authority: string;
};

type SettingsLoginAdapterCopy = {
  checking: string;
  unavailable: string;
  none: string;
};

export type DeriveSettingsLoginAdaptersInput = {
  copy: SettingsLoginAdapterCopy;
  integrations: IntegrationsStatusResponse | null;
};

function summarizeCapabilities(capabilities: {
  read: string;
  propose: string;
  execute: string;
  verify: string;
}) {
  return `read:${capabilities.read} propose:${capabilities.propose} execute:${capabilities.execute} verify:${capabilities.verify}`;
}

function buildSafeIdentityLabel(options: {
  provider: "github" | "matrix";
  status: SettingsLoginAdapterStatus;
  identity: string | null;
  fallback: string;
}) {
  const identity = options.identity?.trim() ?? "";

  if (identity.length === 0) {
    return options.fallback;
  }

  if (options.provider === "github" && options.status === "connected") {
    return `Connected as ${identity}`;
  }

  return identity;
}

function primaryActionForStatus(status: SettingsLoginAdapterStatus): SettingsLoginAdapterAction {
  if (status === "connected") {
    return "reverify";
  }

  if (status === "connect_available" || status === "not_connected") {
    return "connect";
  }

  return "reconnect";
}

function secondaryActionForStatus(status: SettingsLoginAdapterStatus): SettingsLoginAdapterAction | null {
  if (status === "connected") {
    return "disconnect";
  }

  return null;
}

function buildCheckingAdapters(copy: SettingsLoginAdapterCopy): SettingsLoginAdapter[] {
  const shared = {
    status: "checking" as const,
    credentialSource: "not_connected" as const,
    primaryAction: "connect" as const,
    secondaryAction: null,
    safeIdentityLabel: copy.checking,
    capabilitySummary: copy.checking,
    executionMode: "disabled" as const,
    lastVerifiedAt: null,
    lastErrorCode: null,
    expertDetails: [
      { label: "Status", value: copy.checking }
    ],
    requirements: []
  };

  return [
    {
      id: "github",
      label: "GitHub",
      ...shared,
      scopeSummary: copy.checking,
      authority: "/api/auth/github/* + /api/github/*"
    },
    {
      id: "matrix",
      label: "Matrix",
      ...shared,
      scopeSummary: copy.checking,
      authority: "/api/auth/matrix/* + /api/matrix/*"
    }
  ];
}

export function deriveSettingsLoginAdapters(input: DeriveSettingsLoginAdaptersInput): SettingsLoginAdapter[] {
  const { copy } = input;

  if (!input.integrations) {
    return buildCheckingAdapters(copy);
  }

  const github = input.integrations.github;
  const matrix = input.integrations.matrix;

  const githubRequirements = github.requirements ?? (github.status === "missing_server_config"
    ? ["GITHUB_APP_ID", "GITHUB_APP_PRIVATE_KEY", "GITHUB_APP_SLUG", "MOSAIC_STACK_SESSION_SECRET"]
    : []);
  const matrixRequirements = matrix.requirements ?? (matrix.status === "missing_server_config"
    ? ["MATRIX_ENABLED", "MATRIX_BASE_URL", "MATRIX_ACCESS_TOKEN"]
    : []);

  return [
    {
      id: "github",
      label: "GitHub",
      status: github.status,
      credentialSource: github.credentialSource,
      primaryAction: primaryActionForStatus(github.status),
      secondaryAction: secondaryActionForStatus(github.status),
      safeIdentityLabel: buildSafeIdentityLabel({
        provider: "github",
        status: github.status,
        identity: github.labels.identity,
        fallback: copy.unavailable
      }),
      scopeSummary: github.labels.scope ?? copy.none,
      capabilitySummary: summarizeCapabilities(github.capabilities),
      executionMode: github.executionMode,
      lastVerifiedAt: github.lastVerifiedAt,
      lastErrorCode: github.lastErrorCode,
      expertDetails: [
        { label: "Allowed repos", value: github.labels.allowedReposStatus ?? copy.none },
        { label: "Capabilities", value: summarizeCapabilities(github.capabilities) },
        { label: "Execution mode", value: github.executionMode }
      ],
      requirements: githubRequirements,
      authority: "/api/auth/github/* + /api/github/*"
    },
    {
      id: "matrix",
      label: "Matrix",
      status: matrix.status,
      credentialSource: matrix.credentialSource,
      primaryAction: primaryActionForStatus(matrix.status),
      secondaryAction: secondaryActionForStatus(matrix.status),
      safeIdentityLabel: buildSafeIdentityLabel({
        provider: "matrix",
        status: matrix.status,
        identity: matrix.labels.identity,
        fallback: copy.unavailable
      }),
      scopeSummary: matrix.labels.scope ?? copy.none,
      capabilitySummary: summarizeCapabilities(matrix.capabilities),
      executionMode: matrix.executionMode,
      lastVerifiedAt: matrix.lastVerifiedAt,
      lastErrorCode: matrix.lastErrorCode,
      expertDetails: [
        { label: "Homeserver", value: matrix.labels.homeserver ?? copy.none },
        { label: "Room access", value: matrix.labels.roomAccess ?? copy.none },
        { label: "Capabilities", value: summarizeCapabilities(matrix.capabilities) },
        { label: "Execution mode", value: matrix.executionMode }
      ],
      requirements: matrixRequirements,
      authority: "/api/auth/matrix/* + /api/matrix/*"
    }
  ];
}
