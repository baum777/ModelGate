import { DiagnosticsRow, type DiagnosticsRowState } from "./DiagnosticsRow.js";
import type { DiagnosticsResponse } from "../lib/api.js";

type RoutingViewProps = {
  diagnosticsSnapshot: DiagnosticsResponse | null;
  diagnosticsError: string | null;
};

type RoutingRow = {
  label: string;
  caption: string;
  value: string;
  state: DiagnosticsRowState;
};

function boolState(value: boolean): DiagnosticsRowState {
  return value ? "ok" : "degraded";
}

function boolLabel(value: boolean) {
  return value ? "true" : "false";
}

export function RoutingView({ diagnosticsSnapshot, diagnosticsError }: RoutingViewProps) {
  const routing = diagnosticsSnapshot?.routing ?? null;
  const unavailableState: DiagnosticsRowState = diagnosticsError ? "error" : "missing";
  const unavailableValue = diagnosticsError ? "auth required" : "loading";

  const policyRows: RoutingRow[] = routing
    ? [
        { label: "mode", caption: "Active routing authority.", value: routing.activePolicy, state: "ok" },
        { label: "fail_closed", caption: "No silent fallback to unbounded behavior.", value: boolLabel(routing.failClosed), state: boolState(routing.failClosed) },
        { label: "allow_fallback", caption: "Fallback remains bounded by aliases.", value: boolLabel(routing.allowFallback), state: boolState(routing.allowFallback) },
        { label: "free_only", caption: "Browser sees policy flag only.", value: boolLabel(routing.freeOnly), state: routing.freeOnly ? "ok" : "degraded" },
        { label: "log_enabled", caption: "Routing evidence log status.", value: boolLabel(routing.logEnabled), state: routing.logEnabled ? "degraded" : "missing" },
      ]
    : [
        { label: "mode", caption: "GET /diagnostics did not return routing data.", value: unavailableValue, state: unavailableState },
      ];

  const taskRows: RoutingRow[] = routing
    ? Object.entries(routing.taskAliasMap).map(([task, alias]) => ({
        label: task,
        caption: "Public alias only.",
        value: alias,
        state: "ok",
      }))
    : [];

  const fallbackRows: RoutingRow[] = routing
    ? routing.fallbackChain.map((alias, index) => ({
        label: `fallback_${index + 1}`,
        caption: "Public alias only.",
        value: alias,
        state: "ok",
      }))
    : [];

  const lifecycleRows: RoutingRow[] = [
    { label: "start", caption: "SSE frame emitted by backend.", value: "emitted", state: "ok" },
    { label: "route", caption: "Alias-only route metadata.", value: "emitted", state: "ok" },
    { label: "token*", caption: "Streaming token frames.", value: "streaming", state: "ok" },
    { label: "done", caption: "Terminal success frame.", value: "emitted", state: "ok" },
    { label: "error", caption: "Terminal failure frame.", value: "fail-closed", state: "missing" },
  ];

  return (
    <section className="workspace-panel routing-workspace" data-testid="routing-workspace">
      <section className="workspace-hero">
        <div>
          <p className="status-pill status-partial">Routing inspector</p>
          <h1>Routing Inspector</h1>
          <p className="hero-copy">
            Read-only in browser. Authority: routing-authority.ts. Diagnostics are bounded to public aliases and status flags.
          </p>
        </div>
      </section>

      <div className="routing-grid">
        <RoutingCard title="Active Policy" rows={policyRows} />
        <RoutingCard title="Task -> Alias Map" rows={taskRows} emptyValue={unavailableValue} emptyState={unavailableState} />
        <RoutingCard title="Fallback Chain" rows={fallbackRows} emptyValue={unavailableValue} emptyState={unavailableState} />
        <RoutingCard title="SSE Lifecycle" rows={lifecycleRows} />
      </div>

      <article className="workspace-card routing-config-note">
        <p className="muted-copy">
          Config: config/model-capabilities.yml + config/llm-router.yml. Provider IDs are backend-only; browser receives public aliases only.
        </p>
      </article>
    </section>
  );
}

function RoutingCard({
  title,
  rows,
  emptyValue = "not configured",
  emptyState = "missing",
}: {
  title: string;
  rows: RoutingRow[];
  emptyValue?: string;
  emptyState?: DiagnosticsRowState;
}) {
  const renderedRows = rows.length > 0
    ? rows
    : [{ label: "status", caption: "No bounded diagnostics data available.", value: emptyValue, state: emptyState }];

  return (
    <article className="workspace-card routing-card">
      <header className="card-header">
        <div>
          <span>/diagnostics</span>
          <strong>{title}</strong>
        </div>
      </header>
      <div className="diagnostics-status-list">
        {renderedRows.map((row) => (
          <DiagnosticsRow key={`${title}-${row.label}`} {...row} />
        ))}
      </div>
    </article>
  );
}
