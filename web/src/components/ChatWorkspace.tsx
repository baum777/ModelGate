import { useEffect, useReducer, useRef, useState, type FormEvent } from "react";
import { streamChatCompletion, type ChatRouteMetadata } from "../lib/api.js";
import {
  chatReducer,
  createInitialChatState,
  type ChatMessage,
  type ChatProposal,
  type ConnectionState
} from "../lib/chat-workflow.js";
import {
  deriveSessionStatus,
  deriveSessionTitle,
  type ChatSession
} from "../lib/workspace-state.js";
import { getConnectionStateLabel, useLocalization } from "../lib/localization.js";
import {
  ApprovalTransitionCard,
  DecisionZone,
  ExecutionReceiptCard,
  ProposalCard,
} from "./ApprovalPrimitives.js";
import { SectionLabel, ShellCard, StatusBadge } from "./ShellPrimitives.js";
import {
  BACKEND_TRUTH_UNAVAILABLE,
  buildGovernanceMetadataRows,
  mergeMetadataRows,
} from "../lib/governance-metadata.js";

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
  backendHealthy: boolean | null;
  activeModelAlias: string | null;
  availableModels: string[];
  modelRegistry: PublicModelEntry[];
  onActiveModelAliasChange: (alias: string) => void;
  onTelemetry: (kind: "info" | "warning" | "error", label: string, detail?: string) => void;
  onSessionChange: (session: ChatSession) => void;
};

function createId() {
  return crypto.randomUUID();
}

function formatRouteBadge(route: ChatRouteMetadata | null) {
  if (!route) {
    return "Route pending";
  }

  const markers: string[] = [];

  if (route.fallbackUsed) {
    markers.push("fallback");
  }

  if (route.degraded) {
    markers.push("degraded");
  }

  return markers.length > 0
    ? `${route.selectedAlias} · ${route.taskClass} · ${markers.join("/")}`
    : `${route.selectedAlias} · ${route.taskClass}`;
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

function buildProposalConsequence(locale: "en" | "de", modelAlias: string | null) {
  const alias = modelAlias ?? "selected public alias";
  return locale === "de"
    ? `Freigeben sendet diesen Prompt an den Backend-Alias ${alias}. Ein Backend-Ausführungsbeleg wird in dieser Session protokolliert.`
    : `Approve sends this prompt to backend alias ${alias}. A backend execution receipt will be recorded in this session.`;
}

function buildChatGovernanceRows(options: {
  modelAlias: string | null;
  receiptSummary?: string | null;
  routeSummary?: string | null;
}) {
  return mergeMetadataRows(
    buildGovernanceMetadataRows({
      actingIdentity: BACKEND_TRUTH_UNAVAILABLE,
      activeScope: "session-local chat thread (browser)",
      authorityDomain: "chat backend route (/chat)",
      targetScope: options.modelAlias ? `public alias ${options.modelAlias}` : "public alias unresolved",
      executionDomain: "backend SSE stream",
      executionTarget: options.modelAlias ? `public alias ${options.modelAlias}` : null,
      receiptSummary: options.receiptSummary ?? null,
    }),
    options.routeSummary
      ? [{ label: "Route", value: options.routeSummary }]
      : []
  );
}

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const { locale, copy: ui } = useLocalization();
  const [chatState, dispatch] = useReducer(
    chatReducer,
    props.session.metadata.chatState,
    createInitialChatState,
  );
  const [selectedModel, setSelectedModel] = useState(
    props.session.metadata.selectedModelAlias ?? props.activeModelAlias ?? "",
  );
  const abortRef = useRef<AbortController | null>(null);
  const malformedAbortRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const selectedModelEntry = props.modelRegistry.find((entry) => entry.alias === selectedModel) ?? null;

  useEffect(() => {
    if (props.activeModelAlias && props.activeModelAlias !== selectedModel) {
      setSelectedModel(props.activeModelAlias);
    }
  }, [props.activeModelAlias, selectedModel]);

  useEffect(() => {
    if (props.availableModels.length > 0 && !selectedModel) {
      const nextModel = props.availableModels[0];
      setSelectedModel(nextModel);
      props.onActiveModelAliasChange(nextModel);
    }
  }, [props.availableModels, props.onActiveModelAliasChange, selectedModel]);

  useEffect(() => {
    const nextSession: ChatSession = {
      ...props.session,
      title: deriveSessionTitle({
        ...props.session,
        metadata: {
          ...props.session.metadata,
          chatState,
          selectedModelAlias: selectedModel || null,
        },
      }),
      updatedAt: new Date().toISOString(),
      status: deriveSessionStatus({
        ...props.session,
        metadata: {
          ...props.session.metadata,
          chatState,
          selectedModelAlias: selectedModel || null,
        },
      }),
      resumable: true,
      metadata: {
        ...props.session.metadata,
        chatState,
        selectedModelAlias: selectedModel || null,
      },
    };

    props.onSessionChange(nextSession);
  }, [chatState, props.onSessionChange, props.session.id, selectedModel]);

  useEffect(() => {
    messageEndRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [chatState.messages, chatState.pendingProposal, chatState.receipts, chatState.notices, chatState.currentAssistantDraft]);

  function stopExecution() {
    abortRef.current?.abort();
  }

  function createProposal() {
    const trimmed = chatState.input.trim();

    if (!trimmed) {
      return;
    }

    dispatch({
      type: "create_proposal",
      proposal: {
        id: createId(),
        prompt: trimmed,
        modelAlias: selectedModel || null,
        consequence: buildProposalConsequence(locale, selectedModel || null),
        createdAt: new Date().toISOString(),
        status: "pending"
      }
    });
    props.onTelemetry("info", "Chat proposal created", "Awaiting operator approval before backend execution.");
  }

  async function executeProposal(proposal: ChatProposal) {
    const userMessage: ChatMessage = {
      id: createId(),
      role: "user",
      content: proposal.prompt,
      createdAt: new Date().toISOString()
    };

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

    const outboundMessages = [...chatState.messages, userMessage].map(({ role, content }) => ({ role, content }));

    try {
      await streamChatCompletion(
        {
          modelAlias: proposal.modelAlias ?? selectedModel ?? undefined,
          model: proposal.modelAlias ?? selectedModel ?? undefined,
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
            dispatch({
              type: "stream_token",
              delta
            });
          },
          onDone: (payload) => {
            dispatch({
              type: "stream_done",
              model: payload.model,
              text: payload.text,
              route: payload.route
            });
            props.onTelemetry("info", "Chat execution completed", `Execution finalized via alias ${payload.model}.`);
          },
          onError: (message) => {
            dispatch({
              type: "stream_error",
              message
            });
            props.onTelemetry("error", "Chat execution failed", message);
          },
          onMalformed: (message) => {
            malformedAbortRef.current = true;
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
        dispatch({
          type: "stream_error",
          message: "Execution cancelled by operator."
        });
        props.onTelemetry("warning", "Chat execution cancelled", "Active execution was aborted by the operator.");
        return;
      }

      const message = error instanceof Error ? error.message : "Streaming request failed";
      dispatch({
        type: "stream_error",
        message
      });
      props.onTelemetry("error", "Chat request failed", message);
    } finally {
      abortRef.current = null;
    }
  }

  function rejectProposal() {
    dispatch({
      type: "reject_proposal"
    });
    props.onTelemetry("info", "Chat proposal rejected", "Operator rejected proposal before backend execution.");
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    createProposal();
  }

  const pendingProposal = chatState.pendingProposal;
  const warning = chatState.lastStreamWarning;
  const error = chatState.lastError;
  const draft = chatState.currentAssistantDraft;
  const latestRoute = chatState.activeRoute;

  const awaitingApproval = pendingProposal?.status === "pending";
  const executionRunning =
    pendingProposal?.status === "executing"
    || chatState.connectionState === "submitting"
    || chatState.connectionState === "streaming";
  const modelUnresolved = selectedModel.trim().length === 0;
  const backendUnreachable = props.backendHealthy === false;

  const composerBlockReason = backendUnreachable
    ? ui.chat.composerLocked.backend
    : modelUnresolved
      ? ui.chat.composerLocked.model
      : awaitingApproval
        ? ui.chat.composerLocked.approval
        : executionRunning
          ? ui.chat.composerLocked.execution
          : null;

  const notices = [
    ...chatState.notices,
    ...(warning && !chatState.notices.some((notice) => notice.message === warning)
      ? [{ id: `warning-${warning}`, level: "system" as const, message: warning, createdAt: new Date().toISOString() }]
      : []),
    ...(error && !chatState.notices.some((notice) => notice.message === error)
      ? [{ id: `error-${error}`, level: "error" as const, message: error, createdAt: new Date().toISOString() }]
      : [])
  ];

  return (
    <section
      className="workspace-panel chat-workspace governed-chat-workspace"
      data-testid="chat-workspace"
      aria-busy={executionRunning}
    >
      <section className="workspace-hero chat-hero">
        <div>
          <h1>{ui.chat.title}</h1>
          <p className="hero-copy">{ui.chat.intro}</p>
          <p className="workspace-session-title">{props.session.title}</p>
        </div>

        <aside className="mini-panel">
          <label htmlFor="model-select">{ui.chat.modelSelectLabel}</label>
          <select
            id="model-select"
            value={selectedModel}
            onChange={(event) => {
              const nextModel = event.target.value;
              setSelectedModel(nextModel);
              props.onActiveModelAliasChange(nextModel);
              props.onTelemetry("info", "Model alias changed", `Selected public alias ${nextModel || "unresolved"}.`);
            }}
            disabled={props.availableModels.length === 0 || Boolean(pendingProposal)}
          >
            {props.availableModels.length === 0 ? (
              <option value="">{ui.chat.noModels}</option>
            ) : (
              props.availableModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))
            )}
          </select>
          <p>{ui.chat.onlyPublicAlias}</p>
          {selectedModelEntry ? (
            <p className="hint">{selectedModelEntry.label}: {selectedModelEntry.description}</p>
          ) : (
            <p className="hint">{ui.chat.modelHintFallback}</p>
          )}
        </aside>
      </section>

      <section className="chat-card governed-chat-card">
        <header className="chat-runtime-bar governed-chat-runtime">
          <div className="runtime-stack">
            <SectionLabel>{ui.chat.conversationState}</SectionLabel>
            <strong data-testid="chat-connection-state">{getConnectionStateLabel(locale, chatState.connectionState)}</strong>
            <span className="runtime-note">{formatRouteBadge(latestRoute)}</span>
          </div>
          <div className="runtime-actions">
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
        </header>

        {pendingProposal?.status === "pending" ? (
          <ProposalCard
            testId="chat-proposal-card"
            title={ui.chat.proposalTitle}
            summary={pendingProposal.prompt}
            consequence={pendingProposal.consequence}
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
              helperText={ui.chat.proposalHelper}
            />
          </ProposalCard>
        ) : null}

        {pendingProposal?.status === "executing" ? (
          <ApprovalTransitionCard
            testId="chat-executing-card"
            title={ui.chat.executingTitle}
            detail={ui.chat.executingDetail(pendingProposal.modelAlias ?? ui.common.na)}
          />
        ) : null}

        <div className="governed-thread" aria-live="polite">
          {chatState.messages.length === 0 && chatState.receipts.length === 0 && !pendingProposal ? (
            <p className="empty-state" role="status">
              {ui.chat.emptyState}
            </p>
          ) : null}

          {chatState.messages.map((message) => (
            <ShellCard
              key={message.id}
              variant={message.role === "user" ? "muted" : "base"}
              className={`thread-block ${message.role === "user" ? "thread-block-operator" : "thread-block-agent"}`}
            >
              <header className="thread-block-header">
                <SectionLabel>{message.role === "user" ? ui.chat.operatorInput : ui.chat.agentResponse}</SectionLabel>
                {message.modelAlias ? <StatusBadge tone="muted">{message.modelAlias}</StatusBadge> : null}
              </header>
              <p>{message.content}</p>
              {message.route ? <p className="shell-muted-copy">{formatRouteBadge(message.route)}</p> : null}
            </ShellCard>
          ))}

          {draft?.started ? (
            <ShellCard variant="muted" className="thread-block thread-block-agent-draft">
              <header className="thread-block-header">
                <SectionLabel>{ui.chat.agentDraft}</SectionLabel>
                <StatusBadge tone="partial">{draft.model ?? "pending"}</StatusBadge>
              </header>
              <p>{draft.text || ui.chat.composerLocked.approval}</p>
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
                  routeSummary: receipt.route ? formatRouteBadge(receipt.route) : null,
                }),
                [{ label: ui.sessionList.updated, value: formatTimestamp(locale, receipt.createdAt) }]
              )}
            />
          ))}

          {notices.map((notice) => (
            <ShellCard
              key={notice.id}
              variant="muted"
              className={`thread-notice ${notice.level === "error" ? "thread-notice-error" : "thread-notice-system"}`}
            >
              <header className="thread-block-header">
                <SectionLabel>{notice.level === "error" ? ui.chat.errorNotice : ui.chat.systemNotice}</SectionLabel>
                <StatusBadge tone={notice.level === "error" ? "error" : "partial"}>
                  {notice.level === "error" ? ui.chat.noticeError : ui.chat.noticeSystem}
                </StatusBadge>
              </header>
              <p>{notice.message}</p>
            </ShellCard>
          ))}

          <div ref={messageEndRef} />
        </div>

        <form className="composer governed-composer" onSubmit={handleSubmit}>
          <textarea
            data-testid="chat-composer"
            aria-label={ui.chat.title}
            value={chatState.input}
            onChange={(event) => dispatch({ type: "set_input", input: event.target.value })}
            placeholder={ui.chat.composerPlaceholder}
            rows={4}
            disabled={Boolean(composerBlockReason)}
          />

          <div className="composer-footer">
            <p className="hint">
              {composerBlockReason ?? ui.chat.composerHelper}
            </p>
            <button
              type="submit"
              data-testid="chat-send"
              disabled={Boolean(composerBlockReason) || chatState.input.trim().length === 0}
            >
              {ui.chat.prepareProposal}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
