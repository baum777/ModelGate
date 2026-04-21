import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import {
  describeReviewNextStep,
  prioritizeReviewItems,
  ReviewWorkspace,
  type ReviewItem,
} from "../src/components/ReviewWorkspace.js";
import { LocaleProvider } from "../src/lib/localization.js";

test("Review workspace prioritizes stale items and exposes a canonical queue", () => {
  const items: ReviewItem[] = [
    {
      id: "executed-1",
      source: "github",
      title: "Executed GitHub plan",
      summary: "Receipt available",
      status: "executed",
      sourceLabel: "GitHub Workspace",
      provenanceRows: [
        { label: "Repository", value: "acme/console" },
        { label: "Zielzweig", value: "main" },
      ],
    },
    {
      id: "pending-1",
      source: "matrix",
      title: "Pending Matrix plan",
      summary: "Awaiting approval",
      status: "pending_review",
      sourceLabel: "Matrix Workspace",
      provenanceRows: [
        { label: "Raum", value: "!room:matrix.example" },
        { label: "Snapshot", value: "snapshot-1" },
      ],
    },
    {
      id: "stale-1",
      source: "github",
      title: "Stale GitHub plan",
      summary: "Refresh required",
      status: "stale",
      stale: true,
      sourceLabel: "GitHub Workspace",
      provenanceRows: [
        { label: "Repository", value: "acme/console" },
      ],
    },
  ];

  const prioritized = prioritizeReviewItems(items);
  assert.equal(prioritized[0]?.status, "stale");
  assert.equal(describeReviewNextStep(items, "de"), "Veraltete Prüfung erneuern");

  const markup = renderToStaticMarkup(
    React.createElement(
      LocaleProvider,
      { initialLocale: "de" },
      React.createElement(ReviewWorkspace, {
        items,
        expertMode: false,
      }),
    ),
  );

  assert.match(markup, /Prüfungswarteschlange/);
  assert.match(markup, /Veraltete Prüfung/);
  assert.match(markup, /Alle offenen Prüfungen/);
  assert.match(markup, /Repository/);
  assert.match(markup, /Snapshot/);
});
