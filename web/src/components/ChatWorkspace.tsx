import React, { useEffect, useMemo, useReducer, useRef, useState, type FormEvent } from "react";
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

export function ChatWorkspace(props: ChatWorkspaceProps) {
  const { locale, copy: ui } = useLocalization();
  const beginnerMode = isBeginnerMode(props.workMode);
  const expertMode = isExpertMode(props.workMode);
  const workModeCopy = getWorkModeCopy(locale, props.workMode);
  const [chatState, dispatch] = useReducer(
    chatReducer,
    props.session.metadata.chatState,
    createInitialChatState,
  );
  const [selectedModel, setSelectedModel] = useState(
    props.session.metadata.selectedModelAlias ?? props.activeModelAlias ?? "",
  );
  const [executionMode, setExecutionMode] = useState<ChatExecutionMode>(
    props.session.metadata.executionMode
  );
  const abortRef = useRef<AbortController | null>(null);
  const malformedAbortRef = useRef(false);
  const messageEndRef = useRef<HTMLDivElement | null>(null);
  const scrollFrameRef = useRef<number | null>(null);
  const tokenBatcherRef = useRef<ReturnType<typeof createTokenBatcher> | null>(null);
  const modelOptions = props.modelRegistry.length > 0
    ? props.modelRegistry
    : props.availableModels.map((alias) => ({
        alias,
        label: alias,
        description: "",
        capabilities: [],
        tier: "core" as const,
        streaming: true,
        recommendedFor: [],
      }));

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

    props.onSessionChange(nextSession);
  }, [chatState, executionMode, props.onSessionChange, props.session.id, selectedModel]);

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

  function createProposal() {
    const trimmed = chatState.input.trim();

    if (!trimmed) {
      return;
    }

    dispatch({
      type: "create_proposal",
      proposal: buildGovernedChatProposal({
        prompt: trimmed,
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

    if (executionMode === "governed") {
      createProposal();
      return;
    }

    await executeDirectPrompt(trimmed);
  }

  const pendingProposal = chatState.pendingProposal;
  const warning = chatState.lastStreamWarning;
  const error = chatState.lastError;
  const draft = chatState.currentAssistantDraft;
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
                  setExecutionMode("governed");
                  props.onTelemetry("info", "Chat mode changed", "Governed execution mode enabled.");
                }}
              >
                {ui.chat.modeGoverned}
              </button>
            </div>
          </div>
          {expertMode ? (
          <div className="chat-toolbar-control-group chat-toolbar-model-group">
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
            <p>{locale === "de" ? "Schreibe dein Ziel. MosaicStack erstellt im geführten Modus zuerst einen Vorschlag, danach entscheidest du." : "Write the goal. In guided mode MosaicStack prepares a proposal first, then you decide."}</p>
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

        {executionMode === "governed" && pendingProposal?.status === "executing" ? (
          <ApprovalTransitionCard
            testId="chat-executing-card"
            title={ui.chat.executingTitle}
            detail={ui.chat.executingDetail(pendingProposal.modelAlias ?? ui.common.na)}
          />
        ) : null}

        <div className="governed-thread" aria-live="polite">
          {chatState.messages.length === 0 && chatState.receipts.length === 0 && !pendingProposal ? (
            <p className="empty-state" role="status">
              {executionMode === "direct" ? ui.chat.emptyStateDirect : ui.chat.emptyState}
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
                {expertMode && message.modelAlias ? <StatusBadge tone="muted">{message.modelAlias}</StatusBadge> : null}
              </header>
              <MarkdownMessage content={message.content} />
            </ShellCard>
          ))}

          {draft?.started ? (
            <ShellCard variant="muted" className="thread-block thread-block-agent-draft">
              <header className="thread-block-header">
                <SectionLabel>{ui.chat.agentDraft}</SectionLabel>
                {expertMode ? <StatusBadge tone="partial">{draft.model ?? "pending"}</StatusBadge> : null}
              </header>
              <MarkdownMessage content={draft.text || ui.chat.composerLocked.approval} />
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

        <section className="chat-routing-status-strip" data-testid="chat-routing-status" aria-label={ui.chat.routingStatus.title}>
          {routingStatusItems.map((item) => (
            <div className={`chat-routing-status-item chat-routing-status-item-${item.tone}`} key={item.label}>
              <span>{item.label}</span>
              <strong>{item.value}</strong>
            </div>
          ))}
        </section>

        <form className="composer governed-composer" onSubmit={handleSubmit}>
          <textarea
            data-testid="chat-composer"
            aria-label={ui.chat.title}
            value={chatState.input}
            onChange={(event) => dispatch({ type: "set_input", input: event.target.value })}
            onKeyDown={(event) => {
              if (!shouldSubmitChatComposerOnKey(event)) {
                return;
              }

              event.preventDefault();
              event.currentTarget.form?.requestSubmit();
            }}
            placeholder={ui.chat.composerPlaceholder}
            rows={4}
            disabled={Boolean(composerBlockReason)}
          />

          <div className="composer-footer">
            <button
              type="submit"
              data-testid="chat-send"
              disabled={Boolean(composerBlockReason) || chatState.input.trim().length === 0}
            >
              {executionMode === "direct" ? ui.chat.sendDirect : ui.chat.prepareProposal}
            </button>
          </div>
        </form>
      </section>
    </section>
  );
}
