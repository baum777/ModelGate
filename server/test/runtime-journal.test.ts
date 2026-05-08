import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import { createRuntimeJournal } from "../src/lib/runtime-journal.js";

test("runtime journal appends entries and enforces bounded retention", () => {
  const journal = createRuntimeJournal({
    enabled: true,
    mode: "memory",
    maxEntries: 2,
    exposeRecentLimit: 10
  });

  journal.append({
    source: "system",
    eventType: "a",
    authorityDomain: "backend",
    severity: "info",
    outcome: "observed",
    summary: "A"
  });
  journal.append({
    source: "system",
    eventType: "b",
    authorityDomain: "backend",
    severity: "info",
    outcome: "observed",
    summary: "B"
  });
  journal.append({
    source: "chat",
    eventType: "c",
    authorityDomain: "chat",
    severity: "info",
    outcome: "executed",
    summary: "C"
  });

  const entries = journal.listRecent({
    limit: 10
  });

  assert.equal(entries.length, 2);
  assert.equal(entries[0]?.eventType, "c");
  assert.equal(entries[1]?.eventType, "b");
});

test("runtime journal sanitizes forbidden metadata keys", () => {
  const journal = createRuntimeJournal({
    enabled: true,
    mode: "memory",
    maxEntries: 10,
    exposeRecentLimit: 10
  });

  const appended = journal.append({
    source: "chat",
    eventType: "chat_stream_completed",
    authorityDomain: "chat",
    severity: "info",
    outcome: "executed",
    summary: "Chat completed",
    safeMetadata: {
      scope: "chat",
      apiKey: "secret",
      prompt: "do not persist",
      nested: {
        token: "hidden",
        safeValue: 1
      }
    }
  });

  assert.ok(appended);
  assert.deepEqual(appended?.safeMetadata, {
    scope: "chat",
    nested: {
      safeValue: 1
    }
  });
  assert.ok((appended?.redaction.filteredKeys ?? []).includes("apiKey"));
  assert.ok((appended?.redaction.filteredKeys ?? []).includes("prompt"));
  assert.ok((appended?.redaction.filteredKeys ?? []).includes("token"));
});

test("runtime journal file mode recovers persisted entries and fails closed on malformed files", () => {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "mosaicstacked-journal-"));
  const filePath = path.join(tempDir, "runtime-journal.json");

  const first = createRuntimeJournal({
    enabled: true,
    mode: "file",
    filePath,
    maxEntries: 10,
    exposeRecentLimit: 10
  });
  first.append({
    source: "system",
    eventType: "boot",
    authorityDomain: "backend",
    severity: "info",
    outcome: "observed",
    summary: "Boot"
  });

  const second = createRuntimeJournal({
    enabled: true,
    mode: "file",
    filePath,
    maxEntries: 10,
    exposeRecentLimit: 10
  });
  assert.equal(second.listRecent().length, 1);

  fs.writeFileSync(filePath, "{ malformed", "utf8");

  const malformed = createRuntimeJournal({
    enabled: true,
    mode: "file",
    filePath,
    maxEntries: 10,
    exposeRecentLimit: 10
  });
  assert.equal(malformed.listRecent().length, 0);
});
