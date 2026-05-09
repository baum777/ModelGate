import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createMockMatrixKnowledge, MatrixPage } from "../src/pages/MatrixPage.js";
import { KnowledgeMap } from "../src/components/matrix/KnowledgeMap.js";
import { ProvenancePanel } from "../src/components/matrix/ProvenancePanel.js";
import { TopicCard } from "../src/components/matrix/TopicCard.js";
import { MatrixSkeleton } from "../src/components/matrix/Skeletons/MatrixSkeleton.js";

test("mobile Matrix page renders a bounded knowledge surface without credentials", () => {
  const markup = renderToStaticMarkup(
    React.createElement(MatrixPage, {
      locale: "en",
      initialKnowledge: createMockMatrixKnowledge(),
    }),
  );

  assert.match(markup, /Matrix Knowledge/);
  assert.match(markup, /Ask about this room/);
  assert.match(markup, /Backend-owned/);
  assert.match(markup, /Architecture Decisions/);
  assert.match(markup, /Scope snapshot/);
  assert.match(markup, /aria-label="Matrix mobile knowledge surface"/);
  assert.doesNotMatch(markup, /access_token|MATRIX_ACCESS_TOKEN|access token/i);
});

test("knowledge map exposes selected room state and topic counts", () => {
  const knowledge = createMockMatrixKnowledge();
  const markup = renderToStaticMarkup(
    React.createElement(KnowledgeMap, {
      rooms: knowledge.rooms,
      selectedRoomId: knowledge.rooms[0]?.id ?? "",
      onSelect: () => undefined,
    }),
  );

  assert.match(markup, /role="list"/);
  assert.match(markup, /aria-pressed="true"/);
  assert.match(markup, /Architecture Decisions/);
  assert.match(markup, /3 topics/);
});

test("topic card renders contract posture and last update metadata", () => {
  const topic = createMockMatrixKnowledge().rooms[0]?.topics[0];
  assert.ok(topic);

  const markup = renderToStaticMarkup(React.createElement(TopicCard, { topic }));

  assert.match(markup, /Contract-only/);
  assert.match(markup, /Approval-gated execution/);
  assert.match(markup, /Updated/);
});

test("provenance panel renders fail-closed backend ownership", () => {
  const knowledge = createMockMatrixKnowledge();
  const markup = renderToStaticMarkup(
    React.createElement(ProvenancePanel, {
      provenance: knowledge.provenance,
      selectedRoom: knowledge.rooms[0],
    }),
  );

  assert.match(markup, /Provenance/);
  assert.match(markup, /fail-closed/);
  assert.match(markup, /backend owns Matrix credentials/i);
});

test("Matrix skeleton has semantic loading status", () => {
  const markup = renderToStaticMarkup(React.createElement(MatrixSkeleton));

  assert.match(markup, /role="status"/);
  assert.match(markup, /aria-label="Loading Matrix knowledge surface"/);
});

test("mobile Matrix surface stays out of the synchronous App import path", () => {
  const appSource = readFileSync("web/src/App.tsx", "utf8");
  const topLevelImports = appSource
    .split("\n")
    .filter((line) => line.startsWith("import "));

  assert.ok(
    topLevelImports.every((line) => !line.includes("./pages/MatrixPage")),
    "MatrixPage must remain a lazy mobile route, not a top-level App import",
  );
  assert.match(appSource, /const loadMobileMatrixPage = async \(\) =>/);
  assert.match(appSource, /import\("\.\/pages\/MatrixPage\.js"\)/);
  assert.match(appSource, /link\.href = "\/matrix-mobile\.css"/);
  assert.match(appSource, /isMobileViewport && mode === "matrix"/);
});
