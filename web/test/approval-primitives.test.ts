import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  DecisionZone,
  ExecutionReceiptCard,
  ProposalCard,
} from "../src/components/ApprovalPrimitives.js";

test("shared approval primitives render custom labels and nested receipt content", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      ProposalCard,
      {
        title: "Proposal",
        summary: "Prepare a governed change",
        consequence: "Execution stays backend-owned",
        statusLabel: "Freigabe erforderlich",
        statusTone: "partial",
        metadata: [{ label: "Scope", value: "Repo" }],
      },
      React.createElement(DecisionZone, {
        approveLabel: "Freigeben",
        rejectLabel: "Ablehnen",
        onApprove: () => {
          // no-op
        },
        onReject: () => {
          // no-op
        },
        helperText: "Freigabe startet die Ausführung.",
      }),
    ),
  );

  assert.match(markup, /Freigabe erforderlich/);
  assert.match(markup, /Freigeben/);
  assert.match(markup, /Ablehnen/);
  assert.match(markup, /Freigabe startet die Ausführung\./);
});

test("execution receipts can render nested readback notes", () => {
  const markup = renderToStaticMarkup(
    React.createElement(
      ExecutionReceiptCard,
      {
        title: "Ausführungsbeleg",
        detail: "Der Backend-Readback hat einen Beleg erzeugt.",
        outcome: "executed",
        metadata: [{ label: "Status", value: "verified" }],
      },
      React.createElement("p", null, "Nested readback note"),
    ),
  );

  assert.match(markup, /Ausführungsbeleg/);
  assert.match(markup, /Nested readback note/);
  assert.match(markup, /verified/);
});
