import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import {
  canSubmitCompanionInput,
  normalizeCompanionInput,
} from "../src/components/FloatingCompanion.js";

test("floating companion helpers trim input and block empty submissions", () => {
  assert.equal(normalizeCompanionInput("  hi  "), "hi");
  assert.equal(canSubmitCompanionInput("   "), false);
  assert.equal(canSubmitCompanionInput(" Frage "), true);
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

test("companion surfaces backend unavailable copy instead of placeholder mode", () => {
  const source = readFileSync("web/src/components/FloatingCompanion.tsx", "utf8");

  assert.match(source, /if \(!assistantModeEnabled \|\| !onSubmitQuestion\)/);
  assert.match(source, /Companion backend unavailable|Companion-Backend nicht verfügbar/);
  assert.doesNotMatch(source, /buildCompanionPlaceholderResponse/);
});
