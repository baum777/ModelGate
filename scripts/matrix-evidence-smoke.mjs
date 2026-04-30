#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  formatMatrixSmokeResult,
  runMatrixSmoke
} from "./matrix-smoke.mjs";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const rootEnvPath = resolve(repoRoot, ".env");

function parseEnvFile(content) {
  const result = {};

  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();

    if (!line || line.startsWith("#")) {
      continue;
    }

    const equalsIndex = line.indexOf("=");

    if (equalsIndex < 0) {
      continue;
    }

    const key = line.slice(0, equalsIndex).trim();
    let value = line.slice(equalsIndex + 1).trim();

    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }

    result[key] = value;
  }

  return result;
}

function loadRootEnv() {
  if (!existsSync(rootEnvPath)) {
    return {};
  }

  return parseEnvFile(readFileSync(rootEnvPath, "utf8"));
}

function truthy(value) {
  return /^(1|true|yes|on)$/i.test(String(value ?? "").trim());
}

function nonEmpty(value) {
  const normalized = String(value ?? "").trim();

  return normalized || null;
}

function readEvidenceRoomId(env) {
  const singleRoom = nonEmpty(env.MATRIX_EVIDENCE_ROOM_ID);

  if (singleRoom) {
    return singleRoom;
  }

  const targets = [
    nonEmpty(env.MATRIX_EVIDENCE_APPROVALS_ROOM_ID),
    nonEmpty(env.MATRIX_EVIDENCE_PROVENANCE_ROOM_ID),
    nonEmpty(env.MATRIX_EVIDENCE_VERIFICATION_ROOM_ID),
    nonEmpty(env.MATRIX_EVIDENCE_TOPIC_CHANGE_ROOM_ID)
  ];

  if (targets.every(Boolean) && new Set(targets).size === 1) {
    return targets[0];
  }

  return null;
}

function readConfig(sourceEnv = process.env, options = {}) {
  const fileEnv = options.loadRootEnvFile === false ? {} : loadRootEnv();
  const env = {
    ...fileEnv,
    ...sourceEnv
  };
  const missing = [];
  const homeserverUrl = nonEmpty(env.MATRIX_BASE_URL) ?? nonEmpty(env.MATRIX_HOMESERVER_URL);
  const smokeRoomId = nonEmpty(env.MATRIX_SMOKE_ROOM_ID) ?? nonEmpty(env.MATRIX_ROOM_ID);
  const evidenceRoomId = readEvidenceRoomId(env);

  if (!truthy(env.MATRIX_ENABLED)) {
    missing.push("MATRIX_ENABLED=true");
  }

  if (!homeserverUrl) {
    missing.push("MATRIX_BASE_URL or MATRIX_HOMESERVER_URL");
  }

  if (!nonEmpty(env.MATRIX_ACCESS_TOKEN)) {
    missing.push("MATRIX_ACCESS_TOKEN");
  }

  if (!smokeRoomId) {
    missing.push("MATRIX_SMOKE_ROOM_ID or MATRIX_ROOM_ID");
  }

  if (!truthy(env.MATRIX_EVIDENCE_WRITES_ENABLED)) {
    missing.push("MATRIX_EVIDENCE_WRITES_ENABLED=true");
  }

  if (!evidenceRoomId) {
    missing.push("MATRIX_EVIDENCE_ROOM_ID or MATRIX_EVIDENCE_*_ROOM_ID");
  }

  if (missing.length > 0) {
    return {
      state: "skipped",
      reason: "missing_required_env",
      missing
    };
  }

  return {
    state: "ready",
    env,
    evidenceRoomId
  };
}

function hasReceipt(receipts, eventType) {
  return Array.isArray(receipts)
    && receipts.some((receipt) => receipt?.eventType === eventType && typeof receipt.transactionId === "string");
}

function verifyEvidenceReceipts(lifecycle, phase) {
  const executeEvidence = lifecycle?.evidence?.execute ?? [];
  const verifyEvidence = lifecycle?.evidence?.verify ?? [];

  if (!hasReceipt(executeEvidence, "matrix_approval_record")) {
    return {
      ok: false,
      phase,
      error: {
        code: "matrix_evidence_missing_approval",
        message: "Matrix evidence smoke did not observe an approval evidence receipt"
      }
    };
  }

  if (!hasReceipt(executeEvidence, "matrix_topic_change_record")) {
    return {
      ok: false,
      phase,
      error: {
        code: "matrix_evidence_missing_topic_change",
        message: "Matrix evidence smoke did not observe a topic-change evidence receipt"
      }
    };
  }

  if (!hasReceipt(verifyEvidence, "matrix_verification_result")) {
    return {
      ok: false,
      phase,
      error: {
        code: "matrix_evidence_missing_verification",
        message: "Matrix evidence smoke did not observe a verification evidence receipt"
      }
    };
  }

  return { ok: true };
}

function createSkipResult(missing, reason) {
  return {
    ok: true,
    status: "skipped",
    reason,
    missing
  };
}

export function formatMatrixEvidenceSmokeResult(result) {
  return formatMatrixSmokeResult(result);
}

export async function runMatrixEvidenceSmoke(options = {}) {
  const config = readConfig(options.env ?? process.env, {
    loadRootEnvFile: options.loadRootEnvFile
  });

  if (config.state === "skipped") {
    return createSkipResult(config.missing, config.reason);
  }

  const smoke = await runMatrixSmoke({
    ...options,
    env: config.env,
    loadRootEnvFile: false
  });

  if (!smoke.ok || smoke.status !== "passed") {
    return smoke;
  }

  const forward = verifyEvidenceReceipts(smoke.forward, "forward_evidence");

  if (!forward.ok) {
    return {
      ok: false,
      status: "failed",
      ...forward
    };
  }

  const cleanup = verifyEvidenceReceipts(smoke.cleanup, "cleanup_evidence");

  if (!cleanup.ok) {
    return {
      ok: false,
      status: "failed",
      ...cleanup
    };
  }

  return {
    ...smoke,
    evidenceRoomId: config.evidenceRoomId
  };
}

async function main() {
  const result = await runMatrixEvidenceSmoke();
  const output = formatMatrixEvidenceSmokeResult(result);
  const isSkipped = result.ok && result.status === "skipped";

  console.log(output);

  process.exitCode = result.ok || isSkipped ? 0 : 1;
}

const isMain = process.argv[1]
  ? import.meta.url === pathToFileURL(process.argv[1]).href
  : false;

if (isMain) {
  main().catch((error) => {
    const message = error instanceof Error ? error.message : "Unknown evidence smoke failure";

    console.error(formatMatrixEvidenceSmokeResult({
      ok: false,
      status: "failed",
      phase: "main",
      error: {
        code: "smoke_unhandled_error",
        message
      }
    }));

    process.exitCode = 1;
  });
}
