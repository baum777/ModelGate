import assert from "node:assert/strict";
import test from "node:test";
import { runMatrixEvidenceSmoke } from "../../scripts/matrix-evidence-smoke.mjs";

test("matrix evidence live smoke against one configured evidence room", async (t) => {
  const result = await runMatrixEvidenceSmoke();

  if (result.ok && result.status === "skipped") {
    t.skip(`Matrix evidence live smoke skipped: ${result.reason}`);
    return;
  }

  if (!result.ok && result.error.code === "smoke_backend_unreachable") {
    t.skip("Matrix evidence live smoke skipped: local backend is not reachable");
    return;
  }

  assert.equal(result.ok, true);
  assert.equal(result.status, "passed");
});
