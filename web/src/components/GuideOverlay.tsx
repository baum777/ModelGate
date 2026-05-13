import React, { useEffect, useId, useRef, useState } from "react";
import type { PointerEvent, WheelEvent } from "react";
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
  ctaClassName?: string;
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
          eyebrow: "Workspace",
          title: "Workspaces and work mode",
          body: "The left rail switches between Chat, GitHub, Matrix, Review, and Settings; the work-mode toggle controls disclosure.",
          points: ["Use Beginner for the focused daily view.", "Use Expert for route, alias, diagnostics, and provenance context.", "Changing work mode does not change backend authority.", "If a surface looks different after reload, treat it as restored browser state until backend status confirms it."],
        },
        {
          eyebrow: "Guide",
          title: "Guide, status, and diagnostics",
          body: "The Guide explains the current workspace; diagnostics and status panels show whether the console can safely act.",
          points: ["Use Guide controls, dots, and arrow keys to move through cards.", "Open diagnostics when backend or routing state is unclear.", "Status strips and the right rail are evidence surfaces, not execution shortcuts.", "Prefer status labels over remembered state when deciding whether the next action is available."],
        },
        {
          eyebrow: "Mode",
          title: "Execution mode",
          body: "The execution-mode toggle chooses whether the next prompt is read-only chat or a governed proposal.",
          points: ["Read-only mode sends a direct prompt without external writes.", "Governed mode prepares a proposal before backend execution.", "Running execution locks the toggle until the current path settles.", "Switch modes before writing the prompt when the expected outcome changes from explanation to action."],
        },
        {
          eyebrow: "Routing",
          title: "Public model alias",
          body: "Expert mode can expose the public model alias selector without revealing provider IDs as UI truth.",
          points: ["Pick an alias only when the backend reports it available.", "The alias is routing input, not a provider credential.", "If no alias is available, the composer remains fail-closed.", "Use route status to confirm fallback or degraded execution after a stream starts."],
        },
        {
          eyebrow: "Composer",
          title: "Enter prepares the next step",
          body: "The composer is the main input surface for the chat workspace.",
          points: ["Press Enter to submit the current input.", "Press Shift+Enter to keep writing on a new line.", "In governed mode, submit means prepare proposal; approval is still separate.", "Keep prompts bounded to the current workspace context so receipts remain understandable."],
        },
        {
          eyebrow: "Approval",
          title: "Proposal, approval, and receipts",
          body: "Governed execution separates intent, approval, execution, and evidence.",
          points: ["Review the proposal consequence before approving.", "Reject unclear proposals instead of executing them.", "Receipts and thread blocks show the recorded outcome.", "Use Review when multiple proposals are waiting or when source context matters."],
        },
        {
          eyebrow: "Runtime",
          title: "Stop, new session, and fail-closed state",
          body: "Runtime controls are deliberately narrow so the browser cannot bypass backend truth.",
          points: ["Stop execution cancels only an active stream.", "New session resets the visible workspace state.", "Backend unavailable keeps action controls disabled rather than guessing.", "When a stream is interrupted, start from the receipt and visible status instead of assuming completion."],
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
          title: "Choose one governed repository",
          body: "GitHub work starts by selecting one allowed repository so the backend can build a bounded context.",
          points: ["Use the repository selector only after the backend reports GitHub readiness.", "If the list is empty, switch to Settings and verify the GitHub connection.", "Treat the selected repo as the active scope for analysis, proposal, execution, and verification.", "Do not paste tokens or private credentials into the browser; GitHub auth stays server-side."],
        },
        {
          eyebrow: "Analysis",
          title: "Read before proposing changes",
          body: "Analysis is the safe read path that turns the selected repo into reviewable context before any write-capable step.",
          points: ["Run analysis before requesting a proposal.", "Check the files, citations, warnings, and branch labels before continuing.", "Use the analysis summary to narrow the request instead of asking for broad repository changes.", "If analysis errors or looks stale, rerun it rather than approving from memory."],
        },
        {
          eyebrow: "Proposal",
          title: "Inspect the proposed change set",
          body: "A proposal is still a review object, not an execution result.",
          points: ["Read the summary, rationale, risk level, and affected files.", "Open the raw diff preview in Expert mode when line-level detail matters.", "Confirm the target branch and generated branch name before approval.", "Reject proposals that are stale, too broad, or missing enough evidence."],
        },
        {
          eyebrow: "Approval",
          title: "Execution requires explicit approval",
          body: "The browser can express approval intent, but backend gates own GitHub writes.",
          points: ["Use the approval surface only after the proposal matches the intended scope.", "Approval starts backend execution; it is not a local file write.", "Execution may create a branch, commit, or pull request depending on the plan.", "Failed or stale execution should be treated as blocked until a fresh proposal exists."],
        },
        {
          eyebrow: "Verify",
          title: "Read back the result",
          body: "Verification checks whether GitHub state matches the approved plan.",
          points: ["Use verification output as the final status source.", "Inspect PR links, commit SHA, branch name, and mismatch reasons when available.", "Do not assume a successful request means the repository changed correctly.", "If verification fails, use the surfaced reason rather than manually repairing in the browser."],
        },
        {
          eyebrow: "Diagnostics",
          title: "Use Expert details when the path is unclear",
          body: "Expert mode exposes bounded operational evidence without turning provider or credential details into UI truth.",
          points: ["Check request IDs, plan IDs, route status, and SSE event trails.", "Use diagnostics to distinguish missing config from upstream or validation errors.", "Keep provider targets and credentials out of prompts and screenshots.", "Return to Beginner mode when the workflow is clear enough for normal review."],
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
          title: "Start from an explicit target",
          body: "Matrix work begins by making the target room, event, thread, or scope visible before drafting an action.",
          points: ["Use joined rooms when the backend can read them.", "Enter a room or event ID only when you already know the exact target.", "Treat room and event IDs as operational context, not credentials.", "If the backend cannot prove the target, keep the write path closed."],
        },
        {
          eyebrow: "Composer",
          title: "Draft locally, execute through backend gates",
          body: "The Matrix composer stores browser draft intent, while backend routes own any action-bearing request.",
          points: ["Choose post, reply, thread, or thread reply deliberately.", "Keep the draft specific to the selected room or thread context.", "Do not expect a browser draft to be persisted backend truth.", "Submit remains fail-closed when the write contract is not available."],
        },
        {
          eyebrow: "Scope",
          title: "Resolve scope before decisions",
          body: "Scope summaries help explain what a Matrix room or space currently represents before proposing updates.",
          points: ["Use scope inputs when a topic or provenance decision depends on existing room context.", "Check whether the summary is ready, loading, unavailable, or unresolved.", "Do not promote browser-side hierarchy preview into backend truth.", "Refresh scope if the room context changes during review."],
        },
        {
          eyebrow: "Provenance",
          title: "Read provenance before approval",
          body: "Provenance helps connect a proposed Matrix action to existing events and evidence.",
          points: ["Open provenance for room or topic changes that need audit context.", "Compare event IDs and thread roots before approving replies.", "Use Expert mode when raw route or request status matters.", "Treat missing provenance as a reason to slow down, not as implicit approval."],
        },
        {
          eyebrow: "Approval",
          title: "Matrix actions stay fail-closed",
          body: "Matrix credentials never belong in the browser, and write flows require backend implementation evidence.",
          points: ["Analyze and review can prepare an action plan.", "Approval expresses intent but does not bypass backend gates.", "Execute remains blocked when the route is contract-only or missing.", "Reject unclear plans rather than editing Matrix state through another path."],
        },
        {
          eyebrow: "Verify",
          title: "Verification reads Matrix state back",
          body: "A completed Matrix action is only reliable after backend verification reads the target state.",
          points: ["Check verification status, transaction IDs, and mismatch reasons.", "If the result is unverifiable, keep the item in review instead of assuming success.", "Use diagnostics to distinguish Matrix config issues from route failures.", "Never infer live Matrix readiness from mock or browser-preview content."],
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
          title: "Understand the decision queue",
          body: "Review collects proposals from Chat, GitHub, and Matrix that need a human decision before execution.",
          points: ["Start with the item that is active or highest risk.", "Check source, status, and classification before reading details.", "Use the queue to compare multiple pending items.", "Empty Review means no currently surfaced approval item, not that every workflow is complete."],
        },
        {
          eyebrow: "Evidence",
          title: "Read consequence and provenance",
          body: "The Review workspace exists to slow down action-bearing changes until their evidence is inspectable.",
          points: ["Read the consequence before any approval.", "Check provenance, request IDs, or plan IDs when available.", "Treat stale, failed, or unverifiable items as blocked.", "Use the source workspace when you need richer context before deciding."],
        },
        {
          eyebrow: "Approval",
          title: "Approval is an execution boundary",
          body: "Approving is a deliberate handoff to backend-owned execution, not a browser-side shortcut.",
          points: ["Approve only when the proposal is current and bounded.", "Reject unclear proposals to record a terminal decision without execution.", "Do not approve just to inspect what would happen.", "If the approval path is disabled, resolve the blocking status first."],
        },
        {
          eyebrow: "Status",
          title: "Use status before source memory",
          body: "Review items can become stale as sessions, proposals, or backend state changes.",
          points: ["Prefer visible status over remembered context from another tab.", "Open stale items in their source workspace for refresh.", "Keep failed execution separate from rejected intent.", "Do not treat local restored state as backend-fresh proof."],
        },
        {
          eyebrow: "Receipts",
          title: "Receipts describe outcomes",
          body: "Receipts connect the reviewed intent to the final result when execution finishes or fails.",
          points: ["Executed means backend reported completion for the approved path.", "Failed means the backend could not complete the path.", "Rejected means the operator chose not to execute.", "Unverifiable means the system could not prove the final external state."],
        },
        {
          eyebrow: "Diagnostics",
          title: "Escalate only when evidence is thin",
          body: "Expert diagnostics help explain why a review item is blocked, stale, or unverifiable.",
          points: ["Use diagnostics for request, route, or backend health questions.", "Return to the source workspace for GitHub diff or Matrix provenance details.", "Keep approval decisions separate from troubleshooting curiosity.", "When evidence remains missing, leave the item blocked instead of approving."],
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
          title: "Choose disclosure deliberately",
          body: "Settings controls how much operational detail the console shows across workspaces.",
          points: ["Use Beginner for normal guided work.", "Switch to Expert when route, diagnostics, or IDs are needed.", "Remember that visibility does not change backend authority.", "After debugging, return to the mode that keeps the main task clearest."],
        },
        {
          eyebrow: "Identity",
          title: "Separate identity from connection",
          body: "Connection cards show whether backend-owned integrations are configured and ready.",
          points: ["Check backend health before blaming a workspace.", "Use GitHub and Matrix cards to see configured, connected, or blocked status.", "Do not infer user credentials from browser state.", "If a connection is missing, use the backend-owned auth flow rather than pasting secrets."],
        },
        {
          eyebrow: "Models",
          title: "Model aliases are public routing inputs",
          body: "Settings can show public alias metadata while provider IDs and credentials stay server-owned.",
          points: ["Use the active alias to understand current chat routing input.", "Registered model counts are safe metadata, not provider configuration.", "Adding an OpenRouter model creates a public alias surface only when backend policy allows it.", "Never treat provider targets as browser truth or copy them into user-facing status."],
        },
        {
          eyebrow: "Diagnostics",
          title: "Use diagnostics as evidence",
          body: "Diagnostics explain runtime state, routing policy, counters, and safe operational status.",
          points: ["Open diagnostics when a workspace says checking, unavailable, stale, or blocked.", "Read fallback, fail-closed, and rate-limit status before retrying.", "Counters are aggregate evidence and should not contain prompts or tokens.", "Clear local diagnostics when they no longer help the current investigation."],
        },
        {
          eyebrow: "Journal",
          title: "Review backend-owned receipts",
          body: "Journal entries summarize recent backend-owned events without storing prompt content or secrets.",
          points: ["Use recent entries to understand what the backend accepted, blocked, executed, or verified.", "Check outcome and severity before deciding whether to retry.", "Treat missing journal access as unavailable evidence, not success.", "Use source filters when the current issue belongs to Chat, GitHub, Matrix, auth, or rate limits."],
        },
        {
          eyebrow: "Safety",
          title: "Local restore is not fresh truth",
          body: "Settings makes the boundary between browser state and backend truth explicit.",
          points: ["Restored sessions are local continuity only.", "Backend health, integrations, and diagnostics are the fresh authority surfaces.", "If local state conflicts with backend status, follow backend status.", "Do not save credentials, tokens, or Matrix secrets in browser-visible fields."],
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
          eyebrow: "Workspace",
          title: "Arbeitsbereiche und Arbeitsmodus",
          body: "Die linke Leiste wechselt zwischen Chat, GitHub, Matrix, Prüfung und Einstellungen; der Arbeitsmodus steuert die Detailtiefe.",
          points: ["Basis zeigt die fokussierte Daily-Ansicht.", "Expert zeigt Route, Alias, Diagnostik und Provenienz-Kontext.", "Der Arbeitsmodus ändert keine Backend-Autorität.", "Wenn eine Fläche nach Reload anders aussieht, gilt sie als lokaler Restore, bis Backend-Status sie bestätigt."],
        },
        {
          eyebrow: "Guide",
          title: "Guide, Status und Diagnostik",
          body: "Der Guide erklärt den aktuellen Arbeitsbereich; Diagnostik und Statusflächen zeigen, ob die Konsole sicher handeln kann.",
          points: ["Guide-Steuerung, Punkte und Pfeiltasten wechseln Karten.", "Diagnostik öffnen, wenn Backend- oder Routing-Zustand unklar ist.", "Statusleisten und rechte Rail sind Evidence-Flächen, keine Ausführungsabkürzungen.", "Statuslabels haben Vorrang vor erinnertem Zustand, wenn die nächste Aktion entschieden wird."],
        },
        {
          eyebrow: "Modus",
          title: "Ausführungsmodus",
          body: "Der Ausführungsmodus legt fest, ob der nächste Prompt read-only läuft oder zuerst als governierter Vorschlag vorbereitet wird.",
          points: ["Nur Lesen sendet einen direkten Prompt ohne externe Writes.", "Freigabe nötig bereitet vor der Backend-Ausführung einen Vorschlag vor.", "Während Ausführung läuft, bleibt der Toggle gesperrt.", "Wechsle den Modus vor dem Schreiben, wenn das Ziel von Erklärung zu Aktion wechselt."],
        },
        {
          eyebrow: "Routing",
          title: "Öffentlicher Modellalias",
          body: "Expert kann den öffentlichen Modellalias zeigen, ohne Provider-IDs zur UI-Wahrheit zu machen.",
          points: ["Alias nur wählen, wenn das Backend ihn verfügbar meldet.", "Der Alias ist Routing-Eingabe, kein Credential.", "Ohne verfügbaren Alias bleibt der Composer fail-closed.", "Nach Streamstart zeigt der Routing-Status, ob Fallback oder degradierte Ausführung genutzt wurde."],
        },
        {
          eyebrow: "Composer",
          title: "Enter bereitet den nächsten Schritt vor",
          body: "Der Composer ist die zentrale Eingabefläche im Chat-Arbeitsbereich.",
          points: ["Enter sendet die aktuelle Eingabe ab.", "Shift+Enter erzeugt eine neue Zeile.", "Im governierten Modus bedeutet Absenden: Vorschlag vorbereiten; Freigabe bleibt getrennt.", "Halte Prompts auf den aktuellen Workspace-Kontext begrenzt, damit Belege verständlich bleiben."],
        },
        {
          eyebrow: "Freigabe",
          title: "Vorschlag, Freigabe und Belege",
          body: "Governierte Ausführung trennt Absicht, Freigabe, Ausführung und Evidence.",
          points: ["Konsequenz des Vorschlags vor Freigabe prüfen.", "Unklare Vorschläge ablehnen statt ausführen.", "Belege und Thread-Blöcke zeigen das aufgezeichnete Ergebnis.", "Review nutzen, wenn mehrere Vorschläge warten oder Quellenkontext wichtig ist."],
        },
        {
          eyebrow: "Runtime",
          title: "Stop, neue Session und fail-closed Zustand",
          body: "Runtime-Kontrollen bleiben eng, damit der Browser keine Backend-Wahrheit umgehen kann.",
          points: ["Stop bricht nur einen aktiven Stream ab.", "Neue Session setzt den sichtbaren Workspace-Zustand zurück.", "Backend nicht verfügbar hält Aktionskontrollen deaktiviert, statt zu raten.", "Bei unterbrochenem Stream vom Beleg und sichtbaren Status ausgehen, nicht von angenommener Fertigstellung."],
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
          title: "Ein governantes Repository wählen",
          body: "GitHub-Arbeit beginnt mit genau einem erlaubten Repository, damit das Backend begrenzten Kontext bauen kann.",
          points: ["Repo-Auswahl erst nutzen, wenn das Backend GitHub-Bereitschaft meldet.", "Wenn die Liste leer ist, in Settings die GitHub-Verbindung prüfen.", "Das gewählte Repo ist aktiver Scope für Analyse, Vorschlag, Ausführung und Verify.", "Tokens oder private Credentials nie in den Browser schreiben; GitHub-Auth bleibt serverseitig."],
        },
        {
          eyebrow: "Analyse",
          title: "Vor Änderungen zuerst lesen",
          body: "Analyse ist der sichere Lesepfad, der das gewählte Repo vor jedem Write-Schritt in prüfbaren Kontext übersetzt.",
          points: ["Analyse starten, bevor ein Vorschlag angefordert wird.", "Dateien, Zitate, Warnungen und Branch-Labels vor dem Fortfahren prüfen.", "Analysezusammenfassung nutzen, um breite Änderungswünsche enger zu formulieren.", "Bei Fehlern oder Stale-Hinweisen neu analysieren statt aus Erinnerung freizugeben."],
        },
        {
          eyebrow: "Vorschlag",
          title: "Änderungssatz prüfen",
          body: "Ein Vorschlag ist weiterhin ein Review-Objekt, kein Ausführungsergebnis.",
          points: ["Summary, Begründung, Risiko und betroffene Dateien lesen.", "Raw-Diff in Expert öffnen, wenn Zeilendetails zählen.", "Zielbranch und generierten Branch-Namen vor Freigabe prüfen.", "Stale, zu breite oder schlecht belegte Vorschläge ablehnen."],
        },
        {
          eyebrow: "Freigabe",
          title: "Ausführung braucht explizite Freigabe",
          body: "Der Browser kann Freigabeabsicht ausdrücken; Backend-Gates besitzen GitHub-Writes.",
          points: ["Freigabefläche erst nutzen, wenn der Vorschlag zum Scope passt.", "Freigabe startet Backend-Ausführung; sie ist kein lokaler Dateischreibzugriff.", "Ausführung kann je nach Plan Branch, Commit oder Pull Request erzeugen.", "Fehlgeschlagene oder stale Ausführung bleibt blockiert, bis ein frischer Vorschlag existiert."],
        },
        {
          eyebrow: "Verify",
          title: "Ergebnis zurücklesen",
          body: "Verify prüft, ob GitHub-Zustand dem freigegebenen Plan entspricht.",
          points: ["Verify-Ausgabe als finalen Status verwenden.", "PR-Link, Commit-SHA, Branch-Name und Mismatch-Gründe prüfen, wenn vorhanden.", "Erfolgreiche Anfrage nicht automatisch als korrekte Repo-Änderung behandeln.", "Bei Verify-Fehlern den gemeldeten Grund nutzen statt im Browser manuell zu reparieren."],
        },
        {
          eyebrow: "Diagnostik",
          title: "Expert-Details bei unklarem Pfad nutzen",
          body: "Expert zeigt begrenzte operative Evidence, ohne Provider oder Credentials zur UI-Wahrheit zu machen.",
          points: ["Request-IDs, Plan-IDs, Routenstatus und SSE-Ereignisse prüfen.", "Diagnostik unterscheidet fehlende Konfiguration von Upstream- oder Validierungsfehlern.", "Provider-Ziele und Credentials aus Prompts und Screenshots heraushalten.", "Zurück in Basis wechseln, wenn der Workflow wieder klar genug für normales Review ist."],
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
          title: "Mit eindeutigem Ziel starten",
          body: "Matrix-Arbeit beginnt damit, Zielraum, Event, Thread oder Scope sichtbar zu machen, bevor eine Aktion formuliert wird.",
          points: ["Joined Rooms nutzen, wenn das Backend sie lesen kann.", "Room- oder Event-ID nur eingeben, wenn das Ziel exakt bekannt ist.", "Room- und Event-IDs als operativen Kontext behandeln, nicht als Credentials.", "Wenn das Backend das Ziel nicht belegen kann, bleibt der Write-Pfad geschlossen."],
        },
        {
          eyebrow: "Composer",
          title: "Lokal entwerfen, backendseitig ausführen",
          body: "Der Matrix-Composer hält Browser-Entwurf und Absicht; action-bearing Requests gehören in Backend-Routen.",
          points: ["Post, Reply, Thread oder Thread-Reply bewusst wählen.", "Entwurf konkret auf gewählten Raum oder Thread-Kontext beziehen.", "Browser-Entwurf nicht als backend-persistierte Wahrheit verstehen.", "Submit bleibt fail-closed, wenn kein Write-Contract verfügbar ist."],
        },
        {
          eyebrow: "Scope",
          title: "Scope vor Entscheidungen auflösen",
          body: "Scope-Zusammenfassungen erklären, wofür ein Matrix-Raum oder Space aktuell steht, bevor Updates vorgeschlagen werden.",
          points: ["Scope-Eingaben nutzen, wenn Topic oder Provenienz vom bestehenden Raumkontext abhängen.", "Status prüfen: bereit, lädt, nicht verfügbar oder unresolved.", "Browserseitige Hierarchie-Vorschau nicht zu Backend-Wahrheit machen.", "Scope aktualisieren, wenn sich Raumkontext während Review ändert."],
        },
        {
          eyebrow: "Provenienz",
          title: "Vor Freigabe Provenienz lesen",
          body: "Provenienz verbindet eine vorgeschlagene Matrix-Aktion mit vorhandenen Events und Evidence.",
          points: ["Provenienz für Raum- oder Topic-Änderungen mit Audit-Kontext öffnen.", "Event-IDs und Thread-Roots vor Reply-Freigaben vergleichen.", "Expert nutzen, wenn raw Route oder Request-Status relevant ist.", "Fehlende Provenienz ist ein Signal zum Verlangsamen, keine implizite Freigabe."],
        },
        {
          eyebrow: "Freigabe",
          title: "Matrix-Aktionen bleiben fail-closed",
          body: "Matrix-Credentials gehören nie in den Browser; Write-Flows brauchen Backend-Implementierungsevidence.",
          points: ["Analyze und Review können einen Action-Plan vorbereiten.", "Freigabe drückt Absicht aus, umgeht aber keine Backend-Gates.", "Execute bleibt blockiert, wenn die Route contract-only oder fehlend ist.", "Unklare Pläne ablehnen statt Matrix-Zustand über einen anderen Pfad zu ändern."],
        },
        {
          eyebrow: "Verify",
          title: "Verify liest Matrix-Zustand zurück",
          body: "Eine abgeschlossene Matrix-Aktion ist erst zuverlässig, wenn das Backend den Zielzustand zurückliest.",
          points: ["Verify-Status, Transaction-IDs und Mismatch-Gründe prüfen.", "Bei unverifizierbarem Ergebnis im Review bleiben statt Erfolg anzunehmen.", "Diagnostik unterscheidet Matrix-Konfigurationsprobleme von Routenfehlern.", "Live-Matrix-Bereitschaft nie aus Mock- oder Browser-Preview-Inhalten ableiten."],
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
          title: "Entscheidungsqueue verstehen",
          body: "Review sammelt Vorschläge aus Chat, GitHub und Matrix, die vor Ausführung eine menschliche Entscheidung brauchen.",
          points: ["Mit aktivem oder risikoreichstem Eintrag beginnen.", "Quelle, Status und Klassifikation prüfen, bevor Details gelesen werden.", "Queue nutzen, um mehrere wartende Einträge zu vergleichen.", "Leeres Review heißt nur: kein aktuell sichtbarer Freigabeeintrag, nicht dass jeder Workflow fertig ist."],
        },
        {
          eyebrow: "Evidence",
          title: "Konsequenz und Provenienz lesen",
          body: "Review verlangsamt action-bearing Änderungen, bis ihre Evidence prüfbar ist.",
          points: ["Konsequenz vor jeder Freigabe lesen.", "Provenienz, Request-ID oder Plan-ID prüfen, wenn verfügbar.", "Stale, failed oder unverifizierbare Einträge als blockiert behandeln.", "Den Source-Workspace öffnen, wenn vor Entscheidung mehr Kontext nötig ist."],
        },
        {
          eyebrow: "Freigabe",
          title: "Freigabe ist eine Ausführungsgrenze",
          body: "Freigeben ist eine bewusste Übergabe an backend-owned Execution, kein Browser-Shortcut.",
          points: ["Nur freigeben, wenn der Vorschlag aktuell und begrenzt ist.", "Unklare Vorschläge ablehnen, um eine terminale Entscheidung ohne Ausführung zu protokollieren.", "Nicht freigeben, nur um zu sehen, was passieren würde.", "Wenn die Freigabe blockiert ist, zuerst den sichtbaren Status klären."],
        },
        {
          eyebrow: "Status",
          title: "Status vor Erinnerung nutzen",
          body: "Review-Einträge können stale werden, wenn Sessions, Vorschläge oder Backend-Zustand wechseln.",
          points: ["Sichtbaren Status höher gewichten als Erinnerung aus einem anderen Tab.", "Stale Einträge im Source-Workspace aktualisieren.", "Fehlgeschlagene Ausführung von abgelehnter Absicht trennen.", "Lokalen Restore nicht als backend-frischen Beleg behandeln."],
        },
        {
          eyebrow: "Belege",
          title: "Belege beschreiben Ergebnisse",
          body: "Belege verbinden die geprüfte Absicht mit dem finalen Resultat, wenn Ausführung endet oder scheitert.",
          points: ["Executed bedeutet: Backend meldete Abschluss des freigegebenen Pfads.", "Failed bedeutet: Backend konnte den Pfad nicht abschließen.", "Rejected bedeutet: Operator hat nicht ausgeführt.", "Unverifiable bedeutet: Das System konnte den externen Endzustand nicht belegen."],
        },
        {
          eyebrow: "Diagnostik",
          title: "Nur bei dünner Evidence eskalieren",
          body: "Expert-Diagnostik erklärt, warum ein Review-Eintrag blockiert, stale oder unverifizierbar ist.",
          points: ["Diagnostik für Request-, Routen- oder Backend-Health-Fragen nutzen.", "Für GitHub-Diff oder Matrix-Provenienz in den Source-Workspace zurückgehen.", "Freigabeentscheidungen von Troubleshooting-Neugier trennen.", "Wenn Evidence fehlt, Eintrag blockiert lassen statt freizugeben."],
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
          title: "Offenlegung bewusst wählen",
          body: "Settings steuert, wie viel operativer Kontext die Konsole in allen Workspaces zeigt.",
          points: ["Basis für normale geführte Arbeit nutzen.", "Expert aktivieren, wenn Route, Diagnostik oder IDs nötig sind.", "Sichtbarkeit ändert keine Backend-Autorität.", "Nach Debugging in den Modus zurückkehren, der die Hauptaufgabe am klarsten hält."],
        },
        {
          eyebrow: "Identität",
          title: "Identität von Verbindung trennen",
          body: "Connection-Karten zeigen, ob backend-owned Integrationen konfiguriert und bereit sind.",
          points: ["Backend-Health prüfen, bevor ein Workspace verdächtigt wird.", "GitHub- und Matrix-Karten für configured, connected oder blocked Status nutzen.", "User-Credentials nicht aus Browser-Zustand ableiten.", "Bei fehlender Verbindung den backend-owned Auth-Flow nutzen statt Secrets einzufügen."],
        },
        {
          eyebrow: "Modelle",
          title: "Modellaliase sind öffentliche Routing-Eingaben",
          body: "Settings zeigt öffentliche Alias-Metadaten; Provider-IDs und Credentials bleiben server-owned.",
          points: ["Aktiven Alias nutzen, um aktuelle Chat-Routing-Eingabe zu verstehen.", "Registrierte Modellanzahl ist sichere Metadaten, keine Provider-Konfiguration.", "OpenRouter-Modell hinzufügen erzeugt nur dann eine öffentliche Alias-Fläche, wenn Backend-Policy es erlaubt.", "Provider-Ziele nie als Browser-Wahrheit behandeln oder in sichtbaren Status kopieren."],
        },
        {
          eyebrow: "Diagnostik",
          title: "Diagnostik als Evidence nutzen",
          body: "Diagnostik erklärt Runtime-Zustand, Routing-Policy, Zähler und sicheren operativen Status.",
          points: ["Diagnostik öffnen, wenn ein Workspace checking, unavailable, stale oder blocked meldet.", "Fallback, fail-closed und Rate-Limit-Status vor Retry lesen.", "Zähler sind aggregierte Evidence und sollen keine Prompts oder Tokens enthalten.", "Lokale Diagnostik löschen, wenn sie der aktuellen Untersuchung nicht mehr hilft."],
        },
        {
          eyebrow: "Journal",
          title: "Backend-owned Belege prüfen",
          body: "Journal-Einträge fassen aktuelle Backend-Ereignisse zusammen, ohne Prompt-Inhalte oder Secrets zu speichern.",
          points: ["Recent Entries nutzen, um accepted, blocked, executed oder verified Backend-Ereignisse zu verstehen.", "Outcome und Severity prüfen, bevor retry entschieden wird.", "Fehlender Journal-Zugriff ist unavailable Evidence, kein Erfolg.", "Source-Filter nutzen, wenn das Problem zu Chat, GitHub, Matrix, Auth oder Rate-Limits gehört."],
        },
        {
          eyebrow: "Safety",
          title: "Lokaler Restore ist keine frische Wahrheit",
          body: "Settings macht die Grenze zwischen Browser-Zustand und Backend-Wahrheit sichtbar.",
          points: ["Restored Sessions sind nur lokale Kontinuität.", "Backend-Health, Integrationen und Diagnostik sind die frischen Autoritätsflächen.", "Wenn lokaler Zustand mit Backend-Status kollidiert, Backend-Status folgen.", "Credentials, Tokens oder Matrix-Secrets nie in browser-sichtbaren Feldern speichern."],
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

export function GuideOverlay({ content, testId, ctaClassName }: GuideOverlayProps) {
  const [open, setOpen] = useState(false);
  const [activeCardIndex, setActiveCardIndex] = useState(0);
  const [pointerStartX, setPointerStartX] = useState<number | null>(null);
  const wheelLockRef = useRef(false);
  const wheelLockTimerRef = useRef<number | null>(null);
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

  useEffect(() => () => {
    if (wheelLockTimerRef.current !== null) {
      window.clearTimeout(wheelLockTimerRef.current);
    }
  }, []);

  function moveCard(delta: -1 | 1) {
    setActiveCardIndex((current) => clampCardIndex(current + delta, content.cards.length));
  }

  function handlePointerUp(event: PointerEvent<HTMLElement>) {
    if (pointerStartX === null) {
      return;
    }

    const delta = event.clientX - pointerStartX;
    setPointerStartX(null);

    if (Math.abs(delta) < 44) {
      return;
    }

    moveCard(delta < 0 ? 1 : -1);
  }

  function handleWheelNavigation(event: WheelEvent<HTMLElement>) {
    const axisDelta = Math.abs(event.deltaX) > Math.abs(event.deltaY) ? event.deltaX : event.deltaY;
    if (Math.abs(axisDelta) < 16) {
      return;
    }

    event.preventDefault();

    if (wheelLockRef.current) {
      return;
    }

    wheelLockRef.current = true;
    if (wheelLockTimerRef.current !== null) {
      window.clearTimeout(wheelLockTimerRef.current);
    }
    wheelLockTimerRef.current = window.setTimeout(() => {
      wheelLockRef.current = false;
      wheelLockTimerRef.current = null;
    }, 180);

    moveCard(axisDelta > 0 ? 1 : -1);
  }

  return (
    <>
      <button
        type="button"
        className={`secondary-button guide-cta${ctaClassName ? ` ${ctaClassName}` : ""}`}
        data-testid={testId}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={() => setOpen(true)}
      >
        {content.ctaLabel}
      </button>
      {open ? (
        <div className="guide-overlay-backdrop" onPointerDown={() => setOpen(false)}>
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="guide-overlay"
            onPointerDown={(event) => event.stopPropagation()}
            onWheel={handleWheelNavigation}
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
              aria-label={`${activeCard.eyebrow}: ${activeCard.title}`}
              tabIndex={0}
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
                onClick={() => moveCard(-1)}
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
                onClick={() => moveCard(1)}
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
