import assert from "node:assert/strict";
import test from "node:test";
import {
  getSessionStatusLabel,
  normalizeLocale,
  resolveInitialLocale,
  toggleLocale,
} from "../src/lib/localization.js";

test("locale resolution defaults fail-closed to en when no signals are present", () => {
  const locale = resolveInitialLocale({
    storedLocale: null,
    browserLanguage: null,
  });

  assert.equal(locale, "en");
});

test("locale resolution prefers stored locale and normalizes browser variants", () => {
  assert.equal(
    resolveInitialLocale({ storedLocale: "de", browserLanguage: "en-US" }),
    "de",
  );
  assert.equal(
    resolveInitialLocale({ storedLocale: null, browserLanguage: "de-DE" }),
    "de",
  );
  assert.equal(normalizeLocale("en-GB"), "en");
});

test("toggle locale flips between en and de deterministically", () => {
  assert.equal(toggleLocale("en"), "de");
  assert.equal(toggleLocale("de"), "en");
});

test("session status labels are localized for en and de", () => {
  assert.equal(getSessionStatusLabel("en", "review_required"), "Review required");
  assert.equal(getSessionStatusLabel("de", "review_required"), "Freigabe nötig");
});
