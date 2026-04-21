import assert from "node:assert/strict";
import test from "node:test";
import { readSseEvents } from "../src/lib/api.js";
import { chatReducer, createInitialChatState } from "../src/lib/chat-workflow.js";

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
