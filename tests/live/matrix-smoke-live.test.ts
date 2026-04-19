import assert from "node:assert/strict";
import test from "node:test";
import { runMatrixSmoke } from "../../scripts/matrix-smoke.mjs";

test("matrix live smoke against the configured homeserver", async (t) => {
  const result = await runMatrixSmoke();

  if (result.ok && result.status === "skipped") {
    t.skip(`Matrix live smoke skipped: ${result.reason}`);
    return;
  }

  if (!result.ok && result.error.code === "smoke_backend_unreachable") {
    t.skip("Matrix live smoke skipped: local backend is not reachable");
    return;
  }

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
});
