import React, { useEffect, useId, useState } from "react";
import type { PointerEvent } from "react";
import type { Locale } from "../lib/localization.js";

type GuideKey = "chat" | "github" | "matrix" | "review" | "settings";

type GuideCard = {
  eyebrow: string;
  title: string;
  body: string;
  points: string[];
};

type GuideContent = {
  ctaLabel: string;
  closeLabel: string;
  previousLabel: string;
  nextLabel: string;
  title: string;
  cards: GuideCard[];
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
      previousLabel: "Previous",
      nextLabel: "Next",
      title: "Chat guide",
      cards: [
        {
          eyebrow: "Setup",
          title: "Composer first",
          body: "Chat is for the next prompt. The thread and composer are the primary surface.",
          points: ["Write in the composer.", "Use the toolbar only for mode and public alias.", "Keep diagnostics in Expert."],
        },
        {
          eyebrow: "Best practice",
          title: "Proposal before execution",
          body: "Use governed mode when the prompt may lead to a concrete action.",
          points: ["Write one clear intent.", "Review the prepared proposal.", "Approve only when the consequence matches."],
        },
        {
          eyebrow: "Logic",
          title: "Backend-owned stream",
          body: "The browser renders state, but execution truth stays server-side.",
          points: ["Approval creates an execution receipt.", "Malformed streams fail closed.", "Provider targets stay hidden."],
        },
      ],
    },
    github: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      previousLabel: "Previous",
      nextLabel: "Next",
      title: "GitHub guide",
      cards: [
        {
          eyebrow: "Setup",
          title: "Repo, analysis, proposal",
          body: "GitHub starts with one repository and a read-only context pass.",
          points: ["Unlock the server session.", "Choose one repository.", "Run analysis before asking for a proposal."],
        },
        {
          eyebrow: "Best practice",
          title: "Read before write",
          body: "Keep the flow narrow and reviewable before any GitHub write happens.",
          points: ["Inspect the analysis result.", "Create a bounded proposal.", "Review files and consequence before approval."],
        },
        {
          eyebrow: "Logic",
          title: "Server-routed authority",
          body: "GitHub actions remain routed through the backend and approval gates.",
          points: ["Auth state is server-side.", "Writes stay approval-gated.", "Branch, PR, and commit details live in Expert."],
        },
      ],
    },
    matrix: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      previousLabel: "Previous",
      nextLabel: "Next",
      title: "Matrix guide",
      cards: [
        {
          eyebrow: "Setup",
          title: "Composer with context",
          body: "Matrix puts the composer first; scope and provenance are secondary context.",
          points: ["Pick or enter a target.", "Draft the message or topic action.", "Use scope only when context is needed."],
        },
        {
          eyebrow: "Best practice",
          title: "Make the target explicit",
          body: "A clear target keeps the Matrix workflow understandable and reviewable.",
          points: ["Start with a new post when unsure.", "Resolve scope before topic changes.", "Use provenance before approving."],
        },
        {
          eyebrow: "Logic",
          title: "Fail-closed Matrix writes",
          body: "Matrix credentials never belong to the browser, and writes require backend authority.",
          points: ["Room and event IDs are Expert context.", "Write flows stay fail-closed without a contract.", "Verification reads back from Matrix."],
        },
      ],
    },
    review: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      previousLabel: "Previous",
      nextLabel: "Next",
      title: "Review guide",
      cards: [
        {
          eyebrow: "Setup",
          title: "Decision queue",
          body: "Review collects proposals that need a human decision before execution.",
          points: ["Open the primary item.", "Check source and status.", "Use the queue for secondary items."],
        },
        {
          eyebrow: "Best practice",
          title: "Decide deliberately",
          body: "Treat every approval as a real execution boundary.",
          points: ["Read the consequence.", "Check provenance when available.", "Reject anything stale or unclear."],
        },
        {
          eyebrow: "Logic",
          title: "Approval is not guessing",
          body: "The UI records intent; the backend remains responsible for execution truth.",
          points: ["Stale proposals must be refreshed.", "Approval and execution are separate.", "Receipts show the final state."],
        },
      ],
    },
    settings: {
      ctaLabel: "Guide",
      closeLabel: "Close",
      previousLabel: "Previous",
      nextLabel: "Next",
      title: "Settings guide",
      cards: [
        {
          eyebrow: "Setup",
          title: "Disclosure level",
          body: "Settings controls how much operational detail the workspace shows.",
          points: ["Use Beginner for daily work.", "Switch to Expert for diagnosis.", "Keep the main pages action-focused."],
        },
        {
          eyebrow: "Best practice",
          title: "Only inspect what helps",
          body: "Diagnostics are useful when something is unclear, not as a daily workflow.",
          points: ["Stay in Beginner unless debugging.", "Use truth cards to orient state.", "Clear local diagnostics when done."],
        },
        {
          eyebrow: "Logic",
          title: "Backend truth boundary",
          body: "Settings can show backend-owned truth, but local restore is not fresh authority.",
          points: ["Credentials are not browser truth.", "Provider routing stays backend-owned.", "Restored sessions are local state."],
        },
      ],
    },
  },
  de: {
    chat: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      previousLabel: "Zurück",
      nextLabel: "Weiter",
      title: "Chat-Guide",
      cards: [
        {
          eyebrow: "Aufbau",
          title: "Composer zuerst",
          body: "Chat ist für den nächsten Prompt. Thread und Composer sind die Hauptfläche.",
          points: ["Im Composer schreiben.", "Toolbar nur für Modus und öffentlichen Alias nutzen.", "Diagnostik bleibt im Expert-Modus."],
        },
        {
          eyebrow: "Best Practice",
          title: "Vorschlag vor Ausführung",
          body: "Nutze den freigabepflichtigen Modus, wenn aus dem Prompt eine konkrete Aktion entstehen kann.",
          points: ["Eine klare Absicht formulieren.", "Den vorbereiteten Vorschlag prüfen.", "Nur bei passender Konsequenz freigeben."],
        },
        {
          eyebrow: "Logik",
          title: "Backend-eigener Stream",
          body: "Der Browser rendert Zustand, aber Ausführungswahrheit bleibt serverseitig.",
          points: ["Freigabe erzeugt einen Ausführungsbeleg.", "Fehlerhafte Streams schließen fail-closed.", "Provider-Ziele bleiben verborgen."],
        },
      ],
    },
    github: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      previousLabel: "Zurück",
      nextLabel: "Weiter",
      title: "GitHub-Guide",
      cards: [
        {
          eyebrow: "Aufbau",
          title: "Repo, Analyse, Vorschlag",
          body: "GitHub startet mit einem Repository und einem lesenden Kontextlauf.",
          points: ["Server-Session freischalten.", "Ein Repository wählen.", "Vor dem Vorschlag die Analyse starten."],
        },
        {
          eyebrow: "Best Practice",
          title: "Erst lesen, dann schreiben",
          body: "Halte den Ablauf eng und prüfbar, bevor irgendein GitHub-Write passiert.",
          points: ["Analyseergebnis prüfen.", "Begrenzten Vorschlag erstellen.", "Dateien und Konsequenz vor Freigabe prüfen."],
        },
        {
          eyebrow: "Logik",
          title: "Serverseitige Autorität",
          body: "GitHub-Aktionen laufen über Backend-Routen und Freigabe-Gates.",
          points: ["Auth-Zustand ist serverseitig.", "Writes bleiben freigabegeschützt.", "Branch, PR und Commit liegen in Expert."],
        },
      ],
    },
    matrix: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      previousLabel: "Zurück",
      nextLabel: "Weiter",
      title: "Matrix-Guide",
      cards: [
        {
          eyebrow: "Aufbau",
          title: "Composer mit Kontext",
          body: "Matrix stellt den Composer nach vorn; Scope und Provenienz sind sekundärer Kontext.",
          points: ["Ziel wählen oder eingeben.", "Nachricht oder Topic-Aktion entwerfen.", "Scope nur bei Kontextbedarf vertiefen."],
        },
        {
          eyebrow: "Best Practice",
          title: "Ziel eindeutig machen",
          body: "Ein klares Ziel hält den Matrix-Flow verständlich und prüfbar.",
          points: ["Bei Unsicherheit mit neuem Beitrag starten.", "Vor Topic-Änderungen Scope auflösen.", "Vor Freigabe Provenienz prüfen."],
        },
        {
          eyebrow: "Logik",
          title: "Matrix-Writes fail-closed",
          body: "Matrix-Credentials gehören nie in den Browser; Writes brauchen Backend-Autorität.",
          points: ["Room- und Event-IDs sind Expert-Kontext.", "Write-Flows bleiben ohne Contract geschlossen.", "Verify liest Matrix backendseitig zurück."],
        },
      ],
    },
    review: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      previousLabel: "Zurück",
      nextLabel: "Weiter",
      title: "Review-Guide",
      cards: [
        {
          eyebrow: "Aufbau",
          title: "Entscheidungsqueue",
          body: "Review sammelt Vorschläge, die vor Ausführung eine menschliche Entscheidung brauchen.",
          points: ["Primären Eintrag öffnen.", "Quelle und Status prüfen.", "Queue für weitere Einträge nutzen."],
        },
        {
          eyebrow: "Best Practice",
          title: "Bewusst entscheiden",
          body: "Behandle jede Freigabe als echte Ausführungsgrenze.",
          points: ["Konsequenz lesen.", "Provenienz prüfen, wenn vorhanden.", "Unklares oder Veraltetes ablehnen."],
        },
        {
          eyebrow: "Logik",
          title: "Freigabe ist kein Raten",
          body: "Die UI protokolliert Absicht; das Backend bleibt für Ausführungswahrheit zuständig.",
          points: ["Veraltete Vorschläge müssen neu erstellt werden.", "Freigabe und Ausführung sind getrennt.", "Belege zeigen den Endzustand."],
        },
      ],
    },
    settings: {
      ctaLabel: "Guide",
      closeLabel: "Schließen",
      previousLabel: "Zurück",
      nextLabel: "Weiter",
      title: "Settings-Guide",
      cards: [
        {
          eyebrow: "Aufbau",
          title: "Offenlegung steuern",
          body: "Settings regelt, wie viel operativer Kontext im Workspace sichtbar ist.",
          points: ["Basis für Daily Use nutzen.", "Expert nur zur Diagnose aktivieren.", "Hauptseiten action-fokussiert halten."],
        },
        {
          eyebrow: "Best Practice",
          title: "Nur prüfen, was hilft",
          body: "Diagnostik ist hilfreich bei Unklarheit, aber kein Daily-Workflow.",
          points: ["Ohne Debugging im Basis-Modus bleiben.", "Truth-Karten zur Orientierung nutzen.", "Lokale Diagnostik nach Prüfung leeren."],
        },
        {
          eyebrow: "Logik",
          title: "Backend-Wahrheitsgrenze",
          body: "Settings zeigt backend-belegte Wahrheit; lokaler Restore ist keine frische Autorität.",
          points: ["Credentials sind keine Browser-Wahrheit.", "Provider-Routing bleibt backend-owned.", "Restored Sessions sind lokaler Zustand."],
        },
      ],
    },
  },
};

export function getWorkspaceGuide(locale: Locale, key: GuideKey) {
  return GUIDE_COPY[locale][key];
}

function clampCardIndex(index: number, cardCount: number) {
  return Math.min(Math.max(index, 0), cardCount - 1);
}

export function GuideOverlay({ content, testId }: GuideOverlayProps) {
  const [open, setOpen] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [pointerStartX, setPointerStartX] = useState<number | null>(null);
  const titleId = useId();
  const activeCard = content.cards[activeCardIndex] ?? content.cards[0];
  const hasPrevious = activeCardIndex > 0;
  const hasNext = activeCardIndex < content.cards.length - 1;

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
      if (event.key === "ArrowLeft") {
        setActiveCardIndex((current) => clampCardIndex(current - 1, content.cards.length));
      }
      if (event.key === "ArrowRight") {
        setActiveCardIndex((current) => clampCardIndex(current + 1, content.cards.length));
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [content.cards.length, open]);

  useEffect(() => {
    if (!open) {
      setActiveCardIndex(0);
      setPointerStartX(null);
    }
  }, [open]);

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (pointerStartX === null) {
      return;
    }

    const delta = event.clientX - pointerStartX;
    setPointerStartX(null);

    if (Math.abs(delta) < 44) {
      return;
    }

    setActiveCardIndex((current) =>
      clampCardIndex(current + (delta < 0 ? 1 : -1), content.cards.length),
    );
  }

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

            <article
              className="guide-card"
              data-testid={`${testId}-card`}
              onPointerDown={(event) => setPointerStartX(event.clientX)}
              onPointerUp={handlePointerUp}
              onPointerCancel={() => setPointerStartX(null)}
            >
              <p className="info-label">{activeCard.eyebrow}</p>
              <h3>{activeCard.title}</h3>
              <p className="guide-overlay-summary">{activeCard.body}</p>
              <ul>
                {activeCard.points.map((point) => (
                  <li key={point}>{point}</li>
                ))}
              </ul>
            </article>

            <footer className="guide-carousel-controls">
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveCardIndex((current) => clampCardIndex(current - 1, content.cards.length))}
                disabled={!hasPrevious}
              >
                {content.previousLabel}
              </button>
              <div className="guide-card-dots" aria-label={`${activeCardIndex + 1} / ${content.cards.length}`}>
                {content.cards.map((card, index) => (
                  <button
                    key={card.title}
                    type="button"
                    className={index === activeCardIndex ? "guide-card-dot guide-card-dot-active" : "guide-card-dot"}
                    aria-label={`${index + 1} / ${content.cards.length}: ${card.eyebrow}`}
                    aria-current={index === activeCardIndex ? "step" : undefined}
                    onClick={() => setActiveCardIndex(index)}
                  />
                ))}
              </div>
              <button
                type="button"
                className="secondary-button"
                onClick={() => setActiveCardIndex((current) => clampCardIndex(current + 1, content.cards.length))}
                disabled={!hasNext}
              >
                {content.nextLabel}
              </button>
            </footer>
          </section>
        </div>
      ) : null}
    </>
  );
}
