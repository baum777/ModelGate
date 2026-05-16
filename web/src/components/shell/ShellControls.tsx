import React from "react";
import { MutedSystemCopy } from "../ShellPrimitives.js";
import { useLocalization } from "../../lib/localization.js";
import { getWorkModeCopy, type WorkMode } from "../../lib/work-mode.js";

export function BeginnerExpertToggle({
  workMode,
  setWorkMode,
}: {
  workMode: WorkMode;
  setWorkMode: (value: WorkMode) => void;
}) {
  const { locale } = useLocalization();
  const beginnerCopy = getWorkModeCopy(locale, "beginner");
  const expertCopy = getWorkModeCopy(locale, "expert");
  const activeCopy = getWorkModeCopy(locale, workMode);

  return (
    <div className="work-mode-control">
      <div className="mode-toggle" role="group" aria-label={activeCopy.label}>
        <button
          type="button"
          className={workMode === "beginner" ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
          onClick={() => setWorkMode("beginner")}
          aria-pressed={workMode === "beginner"}
        >
          {beginnerCopy.shortLabel}
        </button>
        <button
          type="button"
          className={workMode === "expert" ? "mode-toggle-button mode-toggle-button-active" : "mode-toggle-button"}
          onClick={() => setWorkMode("expert")}
          aria-pressed={workMode === "expert"}
        >
          {expertCopy.shortLabel}
        </button>
      </div>
      <MutedSystemCopy className="work-mode-hint">{activeCopy.description}</MutedSystemCopy>
    </div>
  );
}

export function RouteStatusLadder({
  title,
  rows,
}: {
  title: string;
  rows: Array<{
    label: string;
    value: string;
    tone?: "ready" | "partial" | "error" | "muted";
  }>;
}) {
  return (
    <div className="route-status-ladder" aria-label={title}>
      {rows.map((row) => (
        <div className={`route-status-step route-status-step-${row.tone ?? "muted"}`} key={row.label}>
          <span>{row.label}</span>
          <strong>{row.value}</strong>
        </div>
      ))}
    </div>
  );
}
