export type SettingsLoginAdapterStatus =
  | "available"
  | "connected"
  | "locked"
  | "checking"
  | "unavailable"
  | "error";

export type SettingsLoginAdapterAction =
  | "connect"
  | "disconnect"
  | "open"
  | "retry"
  | "configure";

export type SettingsLoginAdapter = {
  id: "admin" | "github" | "matrix" | "chat";
  label: string;
  status: SettingsLoginAdapterStatus;
  primaryAction: SettingsLoginAdapterAction;
  safeIdentityLabel: string;
  scopeSummary: string;
  expertDetails: Array<{ label: string; value: string }>;
  requirements: string[];
  authority: string;
};

type SettingsLoginAdapterCopy = {
  authenticated: string;
  checking: string;
  locked: string;
  ready: string;
  unavailable: string;
  error: string;
  none: string;
  configureBackend: string;
  connect: string;
  disconnect: string;
  open: string;
  retry: string;
};

export type DeriveSettingsLoginAdaptersInput = {
  copy: SettingsLoginAdapterCopy;
  authSession: {
    status: "loading" | "locked" | "authenticated";
    error: string | null;
  };
  backend: {
    healthy: boolean | null;
    label: string;
  };
  github: {
    configured: boolean | null;
    ready: boolean | null;
    connectionLabel: string;
    repositoryLabel: string;
    accessLabel: string;
  };
  matrix: {
    configured: boolean | null;
    ready: boolean | null;
    identityLabel: string;
    connectionLabel: string;
    homeserverLabel: string;
    scopeLabel: string;
  };
  chat: {
    activeAlias: string | null;
    availableCount: number;
  };
};

function statusActionLabel(action: SettingsLoginAdapterAction, copy: SettingsLoginAdapterCopy) {
  switch (action) {
    case "connect":
      return copy.connect;
    case "disconnect":
      return copy.disconnect;
    case "open":
      return copy.open;
    case "retry":
      return copy.retry;
    case "configure":
      return copy.configureBackend;
    default:
      return action;
  }
}

export function deriveSettingsLoginAdapters(input: DeriveSettingsLoginAdaptersInput): SettingsLoginAdapter[] {
  const { copy } = input;
  const adminConnected = input.authSession.status === "authenticated";
  const adminStatus: SettingsLoginAdapterStatus = input.authSession.status === "loading"
    ? "checking"
    : input.authSession.error
      ? "error"
      : adminConnected
        ? "connected"
        : "locked";
  const githubStatus: SettingsLoginAdapterStatus = input.authSession.status === "loading"
    ? "checking"
    : input.authSession.error
      ? "error"
      : !adminConnected
        ? "locked"
        : input.github.configured === false || input.github.ready === false
          ? "unavailable"
          : "available";
  const matrixStatus: SettingsLoginAdapterStatus = input.matrix.connectionLabel === copy.error
    ? "error"
    : input.matrix.configured === false || input.matrix.ready === false
      ? "unavailable"
      : input.matrix.connectionLabel === copy.checking
        ? "checking"
        : "available";
  const chatStatus: SettingsLoginAdapterStatus = input.backend.healthy === false
    ? "unavailable"
    : input.backend.healthy === null
      ? "checking"
      : "available";

  const adapters: SettingsLoginAdapter[] = [
    {
      id: "admin",
      label: "Admin session",
      status: adminStatus,
      primaryAction: adminConnected ? "disconnect" : adminStatus === "checking" ? "retry" : "connect",
      safeIdentityLabel: adminConnected ? copy.authenticated : adminStatus === "checking" ? copy.checking : copy.locked,
      scopeSummary: "HttpOnly backend session",
      expertDetails: [
        { label: "Authority", value: "/api/auth/*" },
        { label: "Session", value: input.authSession.status },
        { label: "Backend", value: input.backend.label }
      ],
      requirements: adminConnected ? [] : ["MODEL_GATE_ADMIN_PASSWORD", "MODEL_GATE_SESSION_SECRET"],
      authority: "/api/auth/login, /api/auth/me, /api/auth/logout"
    },
    {
      id: "github",
      label: "GitHub",
      status: githubStatus,
      primaryAction: adminConnected ? "open" : "connect",
      safeIdentityLabel: adminConnected ? input.github.connectionLabel : copy.locked,
      scopeSummary: input.github.repositoryLabel,
      expertDetails: [
        { label: "Authority", value: "/api/github/* + /api/auth/me" },
        { label: "Configured", value: input.github.configured === null ? copy.unavailable : String(input.github.configured) },
        { label: "Ready", value: input.github.ready === null ? copy.unavailable : String(input.github.ready) },
        { label: "Access", value: adminConnected ? input.github.accessLabel : copy.locked }
      ],
      requirements: adminConnected ? [] : ["Admin session"],
      authority: "/api/github/*"
    },
    {
      id: "matrix",
      label: "Matrix",
      status: matrixStatus,
      primaryAction: matrixStatus === "unavailable" ? "configure" : matrixStatus === "error" ? "retry" : "open",
      safeIdentityLabel: input.matrix.identityLabel,
      scopeSummary: input.matrix.scopeLabel,
      expertDetails: [
        { label: "Authority", value: "/api/matrix/whoami + /api/matrix/*" },
        { label: "Configured", value: input.matrix.configured === null ? copy.unavailable : String(input.matrix.configured) },
        { label: "Ready", value: input.matrix.ready === null ? copy.unavailable : String(input.matrix.ready) },
        { label: "Homeserver", value: input.matrix.homeserverLabel }
      ],
      requirements: matrixStatus === "unavailable" ? ["MATRIX_ENABLED", "MATRIX_BASE_URL", "MATRIX_ACCESS_TOKEN"] : [],
      authority: "/api/matrix/*"
    },
    {
      id: "chat",
      label: "Chat",
      status: chatStatus,
      primaryAction: chatStatus === "unavailable" ? "retry" : "open",
      safeIdentityLabel: input.chat.activeAlias ?? copy.none,
      scopeSummary: `${input.chat.availableCount} public alias(es)`,
      expertDetails: [
        { label: "Authority", value: "/health, /models, /chat" },
        { label: "Backend", value: input.backend.label }
      ],
      requirements: chatStatus === "unavailable" ? ["OPENROUTER_API_KEY"] : [],
      authority: "/chat"
    }
  ];

  return adapters.map((adapter) => ({
    ...adapter,
    expertDetails: [
      ...adapter.expertDetails,
      { label: "Primary action", value: statusActionLabel(adapter.primaryAction, copy) }
    ]
  }));
}
