export type CompanionWorkspace = "chat" | "workbench" | "matrix" | "settings";
export type CompanionWorkMode = "beginner" | "expert";
export type CompanionFreshness = "backend-fresh" | "local-restored" | "stale";

export type CompanionContext = {
  workspace: CompanionWorkspace;
  workMode: CompanionWorkMode;
  freshness: CompanionFreshness;
  backend: {
    healthy: boolean | null;
  };
  model: {
    publicAlias: string | null;
  };
  integrations: {
    github: CompanionIntegrationSummary | null;
    matrix: CompanionIntegrationSummary | null;
  };
  sessions: {
    chat: CompanionChatSummary | null;
    github: CompanionGitHubSummary | null;
    matrix: CompanionMatrixSummary | null;
  };
  journal: CompanionJournalSummary[];
};

export type CompanionIntegrationSummary = {
  status: string;
  credentialSource: string;
  executionMode: string;
  read: string;
  propose: string;
  execute: string;
  verify: string;
  identityLabel: string | null;
  scopeLabel: string | null;
  lastVerifiedAt: string | null;
  lastErrorCode: string | null;
};

export type CompanionChatSummary = {
  connectionState: string | null;
  messageCount: number;
  pendingProposalStatus: string | null;
  receiptCount: number;
};

export type CompanionGitHubSummary = {
  selectedRepoFullName: string | null;
  hasPendingDraft: boolean;
  hasAnalysisBundle: boolean;
  hasProposalPlan: boolean;
  approvalChecked: boolean | null;
  hasExecutionResult: boolean;
  hasVerificationResult: boolean;
};

export type CompanionMatrixSummary = {
  roomId: string | null;
  roomName: string | null;
  selectedRoomCount: number;
  selectedSpaceCount: number;
  hasScope: boolean;
  hasScopeSummary: boolean;
  approvalPending: boolean | null;
  hasDraft: boolean;
  lastActionResult: string | null;
};

export type CompanionJournalSummary = {
  source: string;
  eventType: string;
  severity: string;
  outcome: string;
  summary: string;
  timestamp: string;
  selectedAlias: string | null;
};

type LooseRecord = Record<string, unknown>;

type CompanionContextInput = {
  workspace: CompanionWorkspace;
  workMode: CompanionWorkMode;
  freshness: CompanionFreshness;
  backendHealthy: boolean | null;
  activeModelAlias: string | null;
  integrationsStatus?: unknown;
  runtimeJournalEntries?: unknown[];
  chatSession?: unknown;
  githubSession?: unknown;
  matrixSession?: unknown;
};

function isRecord(value: unknown): value is LooseRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function readString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value.trim() : null;
}

function readBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readArray(value: unknown) {
  return Array.isArray(value) ? value : [];
}

function readMetadata(session: unknown) {
  if (!isRecord(session)) {
    return null;
  }

  return isRecord(session.metadata) ? session.metadata : null;
}

function summarizeIntegration(value: unknown): CompanionIntegrationSummary | null {
  if (!isRecord(value)) {
    return null;
  }

  const capabilities = isRecord(value.capabilities) ? value.capabilities : {};
  const labels = isRecord(value.labels) ? value.labels : {};

  return {
    status: readString(value.status) ?? "unknown",
    credentialSource: readString(value.credentialSource) ?? "unknown",
    executionMode: readString(value.executionMode) ?? "unknown",
    read: readString(capabilities.read) ?? "unknown",
    propose: readString(capabilities.propose) ?? "unknown",
    execute: readString(capabilities.execute) ?? "unknown",
    verify: readString(capabilities.verify) ?? "unknown",
    identityLabel: readString(labels.identity),
    scopeLabel: readString(labels.scope),
    lastVerifiedAt: readString(value.lastVerifiedAt),
    lastErrorCode: readString(value.lastErrorCode),
  };
}

function summarizeChat(session: unknown): CompanionChatSummary | null {
  const metadata = readMetadata(session);
  const chatState = isRecord(metadata?.chatState) ? metadata.chatState : null;

  if (!chatState) {
    return null;
  }

  const pendingProposal = isRecord(chatState.pendingProposal) ? chatState.pendingProposal : null;

  return {
    connectionState: readString(chatState.connectionState),
    messageCount: readArray(chatState.messages).length,
    pendingProposalStatus: readString(pendingProposal?.status),
    receiptCount: readArray(chatState.receipts).length,
  };
}

function summarizeGitHub(session: unknown): CompanionGitHubSummary | null {
  const metadata = readMetadata(session);

  if (!metadata) {
    return null;
  }

  return {
    selectedRepoFullName: readString(metadata.selectedRepoFullName),
    hasPendingDraft: isRecord(metadata.pendingDraft),
    hasAnalysisBundle: isRecord(metadata.analysisBundle),
    hasProposalPlan: isRecord(metadata.proposalPlan),
    approvalChecked: readBoolean(metadata.approvalChecked),
    hasExecutionResult: isRecord(metadata.executionResult),
    hasVerificationResult: isRecord(metadata.verificationResult),
  };
}

function summarizeMatrix(session: unknown): CompanionMatrixSummary | null {
  const metadata = readMetadata(session);

  if (!metadata) {
    return null;
  }

  return {
    roomId: readString(metadata.roomId),
    roomName: readString(metadata.roomName),
    selectedRoomCount: readArray(metadata.selectedRoomIds).length,
    selectedSpaceCount: readArray(metadata.selectedSpaceIds).length,
    hasScope: isRecord(metadata.currentScope),
    hasScopeSummary: isRecord(metadata.scopeSummary),
    approvalPending: readBoolean(metadata.approvalPending),
    hasDraft: Boolean(readString(metadata.draftContent)),
    lastActionResult: readString(metadata.lastActionResult),
  };
}

function summarizeJournal(entries: unknown[] | undefined): CompanionJournalSummary[] {
  return (entries ?? []).flatMap((entry) => {
    if (!isRecord(entry)) {
      return [];
    }

    const route = isRecord(entry.modelRouteSummary) ? entry.modelRouteSummary : {};
    const summary = readString(entry.summary);
    const timestamp = readString(entry.timestamp);

    if (!summary || !timestamp) {
      return [];
    }

    return [{
      source: readString(entry.source) ?? "system",
      eventType: readString(entry.eventType) ?? "event",
      severity: readString(entry.severity) ?? "info",
      outcome: readString(entry.outcome) ?? "observed",
      summary,
      timestamp,
      selectedAlias: readString(route.selectedAlias),
    }];
  }).slice(0, 5);
}

export function buildCompanionContext(input: CompanionContextInput): CompanionContext {
  const integrations = isRecord(input.integrationsStatus) ? input.integrationsStatus : {};

  return {
    workspace: input.workspace,
    workMode: input.workMode,
    freshness: input.freshness,
    backend: {
      healthy: input.backendHealthy,
    },
    model: {
      publicAlias: input.activeModelAlias,
    },
    integrations: {
      github: summarizeIntegration(integrations.github),
      matrix: summarizeIntegration(integrations.matrix),
    },
    sessions: {
      chat: summarizeChat(input.chatSession),
      github: summarizeGitHub(input.githubSession),
      matrix: summarizeMatrix(input.matrixSession),
    },
    journal: summarizeJournal(input.runtimeJournalEntries),
  };
}
