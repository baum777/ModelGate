import React, { useEffect, useId, useState } from "react";
import type { Locale } from "../lib/localization.js";

type GuideKey = "chat" | "github" | "matrix" | "review" | "settings";

type GuideContent = {
  ctaLabel: string;
  closeLabel: string;
  title: string;
  summary: string;
  stepsTitle: string;
  steps: string[];
  rulesTitle: string;
  rules: string[];
};

type GuideOverlayProps = {
  content: GuideContent;
  testId: string;
};

const GUIDE_COPY: Record<Locale, Record<GuideKey, GuideContent>> = {
  en: {
    chat: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      title: "Chat guide",
      summary: "Use Chat for the next question or prompt. Governed mode prepares a proposal first.",
      stepsTitle: "How to work here",
      steps: ["Write the prompt.", "Prepare a proposal.", "Approve only when the proposal matches the intent."],
      rulesTitle: "Rules",
      rules: ["External writes do not happen from the browser.", "Backend execution starts only after approval."],
    },
    github: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      title: "GitHub guide",
      summary: "Start with one repository, then let the backend read context and prepare a proposal.",
      stepsTitle: "How to work here",
      steps: ["Choose a repository.", "Run the read-only analysis.", "Review the proposal before execution."],
      rulesTitle: "Rules",
      rules: ["Repository reads are server-routed.", "Write actions stay approval-gated."],
    },
    matrix: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      title: "Matrix guide",
      summary: "Focus on the composer first. Scope and provenance stay visible as secondary context.",
      stepsTitle: "How to work here",
      steps: ["Choose or enter a target.", "Draft the message or topic action.", "Use provenance when you need context."],
      rulesTitle: "Rules",
      rules: ["Matrix writes remain fail-closed unless backend contracts allow them.", "Room and event IDs are expert context."],
    },
    review: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      title: "Review guide",
      summary: "Review collects proposals that need a human decision before execution.",
      stepsTitle: "How to work here",
      steps: ["Open the primary proposal.", "Check the consequence and provenance.", "Approve or reject deliberately."],
      rulesTitle: "Rules",
      rules: ["Approval is separate from execution.", "Stale proposals must be refreshed first."],
    },
    settings: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      title: "Settings guide",
      summary: "Use Settings to switch disclosure level and inspect backend-owned truth.",
      stepsTitle: "How to work here",
      steps: ["Stay in Beginner for focused work.", "Switch to Expert when diagnostics are needed.", "Use diagnostics only to verify state."],
      rulesTitle: "Rules",
      rules: ["Credentials and provider routing are not browser truth.", "Diagnostics must not expose prompt or credential content."],
    },
  },
  de: {
    chat: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      title: "Chat-Guide",
      summary: "Nutze Chat für die nächste Frage oder Eingabe. Governed Mode erstellt zuerst einen Vorschlag.",
      stepsTitle: "So arbeitest du hier",
      steps: ["Prompt schreiben.", "Vorschlag vorbereiten.", "Nur freigeben, wenn der Vorschlag zur Absicht passt."],
      rulesTitle: "Regeln",
      rules: ["Externe Writes passieren nicht aus dem Browser.", "Backend-Ausführung startet erst nach Freigabe."],
    },
    github: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      title: "GitHub-Guide",
      summary: "Starte mit einem Repository. Danach liest das Backend Kontext und bereitet einen Vorschlag vor.",
      stepsTitle: "So arbeitest du hier",
      steps: ["Repository auswählen.", "Read-only Analyse starten.", "Vorschlag vor der Ausführung prüfen."],
      rulesTitle: "Regeln",
      rules: ["Repository-Reads laufen serverseitig.", "Write-Aktionen bleiben freigabegeschützt."],
    },
    matrix: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      title: "Matrix-Guide",
      summary: "Der Composer ist die Hauptaktion. Scope und Provenienz bleiben als sekundärer Kontext sichtbar.",
      stepsTitle: "So arbeitest du hier",
      steps: ["Ziel wählen oder eingeben.", "Nachricht oder Topic-Aktion entwerfen.", "Provenienz nutzen, wenn Kontext nötig ist."],
      rulesTitle: "Regeln",
      rules: ["Matrix-Writes bleiben fail-closed, solange Backend-Contracts fehlen.", "Room- und Event-IDs sind Expertenkontext."],
    },
    review: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      title: "Review-Guide",
      summary: "Review sammelt Vorschläge, die vor Ausführung eine menschliche Entscheidung brauchen.",
      stepsTitle: "So arbeitest du hier",
      steps: ["Primären Vorschlag öffnen.", "Konsequenz und Provenienz prüfen.", "Bewusst freigeben oder ablehnen."],
      rulesTitle: "Regeln",
      rules: ["Freigabe ist von Ausführung getrennt.", "Veraltete Vorschläge müssen neu erstellt werden."],
    },
    settings: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      title: "Settings-Guide",
      summary: "Nutze Einstellungen für Offenlegung und backend-belegte Wahrheit.",
      stepsTitle: "So arbeitest du hier",
      steps: ["Im Basismodus fokussiert arbeiten.", "Bei Bedarf in den Expertenmodus wechseln.", "Diagnostik nur zur Zustandsprüfung nutzen."],
      rulesTitle: "Regeln",
      rules: ["Credentials und Provider-Routing sind keine Browser-Wahrheit.", "Diagnostik darf keine Prompt- oder Credential-Inhalte zeigen."],
    },
  },
};

export function getWorkspaceGuide(locale: Locale, key: GuideKey) {
  return GUIDE_COPY[locale][key];
}

export function GuideOverlay({ content, testId }: GuideOverlayProps) {
  const [open, setOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <>
      <button
        type="button"
        className="secondary-button guide-cta"
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {content.ctaLabel}
      </button>
      {open ? (
        <div className="guide-overlay-backdrop" onMouseDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="guide-overlay"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <header className="guide-overlay-header">
              <div>
                <p className="info-label">{content.ctaLabel}</p>
                <h2 id={titleId}>{content.title}</h2>
              </div>
              <button type="button" className="ghost-button" onClick={() => setOpen(false)}>
                {content.closeLabel}
              </button>
            </header>

            <p className="guide-overlay-summary">{content.summary}</p>

            <div className="guide-overlay-body">
              <section className="guide-overlay-section">
                <h3>{content.stepsTitle}</h3>
                <ol>
                  {content.steps.map((step) => (
                    <li key={step}>{step}</li>
                  ))}
                </ol>
              </section>
              <section className="guide-overlay-section">
                <h3>{content.rulesTitle}</h3>
                <ul>
                  {content.rules.map((rule) => (
                    <li key={rule}>{rule}</li>
                  ))}
                </ul>
              </section>
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
