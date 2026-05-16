import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canSubmitCompanionInput,
  normalizeCompanionInput,
} from "../src/components/FloatingCompanion.js";
import {
  buildCompanionSuggestions,
  validateCompanionIntent,
} from "../src/lib/companion-intents.js";
import {
  buildCompanionContext,
} from "../src/lib/companion-context.js";

test("floating companion helpers trim input and block empty submissions", () => {
  assert.equal(normalizeCompanionInput("  hi  "), "hi");
  assert.equal(canSubmitCompanionInput("   "), false);
  assert.equal(canSubmitCompanionInput(" Frage "), true);
});

test("companion intents allow only safe UI actions and block execute requests", () => {
  assert.equal(validateCompanionIntent({ kind: "navigate_tab", target: "settings" }).state, "allowed");
  assert.equal(validateCompanionIntent({ kind: "github_execute" }).state, "blocked");
  assert.equal(validateCompanionIntent({ kind: "unknown" }).state, "blocked");
});

test("companion suggestions expose guarded UI help for risky GitHub requests", () => {
  const suggestions = buildCompanionSuggestions({
    question: "Bitte GitHub ausführen und PR pushen",
    locale: "de",
  });

  assert.equal(suggestions.suggestedIntents.some((intent) => intent.kind === "navigate_tab" && intent.target === "workbench"), true);
  assert.equal(suggestions.blockedIntents.some((intent) => intent.kind === "github_execute"), true);
});

test("companion context serializes only redacted app facts", () => {
  const context = buildCompanionContext({
    workspace: "settings",
    workMode: "beginner",
    freshness: "backend-fresh",
    backendHealthy: true,
    activeModelAlias: "default-free",
    integrationsStatus: {
      ok: true,
      generatedAt: "2026-05-16T00:00:00.000Z",
      github: {
        status: "connected",
        credentialSource: "user_connected",
        capabilities: {
          read: "available",
          propose: "available",
          execute: "approval_required",
          verify: "available",
        },
        executionMode: "approval_required",
        labels: {
          identity: "user",
          scope: "repo",
        },
        lastVerifiedAt: null,
        lastErrorCode: null,
        secret: "must-not-leak",
      },
      matrix: {
        status: "connected",
        credentialSource: "user_connected",
        capabilities: {
          read: "available",
          propose: "blocked",
          execute: "approval_required",
          verify: "unknown",
        },
        executionMode: "approval_required",
        labels: {
          identity: "matrix",
          scope: "rooms",
          homeserver: "example.org",
        },
        lastVerifiedAt: null,
        lastErrorCode: null,
        token: "must-not-leak",
      },
    },
    runtimeJournalEntries: [
      {
        id: "journal-1",
        timestamp: "2026-05-16T00:00:00.000Z",
        source: "chat",
        eventType: "reply",
        authorityDomain: "backend",
        severity: "info",
        outcome: "observed",
        summary: "Chat answered",
        correlationId: null,
        proposalId: null,
        planId: null,
        executionId: null,
        verificationId: null,
        modelRouteSummary: {
          selectedAlias: "default-free",
        },
        safeMetadata: {
          apiKey: "must-not-leak",
        },
        redaction: {
          contentStored: false,
          secretsStored: false,
          filteredKeys: ["apiKey"],
        },
      },
    ],
    chatSession: {
      metadata: {
        chatState: {
          messages: [{ content: "do not include full content" }],
          connectionState: "idle",
          pendingProposal: null,
          receipts: [],
        },
      },
    },
    githubSession: {
      metadata: {
        selectedRepoFullName: "baum777/mosaicStacked",
        proposalPlan: null,
        pendingDraft: {
          content: "do not include draft",
        },
      },
    },
    matrixSession: {
      metadata: {
        roomId: "!room:example.org",
        roomName: "Mosaic",
        draftContent: "do not include matrix draft",
      },
    },
  });
  const serialized = JSON.stringify(context);

  assert.equal(serialized.includes("must-not-leak"), false);
  assert.equal(serialized.includes("do not include"), false);
  assert.equal(/apiKey|secret|token|cookie|provider|target/.test(serialized), false);
  assert.equal(context.workspace, "settings");
  assert.equal(context.model.publicAlias, "default-free");
});

test("console shell mounts floating companion with locale wiring", () => {
  const source = readFileSync("web/src/App.tsx", "utf8");

  assert.match(source, /import \{ FloatingCompanion \} from "\.\/components\/FloatingCompanion\.js"/);
  assert.match(source, /onSubmitQuestion=\{handleCompanionQuestion\}/);
  assert.doesNotMatch(source, /<FloatingCompanion[\s\S]*openRouterApiKeyInput=/);
  assert.match(source, /\{floatingCompanion\}/);
});

test("floating companion exposes button-to-panel accessibility wiring", () => {
  const source = readFileSync("web/src/components/FloatingCompanion.tsx", "utf8");

  assert.match(source, /aria-expanded=\{isOpen\}/);
  assert.match(source, /aria-controls=\{panelId\}/);
  assert.match(source, /aria-haspopup="dialog"/);
  assert.match(source, /role="dialog"/);
  assert.match(source, /inputRef\.current\?\.focus\(\)/);
});

test("floating companion renders guarded suggested and blocked actions", () => {
  const source = readFileSync("web/src/components/FloatingCompanion.tsx", "utf8");

  assert.match(source, /context\?: CompanionContext/);
  assert.match(source, /onIntent\?: \(intent: CompanionAllowedIntent\) => void/);
  assert.match(source, /buildCompanionSuggestions/);
  assert.match(source, /floating-companion-action/);
  assert.match(source, /floating-companion-blocked-action/);
});

test("floating companion closes on Escape and supports quick actions", () => {
  const source = readFileSync("web/src/components/FloatingCompanion.tsx", "utf8");

  assert.match(source, /event\.key === "Escape"/);
  assert.match(source, /setIsOpen\(false\)/);
  assert.match(source, /quickActions/);
  assert.match(source, /onQuickAction/);
  assert.match(source, /onSubmitQuestion\?: \(question: string\) => Promise<string>/);
  assert.match(source, /modeLabel=\{companionCopy\.assistantModeLabel\}/);
  assert.match(source, /data-testid="floating-companion-mode"/);
});

test("floating companion styles define fixed placement, hover/focus feedback, and mobile-safe offset", () => {
  const critical = readFileSync("web/src/critical.css", "utf8");

  assert.match(critical, /\.floating-companion\s*{[\s\S]*position:\s*fixed/);
  assert.match(critical, /\.floating-companion\s*{[\s\S]*right:\s*14px/);
  assert.match(critical, /\.floating-companion\s*{[\s\S]*z-index:\s*94/);
  assert.match(critical, /\.floating-companion-trigger:hover \.floating-companion-button/);
  assert.match(critical, /\.floating-companion-control:focus-visible/);
  assert.match(critical, /\.app-shell-mobile \.floating-companion\s*{[\s\S]*bottom:\s*calc\(68px \+ env\(safe-area-inset-bottom\)\)/);
});

test("ui adaptation leaves floating companion controls out of the global button override", () => {
  const source = readFileSync("web/src/ui-adaptation.css", "utf8");
  const selectorHits = source.match(/not\(\.floating-companion-control\)/g) ?? [];

  assert.equal(selectorHits.length >= 3, true);
});

test("companion backend mode routes questions through /chat with default-free alias", () => {
  const source = readFileSync("web/src/App.tsx", "utf8");

  assert.match(source, /requestChatCompletion\(\{/);
  assert.match(source, /modelAlias:\s*DEFAULT_FREE_MODEL_ALIAS/);
  assert.match(source, /content:\s*question/);
});

test("console shell passes redacted context and validated intents to companion", () => {
  const source = readFileSync("web/src/App.tsx", "utf8");

  assert.match(source, /import \{ buildCompanionContext \} from "\.\/lib\/companion-context\.js"/);
  assert.match(source, /validateCompanionIntent/);
  assert.match(source, /const companionContext = useMemo/);
  assert.match(source, /context=\{companionContext\}/);
  assert.match(source, /onIntent=\{handleCompanionIntent\}/);
  assert.match(source, /refreshIntegrationsStatus\(\)/);
  assert.match(source, /refreshOpenRouterCredentialStatus\(\)/);
  assert.match(source, /source: "companion"/);
});

test("companion surfaces backend unavailable copy instead of placeholder mode", () => {
  const source = readFileSync("web/src/components/FloatingCompanion.tsx", "utf8");

  assert.match(source, /if \(!assistantModeEnabled \|\| !onSubmitQuestion\)/);
  assert.match(source, /Companion backend unavailable|Companion-Backend nicht verfügbar/);
  assert.doesNotMatch(source, /buildCompanionPlaceholderResponse/);
});
