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

test("chat reducer finalizes exactly one assistant draft on done", async () => {
  const events: Array<{ event: string; data: string }> = [];
  for await (const event of readSseEvents(
    encodeChunks([
      "event: start\ndata: {\"ok\":true,\"model\":\"default\"}\n\n",
      "event: token\ndata: {\"delta\":\"Hel\"}\n\n",
      "event: token\ndata: {\"delta\":\"lo\"}\n\n",
      "event: done\ndata: {\"ok\":true,\"model\":\"default\",\"text\":\"Hello\"}\n\n"
    ])
  )) {
    events.push(event);
  }

  assert.deepEqual(events.map((entry) => entry.event), ["start", "token", "token", "done"]);

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
  state = chatReducer(state, { type: "stream_token", delta: "Hel" });
  state = chatReducer(state, { type: "stream_token", delta: "lo" });
  state = chatReducer(state, { type: "stream_done", model: "default", text: "Hello" });

  assert.equal(state.connectionState, "completed");
  assert.equal(state.currentAssistantDraft, null);
  assert.equal(state.lastError, null);
  assert.equal(state.lastStreamWarning, null);
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
    modelAlias: "default"
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
