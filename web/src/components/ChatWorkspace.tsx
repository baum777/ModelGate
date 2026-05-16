import React, { useCallback, useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
import { streamChatCompletion, type ChatRouteMetadata } from "../lib/api.js";
import {
  buildGovernedChatProposal,
  buildOutboundChatMessages,
  chatReducer,
  createTokenBatcher,
  createChatUserMessage,
  createInitialChatState,
  runDirectChatStream,
  type ChatMessage,
  type ChatExecutionMode,
  type ChatProposal,
  type ConnectionState
} from "../lib/chat-workflow.js";
import {
  deriveSessionStatus,
  deriveSessionTitle,
  type ChatSession
} from "../lib/workspace-state.js";
import type { CrossTabCommand } from "../lib/cross-tab-commands.js";
import { useLocalization } from "../lib/localization.js";
import {
  ApprovalTransitionCard,
  DecisionZone,
  ExecutionReceiptCard,
  ProposalCard,
} from "./ApprovalPrimitives.js";
import { MarkdownMessage, hasRichTextContent } from "./MarkdownMessage.js";
import { GuideOverlay, getWorkspaceGuide } from "./GuideOverlay.js";
import { SectionLabel, ShellCard, StatusBadge } from "./ShellPrimitives.js";
import { GuideCTAInline } from "./GuideCTAInline.js";
import { EmptyStateCTA } from "./EmptyStateCTA.js";
import { DiscoveryChip } from "./DiscoveryChip.js";
import {
  BACKEND_TRUTH_UNAVAILABLE,
  buildGovernanceMetadataRows,
  mergeMetadataRows,
} from "../lib/governance-metadata.js";
import {
  getWorkModeCopy,
  isBeginnerMode,
  isExpertMode,
  type WorkMode,
} from "../lib/work-mode.js";
import { buildPinnedChatContextPrompt, type PinnedChatContext } from "../lib/pinned-chat-context.js";
import {
  hasSeenGuideKey,
  markGuideKeySeen,
  readGuideSetupState,
  writeGuideSetupState,
} from "../lib/guide-state.js";
import { ComposeZone } from "./mobile/chat/ComposeZone.js";
import { InlineDiff } from "./mobile/chat/InlineDiff.js";

type PublicModelEntry = {
  alias: string;
  label: string;
  description: string;
  capabilities: string[];
  tier: "core" | "specialized" | "fallback";
  streaming: boolean;
  recommendedFor: string[];
  default?: boolean;
  available?: boolean;
};

type ChatWorkspaceProps = {
  session: ChatSession;
  workMode: WorkMode;
  backendHealthy: boolean | null;
  routingStatus: {
    fallbackAllowed: boolean | null;
  };
  activeModelAlias: string | null;
  availableModels: string[];
  modelRegistry: PublicModelEntry[];
  onActiveModelAliasChange: (alias: string) => void;
  onTelemetry: (kind: "info" | "warning" | "error", label: string, detail?: string) => void;
  onSessionChange: (session: ChatSession) => void;
  pinnedContext: PinnedChatContext | null;
  onClearPinnedContext: () => void;
  matrixDraftDefaultRoomId: string | null;
  matrixDraftRoomOptions: string[];
  workbenchBinding: {
    repo: string | null;
    branch: string | null;
    scope: string | null;
  };
  onCrossTabCommand: (command: CrossTabCommand) => void;
};

type RoutingStatusTone = "ready" | "partial" | "error" | "muted";

type ChatRoutingStatusCopy = {
  activeModel: string;
  providerStatus: string;
  fallbackPolicy: string;
  routeState: string;
  ready: string;
  checking: string;
  error: string;
  fallbackEnabled: string;
  fallbackDisabled: string;
  fallbackUsed: string;
  degraded: string;
  routePending: string;
  unavailable: string;
};

const CHAT_SESSION_SYNC_INTERVAL_MS = 220;
const CHAT_STREAM_SESSION_SYNC_INTERVAL_MS = 1_000;
const DEFAULT_FREE_MODEL_ALIAS = "default-free";
const MESSAGE_ACTION_COPY_RESET_MS = 1600;
const MATRIX_DRAFT_TAGS = ["release", "incident", "todo"] as const;
const MESSAGE_ACTION_GUIDE_PULSE_MS = 1400;
const GUIDE_KEY_SETUP_OPENROUTER = "setup-openrouter";
const GUIDE_KEY_FIRST_MESSAGE_SENT = "first-message-sent";
const GUIDE_KEY_FIRST_AI_RESPONSE = "first-ai-response";
const GUIDE_KEY_MATRIX_CTA = "matrix-cta-shown";
const GUIDE_KEY_GITHUB_CTA = "github-cta-shown";
const GUIDE_KEY_CONTEXT_CTA = "context-cta-shown";
const GUIDE_KEY_COPY_CTA = "copy-cta-shown";
const CONTEXT_FILENAME_PATTERN = /\b[\w./-]+\.(?:ts|tsx|js|jsx|md|yml|yaml|json)\b/i;
const CHAT_STARTER_PROMPTS = {
  de: [
    "Gib mir einen klaren 3-Schritt-Plan für das aktuelle Hauptziel.",
    "Welche nächste sichere Aktion ist jetzt am sinnvollsten?",
    "Fasse den Ist-Zustand in fünf präzisen Punkten zusammen.",
    "Nenne Risiken, offene Punkte und den kleinsten nächsten Schritt.",
    "Formuliere eine kurze Umsetzungs-Checkliste für heute.",
    "Erstelle eine Entscheidungsbasis mit Option A/B und Trade-offs.",
    "Schreibe eine knappe Übergabe für den nächsten Arbeitsschritt.",
  ],
  en: [
    "Give me a clear 3-step plan for the current main goal.",
    "What is the safest next action right now?",
    "Summarize the current state in five precise points.",
    "List risks, open items, and the smallest next step.",
    "Create a short execution checklist for today.",
    "Build a decision brief with option A/B and trade-offs.",
    "Write a concise handoff for the next work step.",
  ],
} as const;
const MOBILE_CHAT_TIPS = {
  en: [
    "Chat: Enter sends · Shift+Enter line break.",
    "Chat: start with one explicit goal.",
    "Chat: add repo context before file questions.",
    "Chat: use Read only for analysis and planning.",
    "Chat: use Read & Write only with active branch.",
    "Guide: swipe left/right to switch cards.",
    "Guide: tap outside to close overlay.",
    "Workbench: choose repository first.",
    "Workbench: analysis before proposal.",
    "Workbench: inspect proposal before approval.",
    "Workbench: diff is evidence, not execution.",
    "Matrix: scope first, then topic update.",
    "Matrix: room target must be explicit.",
    "Matrix: submit remains fail-closed without write contract.",
    "Matrix: verify after execution intent.",
    "Settings: backend health before retries.",
    "Settings: aliases visible, credentials hidden.",
    "Review: reject unclear proposals.",
  ],
  de: [
    "Chat: Enter sendet · Shift+Enter Zeilenumbruch.",
    "Chat: starte mit einem klaren Ziel.",
    "Chat: vor Datei-Fragen Repo-Kontext laden.",
    "Chat: Read only für Analyse und Planung.",
    "Chat: Read & Write nur mit aktiver Branch.",
    "Guide: links/rechts wischen für Kartenwechsel.",
    "Guide: Tipp außerhalb schließt das Overlay.",
    "Workbench: zuerst Repository wählen.",
    "Workbench: Analyse vor Vorschlag.",
    "Workbench: Vorschlag vor Freigabe prüfen.",
    "Workbench: Diff ist Beleg, keine Ausführung.",
    "Matrix: zuerst Scope, dann Topic-Update.",
    "Matrix: Raumziel explizit setzen.",
    "Matrix: Senden bleibt ohne Write-Contract fail-closed.",
    "Matrix: nach Ausführungsabsicht verifizieren.",
    "Settings: vor Retry Backend-Status prüfen.",
    "Settings: Aliase sichtbar, Credentials verborgen.",
    "Review: unklare Vorschläge ablehnen.",
  ],
} as const;

function MobileChatTipRail({ locale }: { locale: "en" | "de" }) {
  const tips = MOBILE_CHAT_TIPS[locale];
  const [tipIndex, setTipIndex] = useState(0);

  useEffect(() => {
    setTipIndex(0);
  }, [locale]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      setTipIndex((current) => (current + 1) % tips.length);
    }, 4200);

    return () => {
      window.clearInterval(timer);
    };
  }, [tips.length]);

  return (
    <div
      className="mobile-chat-tip-rail"
      aria-label={locale === "de" ? "Chat-Hinweis" : "Chat hint"}
      data-testid="mobile-chat-tip-rail"
    >
      <span className="mobile-chat-tip-rail-item" key={`${locale}-${tipIndex}`} aria-hidden="true">
        {tips[tipIndex]}
      </span>
      <small className="mobile-chat-tip-rail-progress" aria-hidden="true">
        {tipIndex + 1}/{tips.length}
      </small>
    </div>
  );
}

function normalizeModelAlias(value: string | null | undefined) {
  const normalized = value?.trim() ?? "";
  return normalized.length > 0 ? normalized : null;
}

export function resolveInitialChatModelAlias(options: {
  sessionSelectedModelAlias: string | null;
  activeModelAlias: string | null;
  availableModels: string[];
  modelRegistry: Array<{ alias: string }>;
}) {
  const fromSession = normalizeModelAlias(options.sessionSelectedModelAlias);
  if (fromSession) {
    return fromSession;
  }

  const fromShell = normalizeModelAlias(options.activeModelAlias);
  if (fromShell) {
    return fromShell;
  }

  const fromServerDefault = options.availableModels.includes(DEFAULT_FREE_MODEL_ALIAS)
    || options.modelRegistry.some((entry) => entry.alias === DEFAULT_FREE_MODEL_ALIAS)
    ? DEFAULT_FREE_MODEL_ALIAS
    : null;

  if (fromServerDefault) {
    return fromServerDefault;
  }

  return options.availableModels[0] ?? options.modelRegistry[0]?.alias ?? "";
}

export function buildChatRoutingStatusItems(options: {
  selectedModel: string;
  backendHealthy: boolean | null;
  fallbackAllowed: boolean | null;
  activeRoute: ChatRouteMetadata | null;
  copy: ChatRoutingStatusCopy;
}): Array<{ label: string; value: string; tone: RoutingStatusTone }> {
  const selectedAlias = options.selectedModel.trim();
  const providerStatus = options.backendHealthy === true
    ? { value: options.copy.ready, tone: "ready" as const }
    : options.backendHealthy === false
      ? { value: options.copy.error, tone: "error" as const }
      : { value: options.copy.checking, tone: "partial" as const };
  const fallbackPolicy = options.fallbackAllowed === true
    ? { value: options.copy.fallbackEnabled, tone: "partial" as const }
    : options.fallbackAllowed === false
      ? { value: options.copy.fallbackDisabled, tone: "ready" as const }
      : { value: options.copy.checking, tone: "muted" as const };
  const routeState = (() => {
    if (!options.activeRoute) {
      return { value: options.copy.routePending, tone: "muted" as const };
    }

    const routeSignals = [
      options.activeRoute.fallbackUsed ? options.copy.fallbackUsed : null,
      options.activeRoute.degraded ? options.copy.degraded : null,
    ].filter((value): value is string => Boolean(value));

    if (routeSignals.length > 0) {
      return { value: routeSignals.join(" · "), tone: "partial" as const };
    }

    return {
      value: `${options.activeRoute.selectedAlias} · ${options.activeRoute.taskClass}`,
      tone: "ready" as const,
    };
  })();

  return [
    {
      label: options.copy.activeModel,
      value: selectedAlias || options.copy.unavailable,
      tone: selectedAlias ? "ready" : "error",
    },
    {
      label: options.copy.providerStatus,
      value: providerStatus.value,
      tone: providerStatus.tone,
    },
    {
      label: options.copy.fallbackPolicy,
      value: fallbackPolicy.value,
      tone: fallbackPolicy.tone,
    },
    {
      label: options.copy.routeState,
      value: routeState.value,
      tone: routeState.tone,
    },
  ];
}

export function resolveChatComposerBlockReason(options: {
  executionMode: ChatExecutionMode;
  backendUnreachable: boolean;
  modelUnresolved: boolean;
  awaitingApproval: boolean;
  executionRunning: boolean;
  copy: {
    backend: string;
    model: string;
    approval: string;
    execution: string;
  };
}) {
  if (options.backendUnreachable) {
    return options.copy.backend;
  }

  if (options.modelUnresolved) {
    return options.copy.model;
  }

  if (options.executionMode === "governed" && options.awaitingApproval) {
    return options.copy.approval;
  }

  if (options.executionRunning) {
    return options.copy.execution;
  }

  return null;
}

export function shouldSubmitChatComposerOnKey(event: {
  key: string;
  shiftKey: boolean;
  isComposing?: boolean;
  nativeEvent?: { isComposing?: boolean };
}) {
  const composing = event.isComposing ?? event.nativeEvent?.isComposing ?? false;
  return event.key === "Enter" && !event.shiftKey && !composing;
}

export function resolveChatScrollBehavior(connectionState: ConnectionState): ScrollBehavior {
  return connectionState === "streaming" || connectionState === "submitting" ? "auto" : "smooth";
}

export function shouldFlushChatSessionSyncImmediately(connectionState: ConnectionState) {
  return connectionState === "completed" || connectionState === "error";
}

export function resolveChatSessionSyncInterval(connectionState: ConnectionState) {
  if (connectionState === "streaming" || connectionState === "submitting") {
    return CHAT_STREAM_SESSION_SYNC_INTERVAL_MS;
  }
  return CHAT_SESSION_SYNC_INTERVAL_MS;
}

export function resolveChatStreamStatusLabel(options: {
  streamState: {
    interrupted: boolean;
    cancelled: boolean;
    malformed: boolean;
  };
  connectionState: ConnectionState;
  copy: {
    streaming: string;
    interrupted: string;
    cancelled: string;
    unverifiable: string;
    ready: string;
  };
}) {
  if (options.streamState.malformed) {
    return options.copy.unverifiable;
  }
  if (options.streamState.cancelled) {
    return options.copy.cancelled;
  }
  if (options.streamState.interrupted) {
    return options.copy.interrupted;
  }
  if (options.connectionState === "streaming" || options.connectionState === "submitting") {
    return options.copy.streaming;
  }

  return options.copy.ready;
}

function createId() {
  return crypto.randomUUID();
}

async function copyTextToClipboard(text: string) {
  if (typeof navigator !== "undefined" && navigator.clipboard?.writeText) {
    await navigator.clipboard.writeText(text);
    return;
  }

  if (typeof document === "undefined") {
    throw new Error("clipboard unavailable");
  }

  const textarea = document.createElement("textarea");
  textarea.value = text;
  textarea.setAttribute("readonly", "true");
  textarea.style.position = "fixed";
  textarea.style.opacity = "0";
  document.body.appendChild(textarea);
  textarea.focus();
  textarea.select();
  const copied = document.execCommand("copy");
  document.body.removeChild(textarea);

  if (!copied) {
    throw new Error("clipboard unavailable");
  }
}

function formatTimestamp(locale: "en" | "de", value: string | undefined) {
  if (!value) {
    return "n/a";
  }

  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleString(locale);
}

function formatConnectionStateLabel(state: ConnectionState) {
  return state.charAt(0).toUpperCase() + state.slice(1);
}

function extractFilenameCandidate(prompt: string) {
  const match = prompt.match(CONTEXT_FILENAME_PATTERN);
  return match?.[0] ?? null;
}

function resolveConnectionStateTone(state: ConnectionState) {
  if (state === "completed") {
    return "ready";
  }

  if (state === "error") {
    return "error";
  }

  if (state === "submitting" || state === "streaming") {
    return "partial";
  }

  return "muted";
}

function buildProposalConsequence(locale: "en" | "de", modelAlias: string | null) {
  const alias = modelAlias ?? "selected public alias";
  return locale === "de"
    ? `Freigeben sendet diesen Prompt an den Backend-Alias ${alias}. Ein Backend-Ausführungsbeleg wird in dieser Session protokolliert.`
    : `Approve sends this prompt to backend alias ${alias}. A backend execution receipt will be recorded in this session.`;
}

function buildChatGovernanceRows(options: {
  modelAlias: string | null;
  receiptSummary?: string | null;
}) {
  return buildGovernanceMetadataRows({
    actingIdentity: BACKEND_TRUTH_UNAVAILABLE,
    activeScope: "session-local chat thread (browser)",
    authorityDomain: "chat backend route (/chat)",
    targetScope: options.modelAlias ? `public alias ${options.modelAlias}` : "public alias unresolved",
    executionDomain: "backend SSE stream",
    executionTarget: options.modelAlias ? `public alias ${options.modelAlias}` : null,
    receiptSummary: options.receiptSummary ?? null,
  });
}

type ThreadMessageCardProps = {
  message: ChatMessage;
  expertMode: boolean;
  operatorLabel: string;
  agentLabel: string;
  locale: "en" | "de";
  copyState: "idle" | "copied" | "failed";
  highlightedAction: "github" | "matrix" | null;
  expandedActions: boolean;
  onToggleActions: (messageId: string) => void;
  onGitHubAction: (message: ChatMessage) => void;
  onMatrixAction: (message: ChatMessage) => void;
  onCopyAction: (message: ChatMessage) => void;
};

const ThreadMessageCard = React.memo(function ThreadMessageCard(props: ThreadMessageCardProps) {
  const roleLabel = props.message.role === "user" ? props.operatorLabel : props.agentLabel;
  const isAssistant = props.message.role === "assistant";
  const contentLooksLikeCode = /```|^\s*(?:const|let|function|class|import|export|expect|npm|git)\b|[{};]/im.test(props.message.content);
  const contentLooksRepoReady = /\b(?:checklist|diff|commit|github|pull request|pr|branch|file|repo|assertion|typecheck)\b/i.test(props.message.content);
  const primaryAction = contentLooksLikeCode && !contentLooksRepoReady ? "copy" : contentLooksRepoReady ? "github" : "copy";
  const copyLabel = props.copyState === "copied"
    ? (props.locale === "de" ? "Kopiert" : "Copied")
    : props.copyState === "failed"
      ? (props.locale === "de" ? "Fehlgeschlagen" : "Failed")
      : (props.locale === "de" ? "Kopieren" : "Copy");
  const primaryLabel = primaryAction === "github"
    ? (props.locale === "de" ? "GitHub vorbereiten" : "Prepare GitHub")
    : copyLabel;

  return (
    <ShellCard
      variant={props.message.role === "user" ? "muted" : "base"}
      className={`thread-block ${props.message.role === "user" ? "thread-block-operator" : "thread-block-agent"}`}
    >
      <header className="thread-block-header">
        <SectionLabel>{roleLabel}</SectionLabel>
        {props.expertMode && props.message.modelAlias ? <StatusBadge tone="muted">{props.message.modelAlias}</StatusBadge> : null}
      </header>
      <MarkdownMessage content={props.message.content} />
      {isAssistant ? <InlineDiff content={props.message.content} /> : null}
      {isAssistant ? (
        <div
          className={props.expandedActions ? "thread-message-actions thread-message-actions-expanded" : "thread-message-actions"}
          role="group"
          aria-label={props.locale === "de" ? "Nachrichtenaktionen" : "Message actions"}
        >
          <button
            type="button"
            className="ghost-button thread-message-action-button thread-message-action-primary"
            onClick={() => {
              if (primaryAction === "github") {
                props.onGitHubAction(props.message);
                return;
              }
              props.onCopyAction(props.message);
            }}
            aria-label={primaryLabel}
            title={primaryLabel}
          >
            {primaryLabel}
            {primaryAction === "github" ? <span className="thread-message-backend-badge">→ backend</span> : null}
          </button>
          <button
            type="button"
            className="ghost-button thread-message-action-button thread-message-action-more"
            onClick={() => props.onToggleActions(props.message.id)}
            aria-expanded={props.expandedActions}
            aria-label={props.locale === "de" ? "Weitere Aktionen anzeigen" : "Show more actions"}
            title={props.locale === "de" ? "Weitere Aktionen" : "More actions"}
          >
            ··· mehr
          </button>
          <div className="thread-message-secondary-actions">
            {primaryAction !== "github" ? (
              <button
                type="button"
                className={props.highlightedAction === "github"
                  ? "ghost-button thread-message-action-button thread-message-action-button-highlight"
                  : "ghost-button thread-message-action-button"}
                onClick={() => props.onGitHubAction(props.message)}
                aria-label={props.locale === "de" ? "In GitHub dispatchen" : "Dispatch to GitHub"}
                title={props.locale === "de" ? "In GitHub dispatchen" : "Dispatch to GitHub"}
              >
                ↯ GitHub <span className="thread-message-backend-badge">→ backend</span>
              </button>
            ) : null}
            <button
              type="button"
              className={props.highlightedAction === "matrix"
                ? "ghost-button thread-message-action-button thread-message-action-button-highlight"
                : "ghost-button thread-message-action-button"}
              onClick={() => props.onMatrixAction(props.message)}
              aria-label={props.locale === "de" ? "Als Matrix-Post vorbereiten" : "Prepare as Matrix post"}
              title={props.locale === "de" ? "Als Matrix-Post vorbereiten" : "Prepare as Matrix post"}
            >
              ⊛ Matrix <span className="thread-message-backend-badge">→ backend</span>
            </button>
            {primaryAction !== "copy" ? (
              <button
                type="button"
                className="ghost-button thread-message-action-button thread-message-action-copy"
                onClick={() => props.onCopyAction(props.message)}
                aria-label={props.locale === "de" ? "Nachricht kopieren" : "Copy message"}
                title={props.locale === "de" ? "Nachricht kopieren" : "Copy message"}
              >
                {copyLabel}
              </button>
            ) : null}
          </div>
        </div>
      ) : null}
    </ShellCard>
  );
});

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const { locale, copy: ui } = useLocalization();
  const beginnerMode = isBeginnerMode(props.workMode);
  const expertMode = isExpertMode(props.workMode);
  const workModeCopy = getWorkModeCopy(locale, props.workMode);
  const composerRef = useRef<HTMLTextAreaElement | null>(null);
  const [chatState, dispatch] = useReducer(
    chatReducer,
    props.session.metadata.chatState,
    createInitialChatState,
  );
  const persistedSessionModelAlias = normalizeModelAlias(props.session.metadata.selectedModelAlias);
  const [selectedModel, setSelectedModel] = useState(
    resolveInitialChatModelAlias({
      sessionSelectedModelAlias: persistedSessionModelAlias,
      activeModelAlias: props.activeModelAlias,
      availableModels: props.availableModels,
      modelRegistry: props.modelRegistry,
    }),
  );
  const [executionMode, setExecutionMode] = useState<ChatExecutionMode>(
    props.session.metadata.executionMode
  );
  const [branchSelectorOpen, setBranchSelectorOpen] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const malformedAbortRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const tokenBatcherRef = useRef<ReturnType<typeof createTokenBatcher> | null>(null);
  const sessionSyncHandleRef = useRef<number | null>(null);
  const latestSessionRef = useRef<ChatSession | null>(null);
  const flushSessionSync = useCallback(() => {
    if (sessionSyncHandleRef.current !== null) {
      globalThis.clearTimeout(sessionSyncHandleRef.current);
      sessionSyncHandleRef.current = null;
    }

    if (latestSessionRef.current) {
      props.onSessionChange(latestSessionRef.current);
    }
  }, [props.onSessionChange]);
  const modelOptions = useMemo(
    () => (props.modelRegistry.length > 0
      ? props.modelRegistry
      : props.availableModels.map((alias) => ({
          alias,
          label: alias,
          description: "",
          capabilities: [],
          tier: "core" as const,
          streaming: true,
          recommendedFor: [],
        }))),
    [props.availableModels, props.modelRegistry],
  );
  const [modelPickerOpen, setModelPickerOpen] = useState(false);
  const [messageCopyState, setMessageCopyState] = useState<Record<string, "idle" | "copied" | "failed">>({});
  const [matrixComposeOpen, setMatrixComposeOpen] = useState(false);
  const [matrixComposeSourceMessageId, setMatrixComposeSourceMessageId] = useState<string | null>(null);
  const [matrixComposeContent, setMatrixComposeContent] = useState("");
  const [matrixComposeRoomId, setMatrixComposeRoomId] = useState(props.matrixDraftDefaultRoomId ?? props.matrixDraftRoomOptions[0] ?? "");
  const [matrixComposeTags, setMatrixComposeTags] = useState<string[]>([]);
  const [githubDispatchOpen, setGithubDispatchOpen] = useState(false);
  const [githubDispatchSourceMessageId, setGithubDispatchSourceMessageId] = useState<string | null>(null);
  const [githubDispatchContent, setGithubDispatchContent] = useState("");
  const [matrixGuideSeen, setMatrixGuideSeen] = useState(() => hasSeenGuideKey(GUIDE_KEY_MATRIX_CTA));
  const [githubGuideSeen, setGithubGuideSeen] = useState(() => hasSeenGuideKey(GUIDE_KEY_GITHUB_CTA));
  const [contextGuideSeen, setContextGuideSeen] = useState(() => hasSeenGuideKey(GUIDE_KEY_CONTEXT_CTA));
  const [copyGuideSeen, setCopyGuideSeen] = useState(() => hasSeenGuideKey(GUIDE_KEY_COPY_CTA));
  const [activeInlineGuide, setActiveInlineGuide] = useState<"matrix" | "github" | null>(null);
  const [contextTipPending, setContextTipPending] = useState<{ prompt: string; fileName: string } | null>(null);
  const [copyDiscoveryPending, setCopyDiscoveryPending] = useState(false);
  const [expandedActionMessageId, setExpandedActionMessageId] = useState<string | null>(null);
  const [highlightedMessageAction, setHighlightedMessageAction] = useState<{
    messageId: string;
    action: "github" | "matrix";
  } | null>(null);
  const [openRouterSetupState, setOpenRouterSetupState] = useState(() => readGuideSetupState(GUIDE_KEY_SETUP_OPENROUTER));
  const [emptyStatePromptIndex, setEmptyStatePromptIndex] = useState(0);

  useEffect(() => {
    if (!modelPickerOpen) {
      return;
    }

    const closePicker = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof HTMLElement)) {
        return;
      }

      if (target.closest(".chat-compose-inline-meta")) {
        return;
      }

      setModelPickerOpen(false);
    };

    window.addEventListener("pointerdown", closePicker);
    return () => window.removeEventListener("pointerdown", closePicker);
  }, [modelPickerOpen]);

  const matrixRoomOptions = useMemo(() => {
    const order = [props.matrixDraftDefaultRoomId, ...props.matrixDraftRoomOptions];
    const next: string[] = [];
    for (const value of order) {
      const trimmed = value?.trim();
      if (!trimmed || next.includes(trimmed)) {
        continue;
      }
      next.push(trimmed);
    }
    return next;
  }, [props.matrixDraftDefaultRoomId, props.matrixDraftRoomOptions]);

  useEffect(() => {
    if (selectedModel.trim().length > 0) {
      return;
    }

    const nextModel = resolveInitialChatModelAlias({
      sessionSelectedModelAlias: persistedSessionModelAlias,
      activeModelAlias: props.activeModelAlias,
      availableModels: props.availableModels,
      modelRegistry: props.modelRegistry,
    });

    if (nextModel.trim().length > 0) {
      setSelectedModel(nextModel);
      props.onActiveModelAliasChange(nextModel);
    }
  }, [
    persistedSessionModelAlias,
    props.activeModelAlias,
    props.availableModels,
    props.modelRegistry,
    props.onActiveModelAliasChange,
    selectedModel,
  ]);
  const handleModelSelect = useCallback((nextModel: string) => {
    setSelectedModel(nextModel);
    props.onActiveModelAliasChange(nextModel);
    props.onTelemetry("info", "Model alias changed", `Selected public alias ${nextModel || "unresolved"}.`);
    setModelPickerOpen(false);
  }, [props]);

  useEffect(() => {
    if (matrixComposeOpen || matrixComposeRoomId.trim().length > 0 || matrixRoomOptions.length === 0) {
      return;
    }

    setMatrixComposeRoomId(matrixRoomOptions[0]);
  }, [matrixComposeOpen, matrixComposeRoomId, matrixRoomOptions]);

  useEffect(() => {
    const nextState = selectedModel.trim().length > 0 ? "done" : "pending";
    if (nextState !== openRouterSetupState) {
      writeGuideSetupState(GUIDE_KEY_SETUP_OPENROUTER, nextState);
      setOpenRouterSetupState(nextState);
    }
  }, [openRouterSetupState, selectedModel]);

  useEffect(() => {
    const hasUserMessage = chatState.messages.some((message) => message.role === "user");
    if (hasUserMessage && !hasSeenGuideKey(GUIDE_KEY_FIRST_MESSAGE_SENT)) {
      markGuideKeySeen(GUIDE_KEY_FIRST_MESSAGE_SENT);
    }
  }, [chatState.messages]);

  useEffect(() => {
    const nextSession: ChatSession = {
      ...props.session,
      title: deriveSessionTitle({
        ...props.session,
        metadata: {
          ...props.session.metadata,
          chatState,
          selectedModelAlias: selectedModel || null,
          executionMode,
        },
      }),
      updatedAt: new Date().toISOString(),
      status: deriveSessionStatus({
        ...props.session,
        metadata: {
          ...props.session.metadata,
          chatState,
          selectedModelAlias: selectedModel || null,
          executionMode,
        },
      }),
      resumable: true,
      metadata: {
        ...props.session.metadata,
        chatState,
        selectedModelAlias: selectedModel || null,
        executionMode,
      },
    };

    latestSessionRef.current = nextSession;
    if (shouldFlushChatSessionSyncImmediately(chatState.connectionState)) {
      flushSessionSync();
      return;
    }

    if (sessionSyncHandleRef.current !== null) {
      return;
    }

    sessionSyncHandleRef.current = globalThis.setTimeout(() => {
      sessionSyncHandleRef.current = null;
      if (latestSessionRef.current) {
        props.onSessionChange(latestSessionRef.current);
      }
    }, resolveChatSessionSyncInterval(chatState.connectionState));
  }, [chatState, executionMode, flushSessionSync, props.onSessionChange, props.session.id, selectedModel]);

  useEffect(() => () => {
    flushSessionSync();
  }, [flushSessionSync]);

  useEffect(() => {
    const schedule = (callback: () => void) => {
      if (typeof window !== "undefined" && typeof window.requestAnimationFrame === "function") {
        return window.requestAnimationFrame(() => callback());
      }

      return setTimeout(callback, 16) as unknown as number;
    };
    const cancel = (handle: number) => {
      if (typeof window !== "undefined" && typeof window.cancelAnimationFrame === "function") {
        window.cancelAnimationFrame(handle);
        return;
      }

      clearTimeout(handle);
    };

    if (scrollFrameRef.current !== null) {
      cancel(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }

    const hasThreadActivity = chatState.messages.length > 0
      || chatState.receipts.length > 0
      || chatState.notices.length > 0
      || Boolean(chatState.pendingProposal)
      || Boolean(chatState.currentAssistantDraft?.started);

    if (!hasThreadActivity) {
      return;
    }

    scrollFrameRef.current = schedule(() => {
      scrollFrameRef.current = null;
      messageEndRef.current?.scrollIntoView({
        behavior: resolveChatScrollBehavior(chatState.connectionState),
        block: "end"
      });
    });

    return () => {
      if (scrollFrameRef.current !== null) {
        cancel(scrollFrameRef.current);
        scrollFrameRef.current = null;
      }
    };
  }, [
    chatState.connectionState,
    chatState.messages.length,
    chatState.pendingProposal?.status,
    chatState.receipts.length,
    chatState.notices.length,
    chatState.currentAssistantDraft?.text
  ]);

  function createTokenDispatcher() {
    tokenBatcherRef.current?.cancel();
    tokenBatcherRef.current = createTokenBatcher({
      onFlush: (batchedDelta) => {
        dispatch({
          type: "stream_token",
          delta: batchedDelta
        });
      }
    });
  }

  function flushBatchedTokens() {
    tokenBatcherRef.current?.flush();
  }

  function stopExecution() {
    flushBatchedTokens();
    abortRef.current?.abort();
  }

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const hasPrimaryModifier = event.metaKey || event.ctrlKey;
      if (hasPrimaryModifier && event.key === ".") {
        event.preventDefault();
        stopExecution();
        return;
      }

      if (event.key === "Escape" && modelPickerOpen) {
        event.preventDefault();
        setModelPickerOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [modelPickerOpen]);

  function openMatrixComposeFromMessage(message: ChatMessage) {
    if (message.role !== "assistant") {
      return;
    }

    const content = message.content.trim();
    if (!content) {
      return;
    }

    setGithubDispatchOpen(false);
    setMatrixComposeSourceMessageId(message.id);
    setMatrixComposeContent(content);
    setMatrixComposeTags([]);
    setMatrixComposeRoomId(props.matrixDraftDefaultRoomId ?? matrixRoomOptions[0] ?? "");
    setMatrixComposeOpen(true);
  }

  function openGitHubDispatchFromMessage(message: ChatMessage) {
    if (message.role !== "assistant") {
      return;
    }

    const content = message.content.trim();
    if (!content) {
      return;
    }

    setMatrixComposeOpen(false);
    setGithubDispatchSourceMessageId(message.id);
    setGithubDispatchContent(content);
    setGithubDispatchOpen(true);
  }

  function toggleMatrixTag(tag: string) {
    setMatrixComposeTags((current) => (
      current.includes(tag)
        ? current.filter((item) => item !== tag)
        : [...current, tag]
    ));
  }

  function submitMatrixComposeDraft() {
    if (!matrixComposeOpen || !matrixComposeSourceMessageId) {
      return;
    }

    const roomId = matrixComposeRoomId.trim();
    const content = matrixComposeContent.trim();
    if (!roomId || !content) {
      return;
    }

    props.onCrossTabCommand({
      type: "QueueMatrixDraft",
      payload: {
        sourceMessageId: matrixComposeSourceMessageId,
        roomId,
        content,
        tags: matrixComposeTags,
      },
    });
    setMatrixComposeOpen(false);
    setMatrixComposeSourceMessageId(null);
    setMatrixComposeContent("");
    setMatrixComposeTags([]);
  }

  function dispatchMessageToGitHub() {
    if (!githubDispatchOpen || !githubDispatchSourceMessageId) {
      return;
    }

    const content = githubDispatchContent.trim();
    if (!content) {
      return;
    }

    props.onCrossTabCommand({
      type: "OpenWorkbenchWithDraft",
      payload: {
        sourceMessageId: githubDispatchSourceMessageId,
        content,
        repo: props.workbenchBinding.repo ?? "",
        branch: props.workbenchBinding.branch ?? undefined,
        intent: "analysis",
      },
    });
    setGithubDispatchOpen(false);
    setGithubDispatchSourceMessageId(null);
    setGithubDispatchContent("");
  }

  async function copyMessageContent(message: ChatMessage) {
    const content = message.content.trim();
    if (!content) {
      return;
    }

    try {
      await copyTextToClipboard(content);
      setMessageCopyState((current) => ({ ...current, [message.id]: "copied" }));
      if (!copyGuideSeen) {
        setCopyDiscoveryPending(true);
      }
    } catch {
      setMessageCopyState((current) => ({ ...current, [message.id]: "failed" }));
    } finally {
      globalThis.setTimeout(() => {
        setMessageCopyState((current) => ({ ...current, [message.id]: "idle" }));
      }, MESSAGE_ACTION_COPY_RESET_MS);
    }
  }

  function pulseMessageAction(messageId: string, action: "github" | "matrix") {
    setHighlightedMessageAction({ messageId, action });
    globalThis.setTimeout(() => {
      setHighlightedMessageAction((current) => {
        if (!current) {
          return current;
        }
        if (current.messageId !== messageId || current.action !== action) {
          return current;
        }
        return null;
      });
    }, MESSAGE_ACTION_GUIDE_PULSE_MS);
  }

  function markMatrixGuideSeen() {
    markGuideKeySeen(GUIDE_KEY_MATRIX_CTA);
    setMatrixGuideSeen(true);
  }

  function markGitHubGuideSeen() {
    markGuideKeySeen(GUIDE_KEY_GITHUB_CTA);
    setGithubGuideSeen(true);
  }

  function markContextGuideSeen() {
    markGuideKeySeen(GUIDE_KEY_CONTEXT_CTA);
    setContextGuideSeen(true);
  }

  function markCopyGuideSeen() {
    markGuideKeySeen(GUIDE_KEY_COPY_CTA);
    setCopyGuideSeen(true);
  }

  function createProposal(prompt: string) {
    const trimmedPrompt = prompt.trim();

    if (!trimmedPrompt) {
      return;
    }

    dispatch({
      type: "create_proposal",
      proposal: buildGovernedChatProposal({
        prompt: trimmedPrompt,
        modelAlias: selectedModel || null,
        consequence: buildProposalConsequence(locale, selectedModel || null),
        createdAt: new Date().toISOString(),
        createId
      })
    });
    props.onTelemetry("info", "Chat proposal created", "Awaiting operator approval before backend execution.");
  }

  async function executeDirectPrompt(prompt: string) {
    const userMessage = createChatUserMessage(prompt, createId);

    dispatch({
      type: "submit_message",
      message: userMessage
    });
    props.onTelemetry("info", "Direct chat submitted", "Read-only chat request sent to backend /chat.");

    const controller = new AbortController();
    abortRef.current = controller;
    malformedAbortRef.current = false;
    createTokenDispatcher();

    try {
      await runDirectChatStream({
        prompt,
        modelAlias: selectedModel || null,
        messages: chatState.messages,
        stream: streamChatCompletion,
        signal: controller.signal,
        userMessage,
        handlers: {
          onStart: (payload) => {
            dispatch({
              type: "stream_start",
              model: payload.model
            });
            props.onTelemetry("info", "Direct chat started", `Backend accepted stream for alias ${payload.model}.`);
          },
          onRoute: (payload) => {
            dispatch({
              type: "stream_route",
              route: payload.route
            });
            props.onTelemetry(
              "info",
              "Chat route metadata",
              `${payload.route.selectedAlias} (${payload.route.taskClass}), fallback=${payload.route.fallbackUsed ? "yes" : "no"}`
            );
          },
          onToken: (delta) => {
            tokenBatcherRef.current?.push(delta);
          },
          onDone: (payload) => {
            flushBatchedTokens();
            dispatch({
              type: "stream_done",
              model: payload.model,
              text: payload.text,
              route: payload.route
            });
            props.onTelemetry("info", "Direct chat completed", `Execution finalized via alias ${payload.model}.`);
          },
          onError: (message) => {
            flushBatchedTokens();
            dispatch({
              type: "stream_error",
              message
            });
            props.onTelemetry("error", "Direct chat failed", message);
          },
          onMalformed: (message) => {
            malformedAbortRef.current = true;
            flushBatchedTokens();
            dispatch({
              type: "stream_malformed",
              message
            });
            props.onTelemetry("warning", "Chat stream unverifiable", message);
            controller.abort();
          }
        }
      });
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError" && malformedAbortRef.current) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        flushBatchedTokens();
        dispatch({
          type: "stream_error",
          message: "Execution cancelled by operator."
        });
        dispatch({
          type: "mark_stream_cancelled"
        });
        props.onTelemetry("warning", "Chat execution cancelled", "Active execution was aborted by the operator.");
        return;
      }

      const message = error instanceof Error ? error.message : "Streaming request failed";
      flushBatchedTokens();
      dispatch({
        type: "stream_error",
        message
      });
      props.onTelemetry("error", "Chat request failed", message);
    } finally {
      abortRef.current = null;
      tokenBatcherRef.current?.cancel();
      tokenBatcherRef.current = null;
    }
  }

  async function executeProposal(proposal: ChatProposal) {
    const userMessage: ChatMessage = createChatUserMessage(proposal.prompt, createId);

    dispatch({
      type: "start_proposal_execution"
    });
    dispatch({
      type: "submit_message",
      message: userMessage
    });
    props.onTelemetry("info", "Chat proposal approved", "Backend execution started for approved proposal.");

    const controller = new AbortController();
    abortRef.current = controller;
    malformedAbortRef.current = false;
    createTokenDispatcher();

    const outboundMessages = buildOutboundChatMessages(chatState.messages, userMessage);

    try {
      await streamChatCompletion(
        {
          modelAlias: proposal.modelAlias ?? selectedModel ?? undefined,
          messages: outboundMessages
        },
        {
          onStart: (payload) => {
            dispatch({
              type: "stream_start",
              model: payload.model
            });
            props.onTelemetry("info", "Chat execution started", `Backend accepted stream for alias ${payload.model}.`);
          },
          onRoute: (payload) => {
            dispatch({
              type: "stream_route",
              route: payload.route
            });
            props.onTelemetry(
              "info",
              "Chat route metadata",
              `${payload.route.selectedAlias} (${payload.route.taskClass}), fallback=${payload.route.fallbackUsed ? "yes" : "no"}`
            );
          },
          onToken: (delta) => {
            tokenBatcherRef.current?.push(delta);
          },
          onDone: (payload) => {
            flushBatchedTokens();
            dispatch({
              type: "stream_done",
              model: payload.model,
              text: payload.text,
              route: payload.route
            });
            props.onTelemetry("info", "Chat execution completed", `Execution finalized via alias ${payload.model}.`);
          },
          onError: (message) => {
            flushBatchedTokens();
            dispatch({
              type: "stream_error",
              message
            });
            props.onTelemetry("error", "Chat execution failed", message);
          },
          onMalformed: (message) => {
            malformedAbortRef.current = true;
            flushBatchedTokens();
            dispatch({
              type: "stream_malformed",
              message
            });
            props.onTelemetry("warning", "Chat stream unverifiable", message);
            controller.abort();
          }
        },
        controller.signal
      );
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError" && malformedAbortRef.current) {
        return;
      }

      if (error instanceof DOMException && error.name === "AbortError") {
        flushBatchedTokens();
        dispatch({
          type: "stream_error",
          message: "Execution cancelled by operator."
        });
        dispatch({
          type: "mark_stream_cancelled"
        });
        props.onTelemetry("warning", "Chat execution cancelled", "Active execution was aborted by the operator.");
        return;
      }

      const message = error instanceof Error ? error.message : "Streaming request failed";
      flushBatchedTokens();
      dispatch({
        type: "stream_error",
        message
      });
      props.onTelemetry("error", "Chat request failed", message);
    } finally {
      abortRef.current = null;
      tokenBatcherRef.current?.cancel();
      tokenBatcherRef.current = null;
    }
  }

  async function submitPrompt(prompt: string) {
    if (executionMode === "governed") {
      createProposal(prompt);
      return;
    }
    await executeDirectPrompt(prompt);
  }

  function rejectProposal() {
    dispatch({
      type: "reject_proposal"
    });
    props.onTelemetry("info", "Chat proposal rejected", "Operator rejected proposal before backend execution.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const trimmed = chatState.input.trim();

    if (!trimmed) {
      return;
    }

    if (executionMode === "governed" && readWriteGuardrailBlocked) {
      const message = !workbenchBranch
        ? (locale === "de"
          ? "Read & Write ist blockiert: aktive Branch in der Workbench auswählen."
          : "Read & Write is blocked: select an active branch in Workbench.")
        : (locale === "de"
          ? "Read & Write ist blockiert: direkte Main-Arbeit ist nicht erlaubt."
          : "Read & Write is blocked: direct main branch work is not allowed.");
      dispatch({
        type: "stream_error",
        message,
      });
      props.onTelemetry("warning", "Read & Write blocked", message);
      return;
    }

    const prompt = buildPinnedChatContextPrompt(trimmed, props.pinnedContext, locale);
    const contextFilename = extractFilenameCandidate(trimmed);
    const shouldOfferContextTip = Boolean(
      contextFilename
      && !props.pinnedContext
      && !contextGuideSeen,
    );

    if (shouldOfferContextTip && contextFilename) {
      setContextTipPending({ prompt, fileName: contextFilename });
      return;
    }

    await submitPrompt(prompt);
  }

  const pendingProposal = chatState.pendingProposal;
  const warning = chatState.lastStreamWarning;
  const error = chatState.lastError;
  const draft = chatState.currentAssistantDraft;
  const workbenchRepo = props.workbenchBinding.repo?.trim() || null;
  const workbenchBranch = props.workbenchBinding.branch?.trim() || null;
  const workbenchScope = props.workbenchBinding.scope?.trim() || null;
  const directMainBranch = workbenchBranch === "main" || workbenchBranch === "master";
  const readWriteGuardrailBlocked = executionMode === "governed" && (!workbenchBranch || directMainBranch);
  const composerPlaceholder = executionMode === "direct"
    ? (locale === "de" ? "Frage stellen — Repo ist schreibgeschützt" : "Ask anything — repo is read-only")
    : (locale === "de" ? "Nächste Änderung planen" : "Plan the next change");
  const awaitingApproval = executionMode === "governed" && pendingProposal?.status === "pending";
  const executionRunning =
    pendingProposal?.status === "executing"
    || chatState.connectionState === "submitting"
    || chatState.connectionState === "streaming";
  const modelUnresolved = selectedModel.trim().length === 0;
  const backendUnreachable = props.backendHealthy === false;
  const connectionStateTone = resolveConnectionStateTone(chatState.connectionState);
  const composerBlockReason = resolveChatComposerBlockReason({
    executionMode,
    backendUnreachable,
    modelUnresolved,
    awaitingApproval: Boolean(awaitingApproval),
    executionRunning,
    copy: ui.chat.composerLocked
  });
  const modeChipLabel = executionMode === "direct" ? "⚡ direct" : "◎ governed";
  const branchBadgeLabel = workbenchBranch
    ? `branch: ${workbenchBranch} · ${directMainBranch ? (locale === "de" ? "read-only" : "read-only") : (locale === "de" ? "writable" : "writable")}`
    : `branch: ${locale === "de" ? "none" : "none"} · read-only`;
  const submitTooltip = composerBlockReason
    ?? (
      readWriteGuardrailBlocked
        ? (locale === "de"
          ? "Read & Write blockiert: Branch prüfen"
          : "Read & Write blocked: check branch")
        : null
    );
  const routingStatusItems = buildChatRoutingStatusItems({
    selectedModel,
    backendHealthy: props.backendHealthy,
    fallbackAllowed: props.routingStatus.fallbackAllowed,
    activeRoute: chatState.activeRoute,
    copy: {
      activeModel: ui.chat.routingStatus.activeModel,
      providerStatus: ui.chat.routingStatus.providerStatus,
      fallbackPolicy: ui.chat.routingStatus.fallbackPolicy,
      routeState: ui.chat.routingStatus.routeState,
      ready: ui.common.ready,
      checking: ui.shell.healthChecking,
      error: ui.common.error,
      fallbackEnabled: ui.chat.routingStatus.fallbackEnabled,
      fallbackDisabled: ui.chat.routingStatus.fallbackDisabled,
      fallbackUsed: ui.chat.routingStatus.fallbackUsed,
      degraded: ui.chat.routeDegraded,
      routePending: ui.chat.routePending,
      unavailable: ui.settings.unavailable,
    },
  });

  const notices = useMemo(
    () => [
      ...chatState.notices,
      ...(warning && !chatState.notices.some((notice) => notice.message === warning)
        ? [{ id: `warning-${warning}`, level: "system" as const, message: warning, createdAt: "" }]
        : []),
      ...(error && !chatState.notices.some((notice) => notice.message === error)
        ? [{ id: `error-${error}`, level: "error" as const, message: error, createdAt: "" }]
        : [])
    ],
    [chatState.notices, error, warning],
  );
  const assistantMessages = useMemo(
    () => chatState.messages.filter((message) => message.role === "assistant" && message.content.trim().length > 0),
    [chatState.messages],
  );
  const latestAssistantMessage = assistantMessages[assistantMessages.length - 1] ?? null;
  const assistantMessageCount = assistantMessages.length;
  const matrixComposeBlocked = matrixComposeRoomId.trim().length === 0 || matrixComposeContent.trim().length === 0;
  const showSetupBlockingCta = openRouterSetupState !== "done" && selectedModel.trim().length === 0;
  const showChatEmptyCta = !showSetupBlockingCta
    && chatState.messages.length === 0
    && chatState.receipts.length === 0
    && !pendingProposal;
  const showInlineGuideCta = !showSetupBlockingCta && !showChatEmptyCta && Boolean(contextTipPending || activeInlineGuide);
  const showCopyDiscoveryChip = !showSetupBlockingCta && !showChatEmptyCta && !showInlineGuideCta && copyDiscoveryPending;
  const starterPrompts = CHAT_STARTER_PROMPTS[locale];
  const activeStarterPrompt = starterPrompts[emptyStatePromptIndex % starterPrompts.length] ?? starterPrompts[0];

  useEffect(() => {
    if (workbenchBranch && branchSelectorOpen) {
      setBranchSelectorOpen(false);
    }
  }, [branchSelectorOpen, workbenchBranch]);

  useEffect(() => {
    if (assistantMessageCount > 0 && !hasSeenGuideKey(GUIDE_KEY_FIRST_AI_RESPONSE)) {
      markGuideKeySeen(GUIDE_KEY_FIRST_AI_RESPONSE);
    }
  }, [assistantMessageCount]);

  useEffect(() => {
    if (contextTipPending || activeInlineGuide) {
      return;
    }

    if (assistantMessageCount >= 1 && !matrixGuideSeen) {
      setActiveInlineGuide("matrix");
      return;
    }

    if (assistantMessageCount >= 2 && !githubGuideSeen) {
      setActiveInlineGuide("github");
    }
  }, [activeInlineGuide, assistantMessageCount, contextTipPending, githubGuideSeen, matrixGuideSeen]);

  return (
    <section
      className="workspace-panel chat-workspace governed-chat-workspace"
      data-testid="chat-workspace"
      aria-busy={executionRunning}
    >
      <section className="chat-toolbar">
        <div className="chat-toolbar-copy">
          <SectionLabel>{ui.chat.title}</SectionLabel>
          <span
            className={`shell-badge shell-badge-${connectionStateTone} chat-connection-state`}
            data-testid="chat-connection-state"
          >
            {formatConnectionStateLabel(chatState.connectionState)}
          </span>
          {beginnerMode ? <span className="chat-stream-status">{workModeCopy.controlHint}</span> : null}
        </div>
        <div className="runtime-actions chat-toolbar-actions chat-toolbar-primary-actions">
          <GuideOverlay content={getWorkspaceGuide(locale, "chat")} testId="guide-chat" />
          {executionRunning ? (
            <button type="button" className="ghost-button" onClick={stopExecution}>
              {ui.chat.stopExecution}
            </button>
          ) : null}
          {notices.length > 0 ? (
            <button type="button" className="secondary-button" onClick={() => dispatch({ type: "clear_notices" })}>
              {ui.chat.clearNotices}
            </button>
          ) : null}
        </div>

        <div className="chat-toolbar-controls">
          <div className="chat-toolbar-control-group">
            <label>{ui.chat.modeLabel}</label>
            <div className="mode-toggle" role="group" aria-label={ui.chat.modeLabel}>
              <button
                type="button"
                className={executionMode === "direct" ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
                aria-pressed={executionMode === "direct"}
                disabled={executionRunning}
                onClick={() => {
                  setExecutionMode("direct");
                  dispatch({ type: "clear_pending_proposal" });
                  props.onTelemetry("info", "Chat mode changed", "Direct chat mode enabled.");
                }}
              >
                {ui.chat.modeDirect}
              </button>
              <button
                type="button"
                className={executionMode === "governed" ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
                aria-pressed={executionMode === "governed"}
                disabled={executionRunning}
                onClick={() => {
                  if (!workbenchBranch) {
                    setBranchSelectorOpen(true);
                    props.onTelemetry("warning", "Read & Write branch required", "Read & Write mode requires a Workbench branch.");
                    return;
                  }

                  setExecutionMode("governed");
                  props.onTelemetry("info", "Chat mode changed", "Governed execution mode enabled.");
                }}
              >
                {ui.chat.modeGoverned}
              </button>
            </div>
          </div>
          {executionMode === "governed" ? (
            <div className="chat-toolbar-control-group chat-work-mode-guardrail" data-testid="chat-work-mode-guardrail">
              <>
                <strong>{locale === "de" ? "Read & Write" : "Read & Write"}</strong>
                <p>
                  {locale === "de"
                    ? `Aktive Branch: ${workbenchBranch ?? "nicht gesetzt"} · Scope: ${workbenchScope ?? "nicht gesetzt"}`
                    : `Active branch: ${workbenchBranch ?? "not set"} · Scope: ${workbenchScope ?? "not set"}`}
                </p>
                <p>
                  {locale === "de"
                    ? `Repo: ${workbenchRepo ?? "nicht gesetzt"} · Main bleibt geschützt, Änderungen werden erst in Workbench reviewbar.`
                    : `Repository: ${workbenchRepo ?? "not set"} · Main stays protected and changes become reviewable in Workbench first.`}
                </p>
                {readWriteGuardrailBlocked ? (
                  <p className="warning-banner" role="status">
                    {locale === "de"
                      ? (workbenchBranch ? "Direkte Main-Arbeit ist nicht erlaubt." : "Aktive Branch erforderlich.")
                      : (workbenchBranch ? "Direct main branch work is not allowed." : "An active branch is required.")}
                  </p>
                ) : null}
              </>
            </div>
          ) : null}
          {expertMode ? (
          <div className="chat-toolbar-control-group chat-toolbar-model-group">
            <label htmlFor="model-select">{ui.chat.modelSelectLabel}</label>
            <select
              id="model-select"
              value={selectedModel}
              onChange={(event) => {
                handleModelSelect(event.target.value);
              }}
              disabled={props.availableModels.length === 0 || (executionMode === "governed" && Boolean(pendingProposal))}
            >
              {props.availableModels.length === 0 ? (
                <option value="">{ui.chat.noModels}</option>
              ) : (
                modelOptions.map((model) => (
                  <option key={model.alias} value={model.alias}>
                    {model.label}
                  </option>
                ))
              )}
            </select>
          </div>
          ) : null}
        </div>
      </section>

      <section className="chat-card governed-chat-card">
        {beginnerMode ? (
          <ShellCard variant="muted" className="work-mode-guidance-card">
            <SectionLabel>{workModeCopy.label}</SectionLabel>
            <p>{locale === "de" ? "Ziel eingeben → Vorschlag prüfen → freigeben oder ablehnen." : "Enter goal -> review proposal -> approve or reject."}</p>
          </ShellCard>
        ) : null}
        {expertMode && chatState.activeRoute ? (
          <ShellCard variant="muted" className="work-mode-guidance-card">
            <SectionLabel>{locale === "de" ? "Route und Runtime" : "Route and runtime"}</SectionLabel>
            <p>{`${chatState.activeRoute.selectedAlias} · ${chatState.activeRoute.taskClass} · fallback=${chatState.activeRoute.fallbackUsed ? "yes" : "no"}`}</p>
          </ShellCard>
        ) : null}
        {executionMode === "governed" && pendingProposal?.status === "pending" ? (
          <ProposalCard
            testId="chat-proposal-card"
            title={locale === "de" ? "Proposal · requires approval" : "Proposal · requires approval"}
            summary={pendingProposal.prompt}
            consequence={pendingProposal.consequence}
            statusLabel={locale === "de" ? "requires approval" : "requires approval"}
            statusTone="partial"
            metadata={mergeMetadataRows(
              buildChatGovernanceRows({
                modelAlias: pendingProposal.modelAlias ?? selectedModel ?? null,
                receiptSummary: ui.chat.composerLocked.approval,
              }),
              [{ label: ui.sessionList.updated, value: formatTimestamp(locale, pendingProposal.createdAt) }]
            )}
          >
            <DecisionZone
              testId="chat-decision-zone"
              onApprove={() => {
                void executeProposal(pendingProposal);
              }}
              onReject={rejectProposal}
              approveLabel={locale === "de" ? "Execute ↵" : "Execute ↵"}
              rejectLabel={locale === "de" ? "Discard ⌫" : "Discard ⌫"}
              helperText={ui.chat.proposalHelper}
            />
          </ProposalCard>
        ) : null}

        {executionMode === "governed" && pendingProposal?.status === "executing" ? (
          <ApprovalTransitionCard
            testId="chat-executing-card"
            title={ui.chat.executingTitle}
            detail={ui.chat.executingDetail(pendingProposal.modelAlias ?? ui.common.na)}
          />
        ) : null}

        <div className="governed-thread" aria-live="polite">
          {showSetupBlockingCta ? (
            <EmptyStateCTA
              icon="⚠"
              title="OpenRouter-Key fehlt"
              description="Ohne Modellalias kann Chat nicht starten. Verbinde zuerst deinen Modellzugang."
              primaryLabel="Zu Settings"
              primaryAction={() => {
                if (typeof window !== "undefined") {
                  window.location.assign("/console?mode=settings");
                }
              }}
              footnote="Type A Setup: blockierend bis ein Modellzugang verfügbar ist."
            />
          ) : null}

          {showChatEmptyCta ? (
            <EmptyStateCTA
              icon="M"
              title="Bereit für deinen ersten Prompt"
              description="Repo binden oder direkt eine klare Frage senden."
              primaryLabel="▶ Beispiel-Prompt einfügen"
              primaryAction={() => {
                dispatch({ type: "set_input", input: activeStarterPrompt });
                setEmptyStatePromptIndex((current) => (current + 1) % starterPrompts.length);
                composerRef.current?.focus();
              }}
              secondaryLabel="⊟ Repo verbinden"
              secondaryAction={() => {
                props.onCrossTabCommand({
                  type: "OpenWorkbenchWithDraft",
                  payload: {
                    sourceMessageId: "chat-empty-state",
                    content: activeStarterPrompt,
                    repo: props.workbenchBinding.repo ?? "",
                    branch: props.workbenchBinding.branch ?? undefined,
                    intent: "analysis",
                  },
                });
              }}
              footnote="Eingabe unten im Composer."
            />
          ) : null}

          {showInlineGuideCta && contextTipPending ? (
            <GuideCTAInline
              id="context-tip"
              icon="💡"
              title="KONTEXT-TIPP"
              body={`Du fragst nach "${contextTipPending.fileName}" - die Datei ist noch nicht im Kontext.`}
              primaryLabel="⊡ Datei laden"
              primaryAction={() => {
                const pending = contextTipPending;
                if (!pending) {
                  return;
                }
                markContextGuideSeen();
                setContextTipPending(null);
                props.onCrossTabCommand({
                  type: "OpenWorkbenchWithDraft",
                  payload: {
                    sourceMessageId: `context-${pending.fileName}`,
                    content: pending.prompt,
                    repo: props.workbenchBinding.repo ?? "",
                    branch: props.workbenchBinding.branch ?? undefined,
                    intent: "context",
                  },
                });
              }}
              secondaryLabel="Trotzdem senden"
              secondaryAction={() => {
                const pending = contextTipPending;
                if (!pending) {
                  return;
                }
                markContextGuideSeen();
                setContextTipPending(null);
                void submitPrompt(pending.prompt);
              }}
              onDismiss={() => {
                markContextGuideSeen();
                setContextTipPending(null);
              }}
              variant="warning"
            />
          ) : null}

          {showInlineGuideCta && !contextTipPending && activeInlineGuide === "matrix" && latestAssistantMessage ? (
            <GuideCTAInline
              id="matrix-dispatch"
              icon="💡"
              title="TIPP"
              body="Tippe [⊛], um diese Antwort direkt als Matrix-Post zu speichern."
              primaryLabel="⊛ Zeig mir wie"
              primaryAction={() => {
                markMatrixGuideSeen();
                setActiveInlineGuide(null);
                pulseMessageAction(latestAssistantMessage.id, "matrix");
                openMatrixComposeFromMessage(latestAssistantMessage);
              }}
              onDismiss={() => {
                markMatrixGuideSeen();
                setActiveInlineGuide(null);
              }}
              variant="matrix"
            />
          ) : null}

          {showInlineGuideCta && !contextTipPending && activeInlineGuide === "github" && latestAssistantMessage ? (
            <GuideCTAInline
              id="github-dispatch"
              icon="💡"
              title="TIPP"
              body="Tippe [↯], um den Output als Issue oder PR-Kommentar vorzubereiten."
              primaryLabel="↯ Zeig mir wie"
              primaryAction={() => {
                markGitHubGuideSeen();
                setActiveInlineGuide(null);
                pulseMessageAction(latestAssistantMessage.id, "github");
                openGitHubDispatchFromMessage(latestAssistantMessage);
              }}
              onDismiss={() => {
                markGitHubGuideSeen();
                setActiveInlineGuide(null);
              }}
              variant="github"
            />
          ) : null}

          {chatState.messages.map((message) => (
            <ThreadMessageCard
              key={message.id}
              message={message}
              expertMode={expertMode}
              operatorLabel={ui.chat.operatorInput}
              agentLabel={ui.chat.agentResponse}
              locale={locale}
              copyState={messageCopyState[message.id] ?? "idle"}
              highlightedAction={
                highlightedMessageAction?.messageId === message.id
                  ? highlightedMessageAction.action
                  : null
              }
              expandedActions={expandedActionMessageId === message.id}
              onToggleActions={(messageId) => {
                setExpandedActionMessageId((current) => current === messageId ? null : messageId);
              }}
              onGitHubAction={openGitHubDispatchFromMessage}
              onMatrixAction={openMatrixComposeFromMessage}
              onCopyAction={(nextMessage) => {
                void copyMessageContent(nextMessage);
              }}
            />
          ))}

          {draft?.started ? (
            <ShellCard variant="muted" className="thread-block thread-block-agent-draft">
              <header className="thread-block-header">
                <SectionLabel>{ui.chat.agentDraft}</SectionLabel>
                {expertMode ? <StatusBadge tone="partial">{draft.model ?? "pending"}</StatusBadge> : null}
              </header>
              <div className="streaming-work-block">
                <MarkdownMessage content={draft.text || ui.chat.composerLocked.approval} />
                <span className="streaming-cursor" aria-hidden="true">|</span>
              </div>
            </ShellCard>
          ) : null}

          {chatState.receipts.map((receipt) => (
            <ExecutionReceiptCard
              key={receipt.id}
              testId={`chat-receipt-${receipt.outcome}`}
              title={receipt.prompt}
              detail={receipt.detail}
              outcome={receipt.outcome}
              metadata={mergeMetadataRows(
                buildChatGovernanceRows({
                  modelAlias: receipt.modelAlias ?? null,
                  receiptSummary: receipt.outcome,
                }),
                [{ label: ui.sessionList.updated, value: formatTimestamp(locale, receipt.createdAt) }]
              )}
            >
              {hasRichTextContent(receipt.detail) ? (
                <MarkdownMessage content={receipt.detail} />
              ) : null}
            </ExecutionReceiptCard>
          ))}

          {notices.map((notice) => {
            const isErrorNotice = notice.level === "error";
            const errorReason = chatState.streamState.malformed
              ? (locale === "de" ? "Stream-Reihenfolge war nicht verifizierbar." : "Stream ordering was not verifiable.")
              : backendUnreachable
                ? ui.chat.composerLocked.backend
                : (locale === "de" ? "Backend meldete einen terminalen Stream-Fehler." : "Backend returned a terminal stream error.");

            return (
              <ShellCard
                key={notice.id}
                variant="muted"
                className={`thread-notice ${isErrorNotice ? "thread-notice-error" : "thread-notice-system"}`}
              >
                <header className="thread-block-header">
                  <SectionLabel>{isErrorNotice ? ui.chat.errorNotice : ui.chat.systemNotice}</SectionLabel>
                  <StatusBadge tone={isErrorNotice ? "error" : "partial"}>
                    {isErrorNotice ? ui.chat.noticeError : ui.chat.noticeSystem}
                  </StatusBadge>
                </header>
                {isErrorNotice ? (
                  <div className="mobile-error-block">
                    <div>
                      <span>{locale === "de" ? "Was passiert ist" : "What happened"}</span>
                      <strong>{notice.message}</strong>
                    </div>
                    <div>
                      <span>{locale === "de" ? "Warum" : "Why"}</span>
                      <strong>{errorReason}</strong>
                    </div>
                    <button
                      type="button"
                      className="mobile-error-action"
                      onClick={() => {
                        if (typeof window !== "undefined") {
                          window.location.assign("/console?mode=settings");
                        }
                      }}
                    >
                      {locale === "de" ? "Settings prüfen" : "Check settings"}
                    </button>
                  </div>
                ) : (
                  <p>{notice.message}</p>
                )}
              </ShellCard>
            );
          })}

          <div ref={messageEndRef} />
        </div>

        {branchSelectorOpen ? (
          <>
            <button
              type="button"
              className="chat-action-sheet-backdrop"
              aria-label={locale === "de" ? "Branch-Auswahl schließen" : "Close branch selector"}
              onClick={() => setBranchSelectorOpen(false)}
            />
            <section
              className="chat-action-sheet branch-selector-sheet"
              aria-label={locale === "de" ? "Branch für Read & Write auswählen" : "Select branch for Read & Write"}
              data-testid="chat-branch-selector"
            >
              <header className="chat-action-sheet-header">
                <SectionLabel>{locale === "de" ? "Branch erforderlich" : "Branch required"}</SectionLabel>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setBranchSelectorOpen(false)}
                >
                  {locale === "de" ? "Abbrechen" : "Cancel"}
                </button>
              </header>

              <div className="chat-action-sheet-body">
                <p className="muted-copy">
                  {locale === "de"
                    ? "Read & Write startet erst, wenn die Workbench eine Branch außerhalb von main gebunden hat."
                    : "Read & Write starts only after Workbench has a non-main branch bound."}
                </p>
                <div className="chat-action-sheet-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    onClick={() => {
                      setBranchSelectorOpen(false);
                      props.onCrossTabCommand({
                        type: "OpenWorkbenchWithDraft",
                        payload: {
                          sourceMessageId: "chat-rw-branch-selector",
                          content: chatState.input,
                          repo: props.workbenchBinding.repo ?? "",
                          branch: props.workbenchBinding.branch ?? undefined,
                          intent: "proposal",
                        },
                      });
                    }}
                  >
                    {locale === "de" ? "Workbench öffnen" : "Open Workbench"}
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {matrixComposeOpen ? (
          <>
            <button
              type="button"
              className="chat-action-sheet-backdrop"
              aria-label={locale === "de" ? "Matrix-Composer schließen" : "Close Matrix composer"}
              onClick={() => setMatrixComposeOpen(false)}
            />
            <section
              className="chat-action-sheet matrix-compose-sheet"
              aria-label={locale === "de" ? "Matrix-Compose" : "Matrix compose"}
            >
              <header className="chat-action-sheet-header">
                <SectionLabel>{locale === "de" ? "Matrix-Compose" : "Matrix compose"}</SectionLabel>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setMatrixComposeOpen(false)}
                >
                  {locale === "de" ? "Schließen" : "Close"}
                </button>
              </header>

              <div className="chat-action-sheet-body">
                <label htmlFor="matrix-compose-room">{locale === "de" ? "Raum" : "Room"}</label>
                <input
                  id="matrix-compose-room"
                  list="matrix-room-options"
                  value={matrixComposeRoomId}
                  onChange={(event) => setMatrixComposeRoomId(event.target.value)}
                  placeholder={locale === "de" ? "!room:matrix.example" : "!room:matrix.example"}
                />
                {matrixRoomOptions.length > 0 ? (
                  <datalist id="matrix-room-options">
                    {matrixRoomOptions.map((roomId) => (
                      <option key={roomId} value={roomId} />
                    ))}
                  </datalist>
                ) : null}

                <label htmlFor="matrix-compose-content">{locale === "de" ? "Inhalt" : "Content"}</label>
                <textarea
                  id="matrix-compose-content"
                  value={matrixComposeContent}
                  onChange={(event) => setMatrixComposeContent(event.target.value)}
                  rows={6}
                />

                <div className="chat-action-sheet-tags" role="group" aria-label={locale === "de" ? "Tags" : "Tags"}>
                  {MATRIX_DRAFT_TAGS.map((tag) => {
                    const active = matrixComposeTags.includes(tag);
                    return (
                      <button
                        key={tag}
                        type="button"
                        className={active ? "secondary-button chat-action-tag chat-action-tag-active" : "secondary-button chat-action-tag"}
                        onClick={() => toggleMatrixTag(tag)}
                        aria-pressed={active}
                      >
                        #{tag}
                      </button>
                    );
                  })}
                </div>

                <div className="chat-action-sheet-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={matrixComposeBlocked}
                    onClick={submitMatrixComposeDraft}
                  >
                    {locale === "de" ? "In Matrix übernehmen" : "Queue to Matrix"}
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        {githubDispatchOpen ? (
          <>
            <button
              type="button"
              className="chat-action-sheet-backdrop"
              aria-label={locale === "de" ? "GitHub-Dispatch schließen" : "Close GitHub dispatch"}
              onClick={() => setGithubDispatchOpen(false)}
            />
            <section
              className="chat-action-sheet github-dispatch-sheet"
              aria-label={locale === "de" ? "GitHub-Dispatch" : "GitHub dispatch"}
            >
              <header className="chat-action-sheet-header">
                <SectionLabel>{locale === "de" ? "GitHub-Dispatch" : "GitHub dispatch"}</SectionLabel>
                <button
                  type="button"
                  className="ghost-button"
                  onClick={() => setGithubDispatchOpen(false)}
                >
                  {locale === "de" ? "Schließen" : "Close"}
                </button>
              </header>
              <div className="chat-action-sheet-body">
                <p className="muted-copy">
                  {locale === "de"
                    ? "Auszug wird in den GitHub-Workspace übergeben und dort als lokaler Kontext geöffnet."
                    : "Excerpt is handed over to the GitHub workspace and opened there as local context."}
                </p>
                <div className="chat-action-sheet-preview">
                  <MarkdownMessage content={githubDispatchContent} />
                </div>
                <div className="chat-action-sheet-actions">
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={githubDispatchContent.trim().length === 0}
                    onClick={dispatchMessageToGitHub}
                  >
                    {locale === "de" ? "In GitHub öffnen" : "Open in GitHub"}
                  </button>
                </div>
              </div>
            </section>
          </>
        ) : null}

        <section className="chat-routing-status-strip" data-testid="chat-routing-status" aria-label={ui.chat.routingStatus.title}>
          {routingStatusItems.map((item) => (
            <div className={`chat-routing-status-item chat-routing-status-item-${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>

        {props.pinnedContext ? (
          <ShellCard variant="muted" className="chat-pinned-context" data-testid="chat-pinned-context">
            <header className="chat-pinned-context-header">
              <SectionLabel>{ui.chat.pinnedContext.title}</SectionLabel>
              <StatusBadge tone="partial">{ui.shell.workspaceTabs.workbench.label}</StatusBadge>
            </header>
            <p className="chat-pinned-context-summary">{props.pinnedContext.summary}</p>
            <p className="chat-pinned-context-meta">
              {`${props.pinnedContext.repoFullName} · ${props.pinnedContext.ref}${props.pinnedContext.path ? ` · ${props.pinnedContext.path}` : ""}`}
            </p>
            <div className="action-row">
              <span className="muted-copy">{ui.chat.pinnedContext.localState}</span>
              <button
                type="button"
                className="ghost-button"
                onClick={props.onClearPinnedContext}
                data-testid="chat-pinned-context-clear"
              >
                {ui.chat.pinnedContext.clear}
              </button>
            </div>
          </ShellCard>
        ) : null}

        <div className="mobile-chat-input-stack">
          {showCopyDiscoveryChip ? (
            <DiscoveryChip
              id="copy-guide"
              position="composer-above"
              autoDismissMs={5000}
              text="⎘ Kopiert · Auch als Matrix-Post: ⊛"
              onDismiss={() => {
                markCopyGuideSeen();
                setCopyDiscoveryPending(false);
              }}
            />
          ) : null}

              <ComposeZone
                value={chatState.input}
                placeholder={composerPlaceholder}
                disabled={Boolean(composerBlockReason) || readWriteGuardrailBlocked}
                submitDisabled={Boolean(composerBlockReason) || readWriteGuardrailBlocked || chatState.input.trim().length === 0}
                submitTooltip={submitTooltip}
                submitLabel={executionMode === "direct" ? ui.chat.sendDirect : ui.chat.prepareProposal}
                ariaLabel={ui.chat.title}
                textareaRef={composerRef}
                preInputSlot={(
                  <button
                    type="button"
                    className={executionMode === "direct" ? "secondary-button chat-input-mode-indicator" : "secondary-button chat-input-mode-indicator chat-input-mode-indicator-governed"}
                    onClick={() => {
                      if (executionRunning) {
                        return;
                      }

                      if (executionMode === "direct") {
                        if (!workbenchBranch) {
                          setBranchSelectorOpen(true);
                          return;
                        }
                        setExecutionMode("governed");
                        return;
                      }

                      setExecutionMode("direct");
                      dispatch({ type: "clear_pending_proposal" });
                    }}
                    title={locale === "de" ? "Modus wechseln" : "Toggle mode"}
                  >
                    {modeChipLabel}
                  </button>
                )}
                postInputSlot={(
                  <div className="chat-compose-inline-meta">
                    <span className={readWriteGuardrailBlocked ? "chat-branch-badge chat-branch-badge-readonly" : "chat-branch-badge chat-branch-badge-writable"}>
                      {branchBadgeLabel}
                    </span>
                    <button
                      type="button"
                      className="secondary-button chat-model-chip"
                      onClick={() => setModelPickerOpen((current) => !current)}
                      title={locale === "de" ? "Modell wählen" : "Pick model"}
                    >
                      {selectedModel || ui.common.na}
                    </button>
                    {modelPickerOpen ? (
                      <div className="chat-model-picker" role="listbox">
                        {modelOptions.map((model) => (
                          <button
                            key={model.alias}
                            type="button"
                            className={selectedModel === model.alias ? "chat-model-picker-item chat-model-picker-item-active" : "chat-model-picker-item"}
                            onClick={() => handleModelSelect(model.alias)}
                          >
                            {model.label}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </div>
                )}
                onChange={(input) => dispatch({ type: "set_input", input })}
                onKeyDown={(event) => {
                  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
                    event.preventDefault();
                    if (executionMode === "governed") {
                      const forcedPrompt = buildPinnedChatContextPrompt(chatState.input.trim(), props.pinnedContext, locale).trim();
                      if (forcedPrompt.length === 0) {
                        return;
                      }
                      void executeDirectPrompt(forcedPrompt);
                      return;
                    }
                    event.currentTarget.form?.requestSubmit();
                    return;
                  }

                  if (!shouldSubmitChatComposerOnKey(event)) {
                    return;
                  }

                  event.preventDefault();
                  event.currentTarget.form?.requestSubmit();
                }}
                onSubmit={handleSubmit}
              />

          <MobileChatTipRail locale={locale} />
        </div>
      </section>
    </section>
  );
}
