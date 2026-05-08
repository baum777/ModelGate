import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { readSseEvents, streamChatCompletion } from "../src/lib/api.js";
import { getWorkspaceGuide } from "../src/components/GuideOverlay.js";
import {
  buildChatRoutingStatusItems,
  resolveChatComposerBlockReason,
  resolveChatScrollBehavior,
  resolveChatStreamStatusLabel,
  shouldSubmitChatComposerOnKey
} from "../src/components/ChatWorkspace.js";
import {
  buildGovernedChatProposal,
  chatReducer,
  createTokenBatcher,
  createInitialChatState,
  normalizeChatExecutionMode,
  runDirectChatStream
} from "../src/lib/chat-workflow.js";

function encodeChunks(chunks: string[]) {
  const encoder = new TextEncoder();
  return new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }
      controller.close();
    }
  });
}

function createSseResponse(chunks: string[], options?: { keepOpen?: boolean; signal?: AbortSignal }) {
  const encoder = new TextEncoder();
  const keepOpen = options?.keepOpen ?? false;

  return new Response(new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) {
        controller.enqueue(encoder.encode(chunk));
      }

      if (keepOpen) {
        options?.signal?.addEventListener("abort", () => {
          controller.error(new DOMException("Aborted", "AbortError"));
        }, { once: true });
        return;
      }

      controller.close();
    }
  }), {
    status: 200,
    headers: {
      "content-type": "text/event-stream; charset=utf-8"
    }
  });
}

test("chat composer submits on Enter and preserves Shift+Enter for multiline input", () => {
  assert.equal(shouldSubmitChatComposerOnKey({ key: "Enter", shiftKey: false, isComposing: false }), true);
  assert.equal(shouldSubmitChatComposerOnKey({ key: "Enter", shiftKey: true, isComposing: false }), false);
  assert.equal(shouldSubmitChatComposerOnKey({ key: "Enter", shiftKey: false, isComposing: true }), false);
  assert.equal(shouldSubmitChatComposerOnKey({ key: "a", shiftKey: false, isComposing: false }), false);
});

test("chat guide covers visible interactive chat features", () => {
  const guide = getWorkspaceGuide("de", "chat");
  const guideText = guide.cards
    .flatMap((card) => [card.eyebrow, card.title, card.body, ...card.points])
    .join("\n");

  assert.match(guideText, /Basis/);
  assert.match(guideText, /Expert/);
  assert.match(guideText, /Diagnostik/);
  assert.match(guideText, /Enter/);
  assert.match(guideText, /Shift\+Enter/);
  assert.match(guideText, /Ausführungsmodus/);
  assert.match(guideText, /Modellalias/);
  assert.match(guideText, /Freigabe/);
});

test("all workspace guides provide detailed operational walkthroughs in both locales", () => {
  const guideKeys = ["chat", "github", "matrix", "review", "settings"] as const;

  for (const locale of ["en", "de"] as const) {
    for (const key of guideKeys) {
      const guide = getWorkspaceGuide(locale, key);
      const guideText = guide.cards
        .flatMap((card) => [card.eyebrow, card.title, card.body, ...card.points])
        .join("\n");

      assert.ok(guide.cards.length >= 6, `${locale}/${key} should have at least six guide cards`);
      assert.ok(
        guide.cards.every((card) => card.points.length >= 4),
        `${locale}/${key} guide cards should include detailed point lists`,
      );
      assert.match(guideText, locale === "de" ? /Backend|backend|Freigabe|Diagnostik|Status/ : /Backend|backend|approval|diagnostics|status/i);
    }
  }
});

test("chat visual review styles expose active mode color and subtle hidden guide scrolling", () => {
  const styles = readFileSync("web/src/styles.css", "utf8");

  assert.match(styles, /\.chat-toolbar-controls\s+\.mode-toggle-button-active/);
  assert.match(styles, /\.chat-toolbar-controls\s+\.mode-toggle-button-active[\s\S]*linear-gradient/);
  assert.match(styles, /\.guide-card[\s\S]*overflow-y:\s*auto/);
  assert.match(styles, /\.guide-card[\s\S]*scrollbar-width:\s*none/);
  assert.match(styles, /\.guide-card::-webkit-scrollbar[\s\S]*display:\s*none/);
});

test("console shell styles hide native scrollbars and clip page-level horizontal overflow", () => {
  const styles = readFileSync("web/src/styles.css", "utf8");

  assert.match(styles, /scrollbar-width:\s*none/);
  assert.match(styles, /::-webkit-scrollbar[\s\S]*display:\s*none/);
  assert.match(styles, /html,\s*body,\s*#root[\s\S]*overflow-x:\s*hidden/);
  assert.match(styles, /\.app-shell-console[\s\S]*max-width:\s*100vw/);
});

test("chat reducer finalizes exactly one assistant draft on done with route metadata", async () => {
  const events: Array<{ event: string; data: string }> = [];
  for await (const event of readSseEvents(
    encodeChunks([
      "event: start\ndata: {\"ok\":true,\"model\":\"default\"}\n\n",
      "event: route\ndata: {\"ok\":true,\"route\":{\"selectedAlias\":\"default\",\"taskClass\":\"dialog\",\"fallbackUsed\":false,\"degraded\":false,\"streaming\":true}}\n\n",
      "event: token\ndata: {\"delta\":\"Hel\"}\n\n",
      "event: token\ndata: {\"delta\":\"lo\"}\n\n",
      "event: done\ndata: {\"ok\":true,\"model\":\"default\",\"text\":\"Hello\",\"route\":{\"selectedAlias\":\"default\",\"taskClass\":\"dialog\",\"fallbackUsed\":false,\"degraded\":false,\"streaming\":true}}\n\n"
    ])
  )) {
    events.push(event);
  }

  assert.deepEqual(events.map((entry) => entry.event), ["start", "route", "token", "token", "done"]);

  let state = createInitialChatState();
  state = chatReducer(state, {
    type: "submit_message",
    message: {
      id: "user-1",
      role: "user",
      content: "Hello"
    }
  });
  state = chatReducer(state, { type: "stream_start", model: "default" });
  state = chatReducer(state, {
    type: "stream_route",
    route: {
      selectedAlias: "default",
      taskClass: "dialog",
      fallbackUsed: false,
      degraded: false,
      streaming: true
    }
  });
  state = chatReducer(state, { type: "stream_token", delta: "Hel" });
  state = chatReducer(state, { type: "stream_token", delta: "lo" });
  state = chatReducer(state, {
    type: "stream_done",
    model: "default",
    text: "Hello",
    route: {
      selectedAlias: "default",
      taskClass: "dialog",
      fallbackUsed: false,
      degraded: false,
      streaming: true
    }
  });

  assert.equal(state.connectionState, "completed");
  assert.equal(state.currentAssistantDraft, null);
  assert.equal(state.lastError, null);
  assert.equal(state.lastStreamWarning, null);
  assert.equal(state.activeRoute?.selectedAlias, "default");
  assert.equal(state.messages.length, 2);
  assert.deepEqual(state.messages[0], {
    id: "user-1",
    role: "user",
    content: "Hello"
  });
  assert.deepEqual(state.messages[1], {
    id: "assistant-2",
    role: "assistant",
    content: "Hello",
    modelAlias: "default",
    route: {
      selectedAlias: "default",
      taskClass: "dialog",
      fallbackUsed: false,
      degraded: false,
      streaming: true
    }
  });
});

test("chat reducer surfaces malformed stream ordering", () => {
  let state = createInitialChatState();
  state = chatReducer(state, {
    type: "submit_message",
    message: {
      id: "user-1",
      role: "user",
      content: "Hello"
    }
  });
  state = chatReducer(state, { type: "stream_token", delta: "Hel" });

  assert.equal(state.connectionState, "error");
  assert.equal(state.currentAssistantDraft, null);
  assert.equal(state.lastStreamWarning, "Received token before stream start.");
  assert.equal(state.messages.length, 1);
});

test("stream chat marks missing terminal frames as malformed", async () => {
  const originalFetch = globalThis.fetch;
  const tokens: string[] = [];
  const malformed: string[] = [];

  globalThis.fetch = async () => createSseResponse([
    "event: start\ndata: {\"ok\":true,\"model\":\"default\"}\n\n",
    "event: token\ndata: {\"delta\":\"Partial\"}\n\n"
  ]);

  try {
    await streamChatCompletion(
      {
        modelAlias: "default",
        messages: [{ role: "user", content: "hello" }]
      },
      {
        onToken: (delta) => tokens.push(delta),
        onMalformed: (message) => malformed.push(message)
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
  }

  assert.deepEqual(tokens, ["Partial"]);
  assert.deepEqual(malformed, ["Stream ended without a terminal frame."]);
});

test("stream chat times out with explicit malformed feedback", async () => {
  const originalFetch = globalThis.fetch;
  const originalSetTimeout = globalThis.setTimeout;
  const malformed: string[] = [];
  const tokens: string[] = [];

  globalThis.setTimeout = ((handler: Parameters<typeof setTimeout>[0], timeout?: Parameters<typeof setTimeout>[1], ...args: unknown[]) =>
    originalSetTimeout(handler, Math.min(typeof timeout === "number" ? timeout : 0, 5), ...args)
  ) as typeof setTimeout;

  globalThis.fetch = async (_input, init) => createSseResponse(
    [
      "event: start\ndata: {\"ok\":true,\"model\":\"default\"}\n\n",
      "event: token\ndata: {\"delta\":\"Hel\"}\n\n"
    ],
    {
      keepOpen: true,
      signal: init?.signal as AbortSignal | undefined
    }
  );

  try {
    await streamChatCompletion(
      {
        modelAlias: "default",
        messages: [{ role: "user", content: "hello" }]
      },
      {
        onToken: (delta) => tokens.push(delta),
        onMalformed: (message) => malformed.push(message)
      }
    );
  } finally {
    globalThis.fetch = originalFetch;
    globalThis.setTimeout = originalSetTimeout;
  }

  assert.deepEqual(tokens, ["Hel"]);
  assert.deepEqual(malformed, ["Stream timed out before terminal frame. Partial output was preserved."]);
});

test("chat reducer records rejected proposal receipts", () => {
  let state = createInitialChatState({
    input: "Prepare rollout checklist"
  });

  state = chatReducer(state, {
    type: "create_proposal",
    proposal: {
      id: "proposal-1",
      prompt: "Prepare rollout checklist",
      modelAlias: "default",
      consequence: "Approve sends prompt to backend.",
      createdAt: "2026-04-21T08:00:00.000Z",
      status: "pending"
    }
  });
  state = chatReducer(state, {
    type: "reject_proposal"
  });

  assert.equal(state.pendingProposal, null);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0]?.outcome, "rejected");
  assert.equal(state.receipts[0]?.proposalId, "proposal-1");
});

test("chat reducer records executed receipt for approved proposal", () => {
  let state = createInitialChatState();
  state = chatReducer(state, {
    type: "create_proposal",
    proposal: {
      id: "proposal-2",
      prompt: "Summarize current deployment risk",
      modelAlias: "default",
      consequence: "Approve sends prompt to backend.",
      createdAt: "2026-04-21T09:00:00.000Z",
      status: "pending"
    }
  });
  state = chatReducer(state, {
    type: "start_proposal_execution"
  });
  state = chatReducer(state, {
    type: "submit_message",
    message: {
      id: "user-1",
      role: "user",
      content: "Summarize current deployment risk"
    }
  });
  state = chatReducer(state, { type: "stream_start", model: "default" });
  state = chatReducer(state, {
    type: "stream_done",
    model: "default",
    text: "Risk summary",
    route: {
      selectedAlias: "default",
      taskClass: "analysis",
      fallbackUsed: false,
      degraded: false,
      streaming: true
    }
  });

  assert.equal(state.pendingProposal, null);
  assert.equal(state.receipts.length, 1);
  assert.equal(state.receipts[0]?.outcome, "executed");
  assert.equal(state.messages.length, 2);
});

test("chat reducer clears pending proposal without creating a receipt", () => {
  let state = createInitialChatState();
  state = chatReducer(state, {
    type: "create_proposal",
    proposal: {
      id: "proposal-clear",
      prompt: "Clear me",
      modelAlias: "default",
      consequence: "Approval required",
      createdAt: "2026-04-24T10:00:00.000Z",
      status: "pending"
    }
  });

  state = chatReducer(state, {
    type: "clear_pending_proposal"
  });

  assert.equal(state.pendingProposal, null);
  assert.equal(state.receipts.length, 0);
});

test("chat execution mode normalizes and governed proposals remain explicit", () => {
  assert.equal(normalizeChatExecutionMode("direct"), "direct");
  assert.equal(normalizeChatExecutionMode("governed"), "governed");
  assert.equal(normalizeChatExecutionMode("unexpected"), "direct");

  const proposal = buildGovernedChatProposal({
    prompt: "Prepare governed step",
    modelAlias: "default",
    consequence: "Approval required",
    createdAt: "2026-04-24T10:00:00.000Z",
    createId: () => "proposal-governed"
  });

  assert.deepEqual(proposal, {
    id: "proposal-governed",
    prompt: "Prepare governed step",
    modelAlias: "default",
    consequence: "Approval required",
    createdAt: "2026-04-24T10:00:00.000Z",
    status: "pending"
  });
});

test("direct mode streams through /chat path without creating a proposal", async () => {
  let streamCalls = 0;
  await runDirectChatStream({
    prompt: "Hello direct",
    modelAlias: "default",
    messages: [],
    stream: async (body, handlers) => {
      streamCalls += 1;
      assert.equal(body.modelAlias, "default");
      assert.equal("model" in body, false);
      assert.deepEqual(body.messages, [
        {
          role: "user",
          content: "Hello direct"
        }
      ]);
      handlers.onStart?.({
        ok: true,
        model: "default"
      });
      handlers.onRoute?.({
        ok: true,
        route: {
          selectedAlias: "default",
          taskClass: "dialog",
          fallbackUsed: false,
          degraded: false,
          streaming: true
        }
      });
      handlers.onDone?.({
        ok: true,
        model: "default",
        text: "Hello",
        route: {
          selectedAlias: "default",
          taskClass: "dialog",
          fallbackUsed: false,
          degraded: false,
          streaming: true
        }
      });
    },
    handlers: {}
  });

  assert.equal(streamCalls, 1);
});

test("composer blocking differs between direct and governed modes", () => {
  const copy = {
    backend: "backend",
    model: "model",
    approval: "approval",
    execution: "execution"
  };

  assert.equal(resolveChatComposerBlockReason({
    executionMode: "direct",
    backendUnreachable: false,
    modelUnresolved: false,
    awaitingApproval: true,
    executionRunning: false,
    copy
  }), null);

  assert.equal(resolveChatComposerBlockReason({
    executionMode: "governed",
    backendUnreachable: false,
    modelUnresolved: false,
    awaitingApproval: true,
    executionRunning: false,
    copy
  }), "approval");

  assert.equal(resolveChatComposerBlockReason({
    executionMode: "direct",
    backendUnreachable: true,
    modelUnresolved: false,
    awaitingApproval: false,
    executionRunning: false,
    copy
  }), "backend");

  assert.equal(resolveChatComposerBlockReason({
    executionMode: "direct",
    backendUnreachable: false,
    modelUnresolved: true,
    awaitingApproval: false,
    executionRunning: false,
    copy
  }), "model");

  assert.equal(resolveChatComposerBlockReason({
    executionMode: "direct",
    backendUnreachable: false,
    modelUnresolved: false,
    awaitingApproval: false,
    executionRunning: true,
    copy
  }), "execution");
});

test("token batcher preserves exact final text and coalesces scheduled updates", () => {
  const callbacks: Array<() => void> = [];
  const flushed: string[] = [];
  const batcher = createTokenBatcher({
    onFlush: (delta) => {
      flushed.push(delta);
    },
    schedule: (callback) => {
      callbacks.push(callback);
      return callbacks.length;
    },
    cancel: () => {
      // no-op for deterministic test scheduler
    }
  });

  batcher.push("Hel");
  batcher.push("lo");
  batcher.push(" ");
  batcher.push("world");
  assert.equal(callbacks.length, 1);
  assert.deepEqual(flushed, []);

  callbacks[0]?.();
  assert.deepEqual(flushed, ["Hello world"]);

  batcher.push("!");
  batcher.flush();
  assert.deepEqual(flushed, ["Hello world", "!"]);
});

test("chat reducer marks cancelled streams distinctly", () => {
  let state = createInitialChatState();
  state = chatReducer(state, {
    type: "submit_message",
    message: {
      id: "user-1",
      role: "user",
      content: "Cancel me"
    }
  });
  state = chatReducer(state, { type: "stream_start", model: "default" });
  state = chatReducer(state, {
    type: "stream_error",
    message: "Execution cancelled by operator."
  });
  state = chatReducer(state, {
    type: "mark_stream_cancelled"
  });

  assert.equal(state.streamState.cancelled, true);
  assert.equal(state.streamState.terminalKind, "error");
});

test("scroll behavior avoids smooth scrolling while streaming", () => {
  assert.equal(resolveChatScrollBehavior("submitting"), "auto");
  assert.equal(resolveChatScrollBehavior("streaming"), "auto");
  assert.equal(resolveChatScrollBehavior("completed"), "smooth");
});

test("stream status helper prefers malformed and cancelled over base connection status", () => {
  const copy = {
    ready: "ready",
    streaming: "streaming",
    interrupted: "interrupted",
    cancelled: "cancelled",
    unverifiable: "unverifiable"
  };

  assert.equal(resolveChatStreamStatusLabel({
    streamState: {
      interrupted: false,
      cancelled: false,
      malformed: false
    },
    connectionState: "streaming",
    copy
  }), "streaming");

  assert.equal(resolveChatStreamStatusLabel({
    streamState: {
      interrupted: true,
      cancelled: false,
      malformed: false
    },
    connectionState: "error",
    copy
  }), "interrupted");

  assert.equal(resolveChatStreamStatusLabel({
    streamState: {
      interrupted: true,
      cancelled: true,
      malformed: false
    },
    connectionState: "error",
    copy
  }), "cancelled");

  assert.equal(resolveChatStreamStatusLabel({
    streamState: {
      interrupted: false,
      cancelled: false,
      malformed: true
    },
    connectionState: "error",
    copy
  }), "unverifiable");
});

test("chat routing status summarizes alias, backend, fallback policy, and route metadata without provider targets", () => {
  const items = buildChatRoutingStatusItems({
    selectedModel: "default",
    backendHealthy: true,
    fallbackAllowed: true,
    activeRoute: {
      selectedAlias: "default",
      taskClass: "dialog",
      fallbackUsed: true,
      degraded: true,
      streaming: true,
    },
    copy: {
      activeModel: "Active model",
      providerStatus: "Provider status",
      fallbackPolicy: "Fallback policy",
      routeState: "Route state",
      ready: "Ready",
      checking: "Checking",
      error: "Error",
      fallbackEnabled: "Fallback enabled",
      fallbackDisabled: "Fallback disabled",
      fallbackUsed: "Fallback used",
      degraded: "degraded",
      routePending: "Route pending",
      unavailable: "Unavailable",
    },
  });

  assert.deepEqual(items, [
    { label: "Active model", value: "default", tone: "ready" },
    { label: "Provider status", value: "Ready", tone: "ready" },
    { label: "Fallback policy", value: "Fallback enabled", tone: "partial" },
    { label: "Route state", value: "Fallback used · degraded", tone: "partial" },
  ]);
  assert.equal(items.some((item) => item.value.includes("openrouter")), false);
});
