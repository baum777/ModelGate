import React, { createContext, useCallback, useContext, useEffect, useMemo, useState } from "react";

export type Locale = "en" | "de";

export type SessionStatus = "draft" | "in_progress" | "review_required" | "done" | "failed";
export type ReviewStatus = "pending_review" | "approved" | "rejected" | "stale" | "executed";
export type ApprovalOutcome = "executed" | "failed" | "rejected" | "unverifiable";
export type ConnectionState = "idle" | "submitting" | "streaming" | "completed" | "error";
export type WorkspaceMode = "chat" | "github" | "matrix" | "review" | "settings";

type WorkspaceTabCopy = {
  label: string;
  description: string;
};

type ShellCopy = {
  appKicker: string;
  appTitle: string;
  appDeck: string;
  workspaceConsoleKicker: string;
  workspaceConsoleTitle: string;
  workspaceConsoleNote: string;
  workspacesLabel: string;
  sessionLabel: string;
  disclosureLabel: string;
  accountLabel: string;
  languageLabel: string;
  languageOptionEnglish: string;
  languageOptionGerman: string;
  workspaceContextSuffix: string;
  diagnosticsLabel: string;
  diagnosticsShow: string;
  diagnosticsHide: string;
  activateExpert: string;
  backendPrefix: string;
  currentSessionFallback: string;
  noActiveSession: string;
  sessionIdPrefix: string;
  archivedBadge: string;
  accountAuthenticated: string;
  accountChecking: string;
  accountLocked: string;
  accountLogout: string;
  accountLoginRequired: string;
  statusReady: string;
  statusPartial: string;
  statusError: string;
  pendingApprovalsTitle: string;
  pendingApprovalsSummary: (pending: number, stale: number) => string;
  pendingApprovalsChat: string;
  pendingApprovalsSeparate: string;
  diagnosticsAvailable: string;
  diagnosticsHidden: string;
  healthTitle: string;
  healthReady: string;
  healthChecking: string;
  healthUnavailable: string;
  healthReadyDetail: string;
  healthCheckingDetail: string;
  healthUnavailableDetail: string;
  modeLabel: string;
  publicAliasLabel: string;
  workspaceTabs: Record<WorkspaceMode, WorkspaceTabCopy>;
};

type SessionListCopy = {
  headerCount: (count: number) => string;
  newSession: string;
  noSessions: string;
  archived: string;
  active: string;
  updated: string;
  openedJustNow: string;
  openedRecently: (when: string) => string;
  archive: string;
  delete: string;
};

type ApprovalCopy = {
  proposalSection: string;
  consequenceLabel: string;
  executionSection: string;
  receiptSection: string;
  statusRequired: string;
  approve: string;
  reject: string;
  running: string;
  runningTitle: string;
  runningDetail: string;
  receiptExecuted: string;
  receiptFailed: string;
  receiptRejected: string;
  receiptUnverifiable: string;
  receiptPending: string;
};

type ReviewCopy = {
  heroStatus: string;
  title: string;
  intro: string;
  panelTitle: string;
  panelBadgeEmpty: string;
  panelBadgeActive: string;
  openReviews: string;
  nextStepLabel: string;
  emptyTitle: string;
  emptyBody: string;
  queueTitle: string;
  queueHeader: string;
  warning: string;
  rowOpen: string;
  rowClassification: string;
  ready: string;
  blocked: string;
  approvalNeeded: string;
  executing: string;
  terminalDeviation: string;
};

type SettingsCopy = {
  heroStatus: string;
  title: string;
  intro: string;
  viewCardTitle: string;
  identityCardTitle: string;
  modelCardTitle: string;
  diagnosticsCardTitle: string;
  beginner: string;
  expert: string;
  backend: string;
  githubIdentity: string;
  githubConnection: string;
  githubAuthority: string;
  githubScope: string;
  matrixIdentity: string;
  matrixConnection: string;
  matrixHomeserver: string;
  matrixScope: string;
  chatIdentity: string;
  chatScope: string;
  chatAuthority: string;
  backendTruth: string;
  backendPolicy: string;
  modelChoiceNote: string;
  diagnosticsHidden: string;
  diagnosticsEmpty: string;
  clearDiagnostics: string;
  connectionTruthNote: string;
  modelSourceLabel: string;
};

type AuthCopy = {
  statusAuthenticated: string;
  statusChecking: string;
  statusLocked: string;
  title: string;
  intro: string;
  cardTitle: string;
  cardSubtitle: string;
  passwordLabel: string;
  submit: string;
  submitBusy: string;
  hint: string;
  footerNote: string;
};

type ChatCopy = {
  title: string;
  intro: string;
  sessionLabel: string;
  modelSelectLabel: string;
  noModels: string;
  onlyPublicAlias: string;
  modelHintFallback: string;
  conversationState: string;
  stopExecution: string;
  clearNotices: string;
  proposalTitle: string;
  proposalHelper: string;
  executingTitle: string;
  executingDetail: (alias: string) => string;
  emptyState: string;
  operatorInput: string;
  agentResponse: string;
  agentDraft: string;
  errorNotice: string;
  systemNotice: string;
  noticeError: string;
  noticeSystem: string;
  composerPlaceholder: string;
  prepareProposal: string;
  composerHelper: string;
  composerLocked: {
    backend: string;
    model: string;
    approval: string;
    execution: string;
  };
  routePending: string;
  routeFallback: string;
  routeDegraded: string;
};

type GitHubCopy = {
  title: string;
  intro: string;
  repoSelectLabel: string;
  loadingRepos: string;
  noRepos: string;
  connectedRepo: string;
  repoSelected: string;
  noRepoSelected: string;
  nextStepLabel: string;
  nextStepChooseRepo: string;
  nextStepAnalysis: string;
  nextStepProposal: string;
  nextStepReadOnly: string;
  readOnly: string;
  readOnlyActive: string;
  actionReadTitle: string;
  actionReadBody: string;
  actionProposalTitle: string;
  actionProposalBody: string;
  reviewTitle: string;
  analysisTitle: string;
  reviewEmpty: string;
  proposalEmpty: string;
  planFileChanged: string;
  planFileModified: string;
  staleProposal: string;
  approveLabel: string;
  rejectLabel: string;
  approving: string;
  approveHelper: string;
  openInGitHub: string;
  verifyResult: string;
  verifyBusy: string;
  diffAppearsLater: string;
  workspaceNoticeStale: string;
  workspaceNoticeExecution: string;
  workspaceNoticeVerification: string;
  workspaceNoticeAnalysis: string;
  workspaceNoticeProposal: string;
  workspaceNoticeRepos: string;
  workspaceNoticeSelection: string;
  repositoryStatus: string;
  privateRepo: string;
  publicRepo: string;
  targetBranch: string;
  defaultBranch: string;
  loadingSelection: string;
  modelLabel: string;
};

type MatrixCopy = {
  title: string;
  intro: string;
  scopeTitle: string;
  scopeInputTitle: string;
  scopeSummaryTitle: string;
  hierarchyTitle: string;
  hierarchyAdvisory: string;
  hierarchyEmpty: string;
  hierarchySpaceId: string;
  hierarchyRoomsEmpty: string;
  joinedRoomsTitle: string;
  selectedScopeTitle: string;
  resolveScope: string;
  resolvingScope: string;
  scopeUnresolved: string;
  scopeSummaryLoading: string;
  scopeSummaryUnavailable: string;
  scopeSummaryReady: string;
  scopePreview: string;
  scopeAddSpace: string;
  scopeRemove: string;
  scopeSelected: string;
  scopeSelectedLabel: string;
  composerTitle: string;
  threadContextTitle: string;
  threadOpen: string;
  threadLeave: string;
  threadNone: string;
  threadOpenHint: string;
  threadLeaveHint: string;
  composerModeLabel: string;
  composerTargetLabel: string;
  composerTargetMissing: string;
  composerTargetSet: string;
  newPost: string;
  reply: string;
  thread: string;
  replyInThread: string;
  clearTarget: string;
  targetContextTitle: string;
  roomId: string;
  roomName: string;
  postId: string;
  threadRootId: string;
  draft: string;
  draftPlaceholder: string;
  submit: string;
  submitBusy: string;
  submitBlocked: string;
  submitFailClosed: string;
  scopeNotice: string;
  scopeSummaryInfo: string;
  topicTitle: string;
  topicStatusReady: string;
  topicStatusPending: string;
  topicStatusBlocked: string;
  topicStatusVerified: string;
  topicStatusMismatch: string;
  topicStatusOpen: string;
  topicStatusApproval: string;
  topicStatusLoaded: string;
  topicStatusLoading: string;
  topicStatusUnavailable: string;
  topicStatusBrowserPreview: string;
  topicStatusNoPreview: string;
  roomPickerLoading: string;
  roomPickerEmpty: string;
  roomPickerChoose: string;
  roomPickerRoom: string;
  roomPickerSpace: string;
  composerModePost: string;
  composerModeReply: string;
  composerModeThread: string;
  composerModeThreadReply: string;
  composerDraftLabel: string;
};

type CommonCopy = {
  na: string;
  none: string;
  loading: string;
  ready: string;
  partial: string;
  error: string;
  blocked: string;
  active: string;
  inactive: string;
  justNow: string;
};

type LocalizationCopy = {
  common: CommonCopy;
  shell: ShellCopy;
  sessionList: SessionListCopy;
  approval: ApprovalCopy;
  review: ReviewCopy;
  settings: SettingsCopy;
  auth: AuthCopy;
  chat: ChatCopy;
  github: GitHubCopy;
  matrix: MatrixCopy;
};

const EN_COPY: LocalizationCopy = {
  common: {
    na: "n/a",
    none: "None",
    loading: "Loading",
    ready: "Ready",
    partial: "Partial",
    error: "Error",
    blocked: "Blocked",
    active: "Active",
    inactive: "Inactive",
    justNow: "just now",
  },
  shell: {
    appKicker: "MODELGATE",
    appTitle: "ModelGate Console",
    appDeck: "Governance-first operator shell. Runtime truth stays backend-owned.",
    workspaceConsoleKicker: "WORKSPACE CONSOLE",
    workspaceConsoleTitle: "Choose workspace",
    workspaceConsoleNote: "Navigation, session context, and disclosure stay pinned on the left.",
    workspacesLabel: "Workspaces",
    sessionLabel: "Session",
    disclosureLabel: "Disclosure",
    accountLabel: "Account",
    languageLabel: "Language",
    languageOptionEnglish: "EN",
    languageOptionGerman: "DE",
    workspaceContextSuffix: "context",
    diagnosticsLabel: "Diagnostics",
    diagnosticsShow: "Show diagnostics",
    diagnosticsHide: "Hide diagnostics",
    activateExpert: "Enable Expert mode",
    backendPrefix: "Backend",
    currentSessionFallback: "Active session",
    noActiveSession: "No active session",
    sessionIdPrefix: "ID",
    archivedBadge: "Archived",
    accountAuthenticated: "GitHub admin",
    accountChecking: "Checking session",
    accountLocked: "No admin login",
    accountLogout: "Log out",
    accountLoginRequired: "Admin login required",
    statusReady: "Ready",
    statusPartial: "Partial",
    statusError: "Error",
    pendingApprovalsTitle: "Pending approvals",
    pendingApprovalsSummary: (pending, stale) => `${pending} pending, ${stale} stale`,
    pendingApprovalsChat: "At least one chat proposal is waiting for approval. Further details are in the active workspace.",
    pendingApprovalsSeparate: "Approvals stay separate from execution. Check details in the Review workspace.",
    diagnosticsAvailable: "Diagnostics is available. Usage stays read-only and contextual.",
    diagnosticsHidden: "Beginner mode keeps diagnostics hidden by default. It becomes visible when something fails.",
    healthTitle: "Health",
    healthReady: "Ready",
    healthChecking: "Checking",
    healthUnavailable: "Unavailable",
    healthReadyDetail: "Backend reachable. Execution stays backend-owned.",
    healthCheckingDetail: "Backend health is loading.",
    healthUnavailableDetail: "Backend unreachable. Surface stays fail-closed.",
    modeLabel: "Mode",
    publicAliasLabel: "Public alias",
    workspaceTabs: {
      chat: { label: "Chat", description: "Ask questions and inspect responses" },
      github: { label: "GitHub", description: "Read repositories and prepare proposals" },
      matrix: { label: "Matrix", description: "Scope, provenance, and topic updates" },
      review: { label: "Review", description: "Review approvals and receipts" },
      settings: { label: "Settings", description: "View settings and diagnostics" },
    },
  },
  sessionList: {
    headerCount: (count) => `${count} total`,
    newSession: "New session",
    noSessions: "No sessions yet.",
    archived: "Archived",
    active: "Active",
    updated: "Updated",
    openedJustNow: "just opened",
    openedRecently: (when) => `last opened ${when}`,
    archive: "Archive",
    delete: "Delete",
  },
  approval: {
    proposalSection: "Proposal",
    consequenceLabel: "Consequence",
    executionSection: "Execution",
    receiptSection: "Execution receipt",
    statusRequired: "Approval required",
    approve: "Approve",
    reject: "Reject",
    running: "Running",
    runningTitle: "Approved item is executing",
    runningDetail: "Backend execution is in progress.",
    receiptExecuted: "Executed",
    receiptFailed: "Failed",
    receiptRejected: "Rejected",
    receiptUnverifiable: "Unverifiable",
    receiptPending: "Pending",
  },
  review: {
    heroStatus: "Review",
    title: "Review",
    intro: "Collect proposals, review them, and approve them. Execution stays in the backend.",
    panelTitle: "Open reviews",
    panelBadgeEmpty: "Empty",
    panelBadgeActive: "Active",
    openReviews: "Open reviews",
    nextStepLabel: "Next step",
    emptyTitle: "No open reviews yet.",
    emptyBody: "When Chat, GitHub, or Matrix prepares a proposal, it appears here for approval.",
    queueTitle: "Review queue",
    queueHeader: "All open reviews",
    warning: "This proposal is stale and must be reviewed again.",
    rowOpen: "Open",
    rowClassification: "Classification",
    ready: "Ready",
    blocked: "Blocked",
    approvalNeeded: "Approval needed",
    executing: "Execution running",
    terminalDeviation: "Terminal deviation",
  },
  settings: {
    heroStatus: "Settings",
    title: "Settings",
    intro: "Choose disclosure, verify identity and connection against backend truth, and open diagnostics in Expert mode.",
    viewCardTitle: "View",
    identityCardTitle: "Identity and connection",
    modelCardTitle: "Models",
    diagnosticsCardTitle: "Diagnostics",
    beginner: "Beginner",
    expert: "Expert",
    backend: "Backend",
    githubIdentity: "GitHub acting identity",
    githubConnection: "GitHub connection",
    githubAuthority: "GitHub authority domain",
    githubScope: "GitHub active scope",
    matrixIdentity: "Matrix acting identity",
    matrixConnection: "Matrix connection",
    matrixHomeserver: "Homeserver",
    matrixScope: "Matrix active scope",
    chatIdentity: "Chat acting identity",
    chatScope: "Chat active scope",
    chatAuthority: "Chat authority domain",
    backendTruth: "Shared infrastructure does not mean shared authority. The browser only reflects truth the backend can already prove.",
    backendPolicy: "Model choice stays alias-based. Provider mapping and backend paths remain server-owned and are not treated as browser truth.",
    modelChoiceNote: "Model selection remains alias-based.",
    diagnosticsHidden: "Diagnostics stays hidden in Expert mode.",
    diagnosticsEmpty: "No local diagnostic events yet.",
    clearDiagnostics: "Clear diagnostics",
    connectionTruthNote: "Backend truth and connection truth stay separated from advisory copy.",
    modelSourceLabel: "Source",
  },
  auth: {
    statusAuthenticated: "Unlocked",
    statusChecking: "Checking session",
    statusLocked: "Locked",
    title: "GitHub login",
    intro: "GitHub read routes stay server-side locked until you sign in with the admin password.",
    cardTitle: "Server-side authentication",
    cardSubtitle: "Enter admin password",
    passwordLabel: "Admin password",
    submit: "Sign in",
    submitBusy: "Signing in...",
    hint: "Password stays only in the server-side HttpOnly session cookie.",
    footerNote: "After sign-in, the GitHub read routes are unlocked. The write path remains bound to the server-side admin key.",
  },
  chat: {
    title: "Chat workspace",
    intro: "Conversation stays separate from governed work objects. The backend remains the execution authority.",
    sessionLabel: "Conversation state",
    modelSelectLabel: "Public model alias",
    noModels: "No public aliases available",
    onlyPublicAlias: "Only public alias metadata is exposed. Provider targets stay backend-only.",
    modelHintFallback: "Selected alias metadata appears here once the backend exposes it.",
    conversationState: "Conversation state",
    stopExecution: "Stop execution",
    clearNotices: "Clear notices",
    proposalTitle: "Prompt execution proposal",
    proposalHelper: "Approve starts backend execution. Reject records a terminal rejection receipt.",
    executingTitle: "Approved prompt is executing",
    executingDetail: (alias) => `Backend execution in progress for alias ${alias}.`,
    emptyState: "No governed activity yet. Prepare a proposal to run the next prompt.",
    operatorInput: "Operator input",
    agentResponse: "Agent response",
    agentDraft: "Agent response (draft)",
    errorNotice: "Error notice",
    systemNotice: "System notice",
    noticeError: "Error",
    noticeSystem: "Notice",
    composerPlaceholder: "Write operator input to prepare the next governed proposal...",
    prepareProposal: "Prepare proposal",
    composerHelper: "Submit prepares a proposal. Backend execution starts only after approval.",
    composerLocked: {
      backend: "Backend unreachable. Composer is fail-closed.",
      model: "No public model alias selected.",
      approval: "Awaiting approval for the prepared proposal.",
      execution: "Execution is running. Composer is locked.",
    },
    routePending: "Route pending",
    routeFallback: "fallback",
    routeDegraded: "degraded",
  },
  github: {
    title: "GitHub workspace",
    intro: "Inspect repositories, understand project structure, and prepare safe change proposals.",
    repoSelectLabel: "Choose repository",
    loadingRepos: "Loading allowed repositories...",
    noRepos: "No allowed repositories yet.",
    connectedRepo: "Connected repository",
    repoSelected: "Repository selected",
    noRepoSelected: "No GitHub repository selected yet",
    nextStepLabel: "Next step",
    nextStepChooseRepo: "Choose a repository",
    nextStepAnalysis: "Start analysis",
    nextStepProposal: "Review proposal",
    nextStepReadOnly: "Read only active",
    readOnly: "Read only",
    readOnlyActive: "Read only active",
    actionReadTitle: "Read project",
    actionReadBody: "The assistant reads folders and files to understand the project layout.",
    actionProposalTitle: "Approval required",
    actionProposalBody: "The assistant prepares a plan that you must review and approve first.",
    reviewTitle: "Review proposal",
    analysisTitle: "Analysis complete",
    reviewEmpty: "Start the analysis first. Then the assistant can prepare a safe proposal.",
    proposalEmpty: "The next safe action is ready. Start a proposal if you want to review changes.",
    planFileChanged: "File is being updated.",
    planFileModified: "File is being changed.",
    staleProposal: "This proposal is stale and must be recreated.",
    approveLabel: "Approve and execute",
    rejectLabel: "Reject proposal",
    approving: "Approving...",
    approveHelper: "Approving starts backend execution. Rejecting only discards the local approval intent.",
    openInGitHub: "Open in GitHub",
    verifyResult: "Check result",
    verifyBusy: "Checking...",
    diffAppearsLater: "Diff appears after a proposal is prepared.",
    workspaceNoticeStale: "The proposal is stale and must be recreated.",
    workspaceNoticeExecution: "Execution could not be completed.",
    workspaceNoticeVerification: "Verification could not be completed.",
    workspaceNoticeAnalysis: "Analysis could not be completed.",
    workspaceNoticeProposal: "Proposal could not be created.",
    workspaceNoticeRepos: "Repository list could not be loaded.",
    workspaceNoticeSelection: "Choose an allowed repository first.",
    repositoryStatus: "Repository status",
    privateRepo: "Private",
    publicRepo: "Public",
    targetBranch: "Target branch",
    defaultBranch: "Default branch",
    loadingSelection: "Loading allowed repositories...",
    modelLabel: "Model",
  },
  matrix: {
    title: "Matrix workspace",
    intro: "Analyze scope, provenance, and topic updates through the backend with explicit approval gates.",
    scopeTitle: "Scope",
    scopeInputTitle: "Selected scope inputs",
    scopeSummaryTitle: "Current scope summary",
    hierarchyTitle: "Hierarchy preview",
    hierarchyAdvisory: "Browser-side preview only. Not backend-verified or write-authoritative.",
    hierarchyEmpty: "Add or preview a space ID to inspect the browser-side hierarchy preview.",
    hierarchySpaceId: "Space ID",
    hierarchyRoomsEmpty: "No preview rooms returned yet.",
    joinedRoomsTitle: "Joined rooms",
    selectedScopeTitle: "Selected scope inputs",
    resolveScope: "Resolve scope",
    resolvingScope: "Resolving...",
    scopeUnresolved: "Scope summary unavailable until the backend responds.",
    scopeSummaryLoading: "Loading summary...",
    scopeSummaryUnavailable: "Scope summary unavailable until the backend responds.",
    scopeSummaryReady: "Summary ready",
    scopePreview: "View provenance",
    scopeAddSpace: "Add space",
    scopeRemove: "Remove",
    scopeSelected: "Scope selected",
    scopeSelectedLabel: "Scope selected",
    composerTitle: "Composer",
    threadContextTitle: "Thread context",
    threadOpen: "Open thread",
    threadLeave: "Leave thread",
    threadNone: "No thread open yet",
    threadOpenHint: "Choose a post or root to switch explicitly into a thread context.",
    threadLeaveHint: "Leaving the thread returns you to the room context.",
    composerModeLabel: "Composer mode",
    composerTargetLabel: "Composer target",
    composerTargetMissing: "Target missing",
    composerTargetSet: "Target set",
    newPost: "New post",
    reply: "Reply",
    thread: "Thread",
    replyInThread: "Reply in thread",
    clearTarget: "Clear target",
    targetContextTitle: "Target context",
    roomId: "Room ID",
    roomName: "Room name",
    postId: "Post ID",
    threadRootId: "Thread root ID",
    draft: "Draft",
    draftPlaceholder: "Composer draft content",
    submit: "Submit (fail-closed)",
    submitBusy: "Submitting...",
    submitBlocked: "The submit stays blocked until a target is explicitly set.",
    submitFailClosed: "The submit is currently fail-closed because no write contract is wired in the backend.",
    scopeNotice: "Backend-driven Matrix topic updates are available for explore, scope summary, read-only provenance, analysis, review, approval, execution, and verification.",
    scopeSummaryInfo: "Backend resolves the scope and loads the current summary.",
    topicTitle: "Topic update",
    topicStatusReady: "Ready",
    topicStatusPending: "Approval required",
    topicStatusBlocked: "Blocked",
    topicStatusVerified: "Receipt verified",
    topicStatusMismatch: "Receipt mismatch",
    topicStatusOpen: "Receipt open",
    topicStatusApproval: "Approval required",
    topicStatusLoaded: "Loaded",
    topicStatusLoading: "Loading",
    topicStatusUnavailable: "Unavailable",
    topicStatusBrowserPreview: "Browser preview",
    topicStatusNoPreview: "No preview rooms returned yet.",
    roomPickerLoading: "Loading joined rooms...",
    roomPickerEmpty: "No joined rooms loaded yet.",
    roomPickerChoose: "Choose room",
    roomPickerRoom: "Room",
    roomPickerSpace: "Space",
    composerModePost: "Post",
    composerModeReply: "Reply",
    composerModeThread: "Thread",
    composerModeThreadReply: "Thread reply",
    composerDraftLabel: "Composer draft",
  },
};

const DE_COPY: LocalizationCopy = {
  common: {
    na: "n/a",
    none: "Keine",
    loading: "Wird geladen",
    ready: "Bereit",
    partial: "Teilweise",
    error: "Fehler",
    blocked: "Blockiert",
    active: "Aktiv",
    inactive: "Inaktiv",
    justNow: "gerade eben",
  },
  shell: {
    appKicker: "MODELGATE",
    appTitle: "ModelGate Konsole",
    appDeck: "Governance-first Operator-Shell. Runtimetruth bleibt backend-owned.",
    workspaceConsoleKicker: "WORKSPACE CONSOLE",
    workspaceConsoleTitle: "Arbeitsbereich wählen",
    workspaceConsoleNote: "Navigation, Sessionkontext und Disclosure bleiben links persistent.",
    workspacesLabel: "Workspaces",
    sessionLabel: "Session",
    disclosureLabel: "Disclosure",
    accountLabel: "Account",
    languageLabel: "Sprache",
    languageOptionEnglish: "EN",
    languageOptionGerman: "DE",
    workspaceContextSuffix: "Kontext",
    diagnosticsLabel: "Diagnostik",
    diagnosticsShow: "Diagnostik öffnen",
    diagnosticsHide: "Diagnostik schließen",
    activateExpert: "Expert Mode aktivieren",
    backendPrefix: "Backend",
    currentSessionFallback: "Aktive Session",
    noActiveSession: "Keine Session aktiv",
    sessionIdPrefix: "ID",
    archivedBadge: "Archiviert",
    accountAuthenticated: "GitHub Admin",
    accountChecking: "Session wird geprüft",
    accountLocked: "Kein Admin-Login",
    accountLogout: "Abmelden",
    accountLoginRequired: "Admin-Login erforderlich",
    statusReady: "Bereit",
    statusPartial: "Teilweise",
    statusError: "Fehler",
    pendingApprovalsTitle: "Ausstehende Freigaben",
    pendingApprovalsSummary: (pending, stale) => `${pending} zur Freigabe, ${stale} veraltet`,
    pendingApprovalsChat: "Mindestens ein Chat-Vorschlag wartet auf Freigabe. Weitere Details im aktiven Workspace.",
    pendingApprovalsSeparate: "Freigaben bleiben getrennt von Ausführung. Prüfe Details im Review-Workspace.",
    diagnosticsAvailable: "Diagnostik ist verfügbar. Nutzung bleibt read-only und kontextbezogen.",
    diagnosticsHidden: "Beginner blendet Diagnostik standardmäßig aus. Bei Störung wird sie sichtbar.",
    healthTitle: "Health",
    healthReady: "Bereit",
    healthChecking: "Wird geprüft",
    healthUnavailable: "Nicht verfügbar",
    healthReadyDetail: "Backend erreichbar. Ausführung bleibt backend-owned.",
    healthCheckingDetail: "Backend-Health wird geladen.",
    healthUnavailableDetail: "Backend nicht erreichbar. Oberfläche bleibt fail-closed.",
    modeLabel: "Mode",
    publicAliasLabel: "Public alias",
    workspaceTabs: {
      chat: { label: "Chat", description: "Fragen stellen und Antworten prüfen" },
      github: { label: "GitHub", description: "Repository lesen und Vorschläge vorbereiten" },
      matrix: { label: "Matrix", description: "Scope, Provenienz und Topic-Updates" },
      review: { label: "Review", description: "Freigaben und Belege prüfen" },
      settings: { label: "Settings", description: "Ansicht und Diagnose prüfen" },
    },
  },
  sessionList: {
    headerCount: (count) => `${count} insgesamt`,
    newSession: "Neue Session",
    noSessions: "Noch keine Sessions.",
    archived: "Archiviert",
    active: "Aktiv",
    updated: "Aktualisiert",
    openedJustNow: "gerade geöffnet",
    openedRecently: (when) => `zuletzt geöffnet ${when}`,
    archive: "Archivieren",
    delete: "Löschen",
  },
  approval: {
    proposalSection: "Vorschlag",
    consequenceLabel: "Auswirkung",
    executionSection: "Ausführung",
    receiptSection: "Ausführungsbeleg",
    statusRequired: "Freigabe erforderlich",
    approve: "Freigeben",
    reject: "Ablehnen",
    running: "Läuft",
    runningTitle: "Freigegebener Inhalt wird ausgeführt",
    runningDetail: "Backend-Ausführung läuft.",
    receiptExecuted: "Ausgeführt",
    receiptFailed: "Fehlgeschlagen",
    receiptRejected: "Abgelehnt",
    receiptUnverifiable: "Nicht verifizierbar",
    receiptPending: "Ausstehend",
  },
  review: {
    heroStatus: "Review",
    title: "Review",
    intro: "Vorschläge sammeln, prüfen und freigeben. Ausführung bleibt im Backend.",
    panelTitle: "Offene Prüfungen",
    panelBadgeEmpty: "Leer",
    panelBadgeActive: "Aktiv",
    openReviews: "Offene Prüfungen",
    nextStepLabel: "Nächster Schritt",
    emptyTitle: "Noch keine offenen Prüfungen.",
    emptyBody: "Wenn Chat, GitHub oder Matrix einen Vorschlag vorbereitet, erscheint er hier zur Freigabe.",
    queueTitle: "Prüfungswarteschlange",
    queueHeader: "Alle offenen Prüfungen",
    warning: "Dieser Vorschlag ist veraltet und muss neu geprüft werden.",
    rowOpen: "Offen",
    rowClassification: "Einordnung",
    ready: "Bereit",
    blocked: "Blockiert",
    approvalNeeded: "Freigabe nötig",
    executing: "Ausführung läuft",
    terminalDeviation: "Terminale Abweichung",
  },
  settings: {
    heroStatus: "Settings",
    title: "Einstellungen",
    intro: "Disclosure wählen, Identität und Verbindung gegen Backendtruth prüfen und Diagnose im Expert Mode öffnen.",
    viewCardTitle: "Ansicht",
    identityCardTitle: "Identität und Verbindung",
    modelCardTitle: "Modelle",
    diagnosticsCardTitle: "Diagnostik",
    beginner: "Beginner",
    expert: "Expert",
    backend: "Backend",
    githubIdentity: "GitHub acting identity",
    githubConnection: "GitHub Verbindung",
    githubAuthority: "GitHub authority domain",
    githubScope: "GitHub active scope",
    matrixIdentity: "Matrix acting identity",
    matrixConnection: "Matrix Verbindung",
    matrixHomeserver: "Homeserver",
    matrixScope: "Matrix active scope",
    chatIdentity: "Chat acting identity",
    chatScope: "Session-lokaler Chat-Thread (Browser)",
    chatAuthority: "Chat backend route (/chat)",
    backendTruth: "Gemeinsame Infrastruktur bedeutet nicht gemeinsame Autorität. Der Browser spiegelt nur Wahrheit wider, die der Backend-Server bereits belegen kann.",
    backendPolicy: "Modellwahl bleibt alias-basiert. Provider-Zuordnung und Backend-Pfade bleiben server-owned und werden nicht im Browser als Wahrheit behandelt.",
    modelChoiceNote: "Modellwahl bleibt alias-basiert.",
    diagnosticsHidden: "Diagnose bleibt im Expert Mode verborgen.",
    diagnosticsEmpty: "Noch keine lokalen Diagnoseereignisse.",
    clearDiagnostics: "Diagnostik leeren",
    connectionTruthNote: "Backendtruth und Verbindungstruth bleiben von Advisory-Text getrennt.",
    modelSourceLabel: "Quelle",
  },
  auth: {
    statusAuthenticated: "Freigeschaltet",
    statusChecking: "Session wird geprüft",
    statusLocked: "Gesperrt",
    title: "GitHub-Login",
    intro: "Der Zugriff auf GitHub-Read-Routen ist serverseitig gesperrt, bis du dich mit dem Admin-Passwort anmeldest.",
    cardTitle: "Serverseitige Authentifizierung",
    cardSubtitle: "Admin-Passwort eingeben",
    passwordLabel: "Admin-Passwort",
    submit: "Anmelden",
    submitBusy: "Anmelden...",
    hint: "Passwort bleibt nur im HttpOnly-Session-Cookie auf dem Server.",
    footerNote: "Nach der Anmeldung werden die GitHub-Read-Routen freigeschaltet. Der Schreibpfad bleibt zusätzlich an den serverseitigen Admin-Key gebunden.",
  },
  chat: {
    title: "Chat-Workspace",
    intro: "Conversation bleibt getrennt von gouvernierten Arbeitsobjekten. Das Backend bleibt Ausführungsautorität.",
    sessionLabel: "Konversationszustand",
    modelSelectLabel: "Public model alias",
    noModels: "Keine öffentlichen Aliase verfügbar",
    onlyPublicAlias: "Nur öffentliche Alias-Metadaten sind sichtbar. Provider-Ziele bleiben backend-only.",
    modelHintFallback: "Die Metadaten des gewählten Alias erscheinen hier, sobald das Backend sie bereitstellt.",
    conversationState: "Konversationszustand",
    stopExecution: "Ausführung stoppen",
    clearNotices: "Hinweise löschen",
    proposalTitle: "Vorschlag für Prompt-Ausführung",
    proposalHelper: "Freigeben startet die Backend-Ausführung. Ablehnen schreibt nur einen terminalen Ablehnungsbeleg.",
    executingTitle: "Freigegebener Prompt wird ausgeführt",
    executingDetail: (alias) => `Backend-Ausführung für Alias ${alias} läuft.`,
    emptyState: "Noch keine gouvernierte Aktivität. Erstelle einen Vorschlag für den nächsten Prompt.",
    operatorInput: "Operator input",
    agentResponse: "Agent response",
    agentDraft: "Agent response (draft)",
    errorNotice: "Fehlerhinweis",
    systemNotice: "Systemhinweis",
    noticeError: "Fehler",
    noticeSystem: "Hinweis",
    composerPlaceholder: "Operator-Eingabe schreiben, um den nächsten gouvernierten Vorschlag vorzubereiten...",
    prepareProposal: "Vorschlag vorbereiten",
    composerHelper: "Submit bereitet einen Vorschlag vor. Die Backend-Ausführung startet erst nach Freigabe.",
    composerLocked: {
      backend: "Backend nicht erreichbar. Composer bleibt fail-closed.",
      model: "Kein öffentlicher Modellalias ausgewählt.",
      approval: "Freigabe für den vorbereiteten Vorschlag steht aus.",
      execution: "Ausführung läuft. Composer ist gesperrt.",
    },
    routePending: "Route ausstehend",
    routeFallback: "Fallback",
    routeDegraded: "degradiert",
  },
  github: {
    title: "GitHub-Workspace",
    intro: "Repository ansehen, Projektstruktur verstehen und sichere Änderungsvorschläge vorbereiten.",
    repoSelectLabel: "Repo auswählen",
    loadingRepos: "Erlaubte Repos werden geladen...",
    noRepos: "Noch keine erlaubten Repos.",
    connectedRepo: "Verbundenes Repo",
    repoSelected: "Repo ausgewählt",
    noRepoSelected: "Noch kein GitHub-Repo ausgewählt",
    nextStepLabel: "Nächster Schritt",
    nextStepChooseRepo: "Repo auswählen",
    nextStepAnalysis: "Analyse starten",
    nextStepProposal: "Vorschlag prüfen",
    nextStepReadOnly: "Nur Lesen aktiv",
    readOnly: "Nur Lesen",
    readOnlyActive: "Nur Lesen aktiv",
    actionReadTitle: "Projekt lesen",
    actionReadBody: "Das System liest Ordner und Dateien, um den Projektaufbau zu verstehen.",
    actionProposalTitle: "Freigabe nötig",
    actionProposalBody: "Das System erstellt einen Plan, den du zuerst prüfen und freigeben musst.",
    reviewTitle: "Vorschlag prüfen",
    analysisTitle: "Analyse abgeschlossen",
    reviewEmpty: "Starte zuerst die Analyse. Danach kann das System einen sicheren Vorschlag vorbereiten.",
    proposalEmpty: "Die nächste sichere Aktion ist bereit. Starte jetzt einen Vorschlag, wenn du Änderungen prüfen möchtest.",
    planFileChanged: "Datei wird angepasst.",
    planFileModified: "Datei wird geändert.",
    staleProposal: "Der Vorschlag ist veraltet und muss neu erstellt werden.",
    approveLabel: "Freigeben und ausführen",
    rejectLabel: "Vorschlag ablehnen",
    approving: "Freigabe wird verarbeitet...",
    approveHelper: "Freigeben startet die Backend-Ausführung. Ablehnen verwirft nur die lokale Freigabeabsicht.",
    openInGitHub: "Auf GitHub öffnen",
    verifyResult: "Ergebnis prüfen",
    verifyBusy: "Prüfung läuft...",
    diffAppearsLater: "Diff erscheint erst, wenn ein Vorschlag vorbereitet wurde.",
    workspaceNoticeStale: "Der Vorschlag ist veraltet und muss neu erstellt werden.",
    workspaceNoticeExecution: "Die Ausführung konnte nicht abgeschlossen werden.",
    workspaceNoticeVerification: "Die Prüfung konnte nicht abgeschlossen werden.",
    workspaceNoticeAnalysis: "Die Analyse konnte nicht abgeschlossen werden.",
    workspaceNoticeProposal: "Der Vorschlag konnte nicht erstellt werden.",
    workspaceNoticeRepos: "Die Repo-Liste konnte nicht geladen werden.",
    workspaceNoticeSelection: "Wähle zuerst ein erlaubtes Repo aus.",
    repositoryStatus: "Repository status",
    privateRepo: "Privat",
    publicRepo: "Öffentlich",
    targetBranch: "Zielzweig",
    defaultBranch: "Hauptzweig",
    loadingSelection: "Erlaubte Repos werden geladen...",
    modelLabel: "Modell",
  },
  matrix: {
    title: "Matrix-Workspace",
    intro: "Scope, Provenienz und Topic-Updates werden über das Backend mit expliziten Freigabeschranken analysiert.",
    scopeTitle: "Scope",
    scopeInputTitle: "Ausgewählte Scope-Eingaben",
    scopeSummaryTitle: "Aktuelle Scope-Zusammenfassung",
    hierarchyTitle: "Hierarchie-Vorschau",
    hierarchyAdvisory: "Browserseitige Vorschau nur. Nicht backend-verifiziert und nicht write-authoritative.",
    hierarchyEmpty: "Füge eine Space-ID hinzu oder sieh sie vor, um die browserseitige Hierarchie-Vorschau zu prüfen.",
    hierarchySpaceId: "Space-ID",
    hierarchyRoomsEmpty: "Noch keine Vorschau-Räume zurückgegeben.",
    joinedRoomsTitle: "Beigetretene Räume",
    selectedScopeTitle: "Ausgewählte Scope-Eingaben",
    resolveScope: "Scope auflösen",
    resolvingScope: "Wird aufgelöst...",
    scopeUnresolved: "Scope-Zusammenfassung ist verfügbar, sobald das Backend antwortet.",
    scopeSummaryLoading: "Zusammenfassung wird geladen...",
    scopeSummaryUnavailable: "Scope-Zusammenfassung ist verfügbar, sobald das Backend antwortet.",
    scopeSummaryReady: "Zusammenfassung bereit",
    scopePreview: "Provenienz ansehen",
    scopeAddSpace: "Space hinzufügen",
    scopeRemove: "Entfernen",
    scopeSelected: "Bereich gewählt",
    scopeSelectedLabel: "Bereich gewählt",
    composerTitle: "Composer",
    threadContextTitle: "Thread-Kontext",
    threadOpen: "Thread öffnen",
    threadLeave: "Thread verlassen",
    threadNone: "Noch kein Thread geöffnet",
    threadOpenHint: "Wähle einen Beitrag oder Root, um explizit in einen Thread-Kontext zu wechseln.",
    threadLeaveHint: "Der Composer schreibt in den geöffneten Thread. Mit Thread verlassen kehrst du in den Raumkontext zurück.",
    composerModeLabel: "Composer mode",
    composerTargetLabel: "Composer-Ziel",
    composerTargetMissing: "Ziel fehlt",
    composerTargetSet: "Ziel gesetzt",
    newPost: "Neuer Post",
    reply: "Antworten",
    thread: "Thread starten",
    replyInThread: "Im Thread antworten",
    clearTarget: "Ziel löschen",
    targetContextTitle: "Target context",
    roomId: "Raum-ID",
    roomName: "Raumname",
    postId: "Beitrags-ID",
    threadRootId: "Thread-Root-ID",
    draft: "Draft",
    draftPlaceholder: "Composer draft content",
    submit: "Submit (fail-closed)",
    submitBusy: "Wird gesendet...",
    submitBlocked: "Der Submit bleibt blockiert, bis ein Ziel explizit gesetzt ist.",
    submitFailClosed: "Der Submit ist derzeit fail-closed, weil kein Write-Contract im Backend verdrahtet ist.",
    scopeNotice: "Backend-gesteuerte Matrix-Topic-Updates sind für Explore, Scope-Summary, read-only Provenienz, Analyse, Review, Freigabe, Ausführung und Verifikation verfügbar.",
    scopeSummaryInfo: "Backend löst den Scope auf und lädt die aktuelle Zusammenfassung.",
    topicTitle: "Topic Update",
    topicStatusReady: "Bereit",
    topicStatusPending: "Freigabe erforderlich",
    topicStatusBlocked: "Blockiert",
    topicStatusVerified: "Beleg verifiziert",
    topicStatusMismatch: "Beleg mit Abweichung",
    topicStatusOpen: "Beleg offen",
    topicStatusApproval: "Freigabe erforderlich",
    topicStatusLoaded: "Bereit",
    topicStatusLoading: "Wird geladen",
    topicStatusUnavailable: "Nicht verfügbar",
    topicStatusBrowserPreview: "Browser-Vorschau",
    topicStatusNoPreview: "Noch keine Vorschau-Räume zurückgegeben.",
    roomPickerLoading: "Beigetretene Räume werden geladen...",
    roomPickerEmpty: "Noch keine beigetretenen Räume geladen.",
    roomPickerChoose: "Bereich auswählen",
    roomPickerRoom: "Bereich",
    roomPickerSpace: "Bereich",
    composerModePost: "Post",
    composerModeReply: "Antwort",
    composerModeThread: "Thread",
    composerModeThreadReply: "Thread-Antwort",
    composerDraftLabel: "Composer-Entwurf",
  },
};

const COPY_BY_LOCALE: Record<Locale, LocalizationCopy> = {
  en: EN_COPY,
  de: DE_COPY,
};

function readStoredLocale() {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    return window.localStorage.getItem(LOCALE_STORAGE_KEY);
  } catch {
    return null;
  }
}

function writeStoredLocale(locale: Locale) {
  if (typeof window === "undefined") {
    return;
  }

  try {
    window.localStorage.setItem(LOCALE_STORAGE_KEY, locale);
  } catch {
    // Ignore storage failures; the UI stays usable.
  }
}

export const LOCALE_STORAGE_KEY = "modelgate.console.locale.v1";

export function normalizeLocale(value: string | null | undefined): Locale {
  return value?.toLowerCase().startsWith("de") ? "de" : "en";
}

export function resolveInitialLocale(options?: { storedLocale?: string | null; browserLanguage?: string | null }): Locale {
  const stored = normalizeLocale(options?.storedLocale);
  if (options?.storedLocale && (stored === "en" || stored === "de")) {
    return stored;
  }

  const browserLanguage = normalizeLocale(options?.browserLanguage);
  if (options?.browserLanguage) {
    return browserLanguage;
  }

  return "en";
}

export function getSessionStatusLabel(locale: Locale, status: SessionStatus): string {
  const labels: Record<SessionStatus, string> = locale === "de"
    ? {
        draft: "Entwurf",
        in_progress: "In Arbeit",
        review_required: "Freigabe nötig",
        done: "Bereit",
        failed: "Fehler",
      }
    : {
        draft: "Draft",
        in_progress: "In progress",
        review_required: "Review required",
        done: "Ready",
        failed: "Failed",
      };

  return labels[status];
}

export function getReviewStatusLabel(locale: Locale, status: ReviewStatus): string {
  const labels: Record<ReviewStatus, string> = locale === "de"
    ? {
        pending_review: "Wartet auf Freigabe",
        approved: "Ausführung läuft",
        rejected: "Fehlgeschlagen / Abgelehnt",
        stale: "Veraltet",
        executed: "Ausgeführt",
      }
    : {
        pending_review: "Waiting for approval",
        approved: "Execution running",
        rejected: "Failed / Rejected",
        stale: "Stale",
        executed: "Executed",
      };

  return labels[status];
}

export function getApprovalOutcomeLabel(locale: Locale, outcome: ApprovalOutcome): string {
  const labels: Record<ApprovalOutcome, string> = locale === "de"
    ? {
        executed: "Ausgeführt",
        failed: "Fehlgeschlagen",
        rejected: "Abgelehnt",
        unverifiable: "Nicht verifizierbar",
      }
    : {
        executed: "Executed",
        failed: "Failed",
        rejected: "Rejected",
        unverifiable: "Unverifiable",
      };

  return labels[outcome];
}

export function getConnectionStateLabel(locale: Locale, state: ConnectionState): string {
  const labels: Record<ConnectionState, string> = locale === "de"
    ? {
        idle: "Bereit",
        submitting: "Wird gesendet",
        streaming: "Läuft",
        completed: "Abgeschlossen",
        error: "Fehler",
      }
    : {
        idle: "Ready",
        submitting: "Submitting",
        streaming: "Running",
        completed: "Completed",
        error: "Error",
      };

  return labels[state];
}

export function getShellHealthCopy(locale: Locale, backendHealthy: boolean | null) {
  if (backendHealthy === true) {
    return locale === "de"
      ? {
          tone: "ready" as const,
          label: "Bereit",
          detail: "Backend erreichbar. Ausführung bleibt backend-owned.",
        }
      : {
          tone: "ready" as const,
          label: "Ready",
          detail: "Backend reachable. Execution stays backend-owned.",
        };
  }

  if (backendHealthy === false) {
    return locale === "de"
      ? {
          tone: "error" as const,
          label: "Nicht verfügbar",
          detail: "Backend nicht erreichbar. Oberfläche bleibt fail-closed.",
        }
      : {
          tone: "error" as const,
          label: "Unavailable",
          detail: "Backend unreachable. Surface stays fail-closed.",
        };
  }

  return locale === "de"
    ? {
        tone: "partial" as const,
        label: "Wird geprüft",
        detail: "Backend-Health wird geladen.",
      }
    : {
        tone: "partial" as const,
        label: "Checking",
        detail: "Backend health is loading.",
      };
}

export type LocalizationValue = {
  locale: Locale;
  setLocale: (next: Locale) => void;
  copy: LocalizationCopy;
};

const DEFAULT_VALUE: LocalizationValue = {
  locale: "en",
  setLocale: () => undefined,
  copy: EN_COPY,
};

const LocalizationContext = createContext<LocalizationValue>(DEFAULT_VALUE);

type LocaleProviderProps = {
  children: React.ReactNode;
  initialLocale?: Locale;
};

export function LocaleProvider({ children, initialLocale }: LocaleProviderProps) {
  const [locale, setLocaleState] = useState<Locale>(() =>
    initialLocale ?? resolveInitialLocale({
      storedLocale: readStoredLocale(),
      browserLanguage: typeof navigator !== "undefined" ? navigator.language : null,
    }),
  );

  useEffect(() => {
    writeStoredLocale(locale);

    if (typeof document !== "undefined") {
      document.documentElement.lang = locale;
    }
  }, [locale]);

  const value = useMemo<LocalizationValue>(
    () => ({
      locale,
      setLocale: setLocaleState,
      copy: COPY_BY_LOCALE[locale],
    }),
    [locale],
  );

  return <LocalizationContext.Provider value={value}>{children}</LocalizationContext.Provider>;
}

export function useLocalization() {
  return useContext(LocalizationContext);
}
