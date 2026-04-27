import assert from "node:assert/strict";
import test from "node:test";
import { fetchDiagnostics, fetchJournalRecent } from "../src/lib/api.js";

function installFetchMock(handler: typeof fetch) {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = handler;

  return () => {
    globalThis.fetch = originalFetch;
  };
}

test("fetchDiagnostics returns safe diagnostics payload", async () => {
  const restoreFetch = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        service: "modelgate-test",
        runtimeMode: "local",
        diagnosticsGeneratedAt: "2026-04-24T10:00:00.000Z",
        processStartedAt: "2026-04-24T09:58:00.000Z",
        uptimeMs: 120000,
        models: {
          defaultPublicAlias: "default",
          publicAliases: ["default", "coding"]
        },
        routing: {
          mode: "policy",
          allowFallback: true,
          failClosed: true,
          requireBackendOwnedResolution: true
        },
        rateLimit: {
          enabled: true,
          windowMs: 60000,
          limits: {
            chat: 30,
            auth_login: 8,
            github_propose: 10,
            github_execute: 6,
            matrix_execute: 6
          },
          blockedByScope: {
            chat: 1,
            auth_login: 0,
            github_propose: 0,
            github_execute: 0,
            matrix_execute: 0
          }
        },
        actionStore: {
          mode: "memory"
        },
        github: {
          configured: true,
          ready: true
        },
        matrix: {
          configured: false,
          ready: false
        },
        journal: {
          enabled: true,
          mode: "memory",
          maxEntries: 500,
          exposeRecentLimit: 50,
          recentCount: 10
        },
        counters: {
          chatRequests: 4,
          chatStreamStarted: 3,
          chatStreamCompleted: 2,
          chatStreamError: 1,
          chatStreamAborted: 0,
          upstreamError: 1
        }
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  );

  try {
    const diagnostics = await fetchDiagnostics();

    assert.equal(diagnostics.ok, true);
    assert.equal(diagnostics.runtimeMode, "local");
    assert.deepEqual(diagnostics.models.publicAliases, ["default", "coding"]);
    assert.equal(diagnostics.rateLimit.blockedByScope.chat, 1);
    assert.equal(diagnostics.journal.mode, "memory");
  } finally {
    restoreFetch();
  }
});

test("fetchDiagnostics surfaces safe backend diagnostics errors", async () => {
  const restoreFetch = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        ok: false,
        code: "diagnostics_unavailable"
      }),
      {
        status: 503,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  );

  try {
    await assert.rejects(fetchDiagnostics(), /diagnostics_unavailable/);
  } finally {
    restoreFetch();
  }
});

test("fetchJournalRecent parses bounded safe entries", async () => {
  const restoreFetch = installFetchMock(async () =>
    new Response(
      JSON.stringify({
        ok: true,
        entries: [
          {
            id: "entry-1",
            timestamp: "2026-04-25T09:00:00.000Z",
            source: "chat",
            eventType: "chat_stream_completed",
            authorityDomain: "chat",
            severity: "info",
            outcome: "executed",
            summary: "Chat stream completed",
            correlationId: null,
            proposalId: null,
            planId: null,
            executionId: null,
            verificationId: null,
            modelRouteSummary: null,
            safeMetadata: {
              scope: "chat"
            },
            redaction: {
              contentStored: false,
              secretsStored: false,
              filteredKeys: []
            }
          }
        ]
      }),
      {
        status: 200,
        headers: {
          "Content-Type": "application/json"
        }
      }
    )
  );

  try {
    const response = await fetchJournalRecent({
      limit: 10,
      source: "chat"
    });

    assert.equal(response.ok, true);
    assert.equal(response.entries.length, 1);
    assert.equal(response.entries[0]?.eventType, "chat_stream_completed");
    assert.equal(response.entries[0]?.redaction.contentStored, false);
  } finally {
    restoreFetch();
  }
});
