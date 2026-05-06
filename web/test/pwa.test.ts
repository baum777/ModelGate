import assert from "node:assert/strict";
import test from "node:test";
import { shouldRegisterPwa } from "../src/pwa.js";

test("PWA registration is disabled in dev so stale shell caches cannot own the header", () => {
  assert.equal(
    shouldRegisterPwa({
      isDev: true,
      isSecureContext: true,
      hasServiceWorker: true,
    }),
    false,
  );
});

test("PWA registration remains available in secure production browsers", () => {
  assert.equal(
    shouldRegisterPwa({
      isDev: false,
      isSecureContext: true,
      hasServiceWorker: true,
    }),
    true,
  );
});
