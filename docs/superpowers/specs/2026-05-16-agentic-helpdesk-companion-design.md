---
title: Agentic Helpdesk Companion Design
page_type: project
status: proposed
authority: proposed
owner: browser
updated: 2026-05-16
tags:
  - "#chat"
  - "#ux"
  - "#authority"
  - "#companion"
---

# Agentic Helpdesk Companion Design

## Zweck

Der Helpdesk Companion wird von einem einfachen Floating-Fragefeld zu einem agentischen, aber strikt begrenzten Orientierungssystem für MosaicStacked ausgebaut.

Er dient als App-Benutzerhandbuch, Ratgeber, Status-Erklärer und UI-Hilfe. Er darf Nutzer durch vorhandene Flächen führen, sichere Vorschläge machen, Eingaben vorbereiten und Read-only-Checks anstoßen. Er darf keine externen Schreib- oder Ausführungsaktionen starten und keine bestehenden Approval-Gates umgehen.

## Authority

Observed: `AGENTS.md` definiert Backend-Authority für Provider Calls, SSE, Modellrouting und Ausführung.

Observed: `README.md` beschreibt die aktuelle App als backend-first console overlay mit Browser-UI.

Observed: `docs/model-routing.md` beschreibt `default-free` als öffentliche Alias-Fläche ohne Provider-ID-Leak.

Observed: `web/src/components/FloatingCompanion.tsx` enthält aktuell Panel, Quick-Actions, Einzeilen-Input und lokale Antwortanzeige.

Observed: `web/src/App.tsx` verbindet den Companion mit `/chat` über `DEFAULT_FREE_MODEL_ALIAS`.

Inferred: Der sichere Ausbau muss browserseitig erlaubte UI-Intents typisieren und jeden unbekannten Intent blockieren.

## Zielbild

Der Companion ist ein guided operator. Er erkennt Fragen zur App, zur aktuellen Oberfläche, zum nächsten Schritt, zu Fehlermeldungen und zu MosaicStacked-Konzepten. Er erklärt den Zustand in Benutzersprache und bietet kontextnahe UI-Hilfe an.

Er ist kein autonomer Executor. GitHub-Ausführung, Matrix-Schreiben, Credential-Änderungen und externe Mutationen bleiben in den bestehenden Workspaces und Approval-Flows.

## Nicht-Ziele

- Keine direkte GitHub-Ausführung aus dem Companion.
- Keine direkte Matrix-Write- oder Execute-Route aus dem Companion.
- Keine Anzeige von Secrets, Tokens, Cookies, API-Keys oder Provider-Zielmodellen.
- Keine freie Route-/Tool-Ausführung aus LLM-Text.
- Keine Promotion von lokal restauriertem Browser-State zu backend-frischer Wahrheit.
- Keine Reparatur malformed SSE-, Matrix- oder GitHub-Antworten.

## Erlaubte Companion-Intents

Companion-Aktionen werden als Allowlist modelliert. Alles außerhalb dieser Liste ist blockiert.

| Intent | Wirkung | Authority |
| --- | --- | --- |
| `navigate_tab` | Öffnet `chat`, `workbench`, `matrix` oder `settings` | Browser-UI |
| `open_panel` | Öffnet sichere vorhandene UI-Flächen wie Command Palette oder Settings-Hilfe | Browser-UI |
| `prefill_chat` | Bereitet Text im Chat-Composer vor | Browser-UI, keine Ausführung |
| `prefill_matrix_draft` | Bereitet Matrix-Draft vor | Browser-UI, kein Senden |
| `explain_status` | Erklärt Backend-, Modell-, GitHub- oder Matrix-Status | Read-only |
| `start_safe_check` | Startet bestehende Read-only-Status-Refreshes | Backend Read-only |
| `show_step_guide` | Zeigt eine Schrittfolge zur aktuellen Aufgabe | Browser-UI |

## Verbotene Companion-Intents

Verbotene Intents werden sichtbar blockiert und nicht stillschweigend umgedeutet.

| Intent | Grund |
| --- | --- |
| `github_execute` | Bestehendes GitHub-Approval-Gate darf nicht umgangen werden |
| `matrix_execute` | Matrix-Schreiben bleibt approval-gated und backend-owned |
| `matrix_write` | Kein Browser-Write an Matrix |
| `credentials_read` | Secrets dürfen nie als UI-Wahrheit erscheinen |
| `credentials_write` | Credential-Änderungen gehören in Settings mit expliziter Eingabe |
| `provider_target_select` | Provider-IDs sind keine UI-Wahrheit |
| `raw_route_call` | Keine freie Route-Ausführung aus Companion-Text |

## Datenfluss

1. Der Browser baut einen redigierten Companion-Kontext.
2. Der Companion sendet User-Frage und Kontext an die bestehende Chat-Schicht.
3. Die Antwort wird als erklärender Text gerendert.
4. UI-Vorschläge werden aus erlaubten Intents abgeleitet und lokal validiert.
5. Der Nutzer klickt eine sichtbare Companion-Aktion.
6. `App.tsx` führt nur erlaubte Browser-UI-Effekte aus.
7. Verbotene oder unbekannte Intents werden blockiert und erklärt.

## Companion-Kontext

Der Kontext enthält nur sichere, begrenzte Fakten:

- aktueller Workspace;
- Work Mode;
- Shell-Freshness;
- Backend-Health;
- öffentlicher Modell-Alias;
- GitHub-/Matrix-Verbindungsstatus;
- ausgewählte Session-Metadaten ohne vollständige Inhalte;
- letzte redigierte Journal-Summaries;
- lokale UI-Zielzustände wie aktuell aktive Panels.

Der Kontext enthält keine Secrets, keine Provider-Zielmodelle, keine Cookies, keine Tokens, keine vollständigen Credential-Felder und keine unredigierten externen Inhalte.

## Komponenten

### `web/src/lib/companion-intents.ts`

Definiert erlaubte Intent-Typen, verbotene Intent-Typen, Validierung, Normalisierung und Default-Deny-Blocking.

### `web/src/lib/companion-context.ts`

Baut den redigierten Companion-Kontext aus vorhandenen App-Signalen. Die Datei ist rein browserseitig und darf keine Backend-Authority behaupten.

### `web/src/components/FloatingCompanion.tsx`

Rendert Antwortverlauf, Status, vorgeschlagene sichere Aktionen und blockierte Aktionen. Das Panel bleibt klein und verfügbar, darf aber auf Mobile nicht Navigation oder Composer überdecken.

### `web/src/App.tsx`

Hält die Ausführungsgrenze. Nur `App.tsx` mappt validierte Companion-Intents auf konkrete UI-Effekte wie Tab-Wechsel, Status-Refresh oder Draft-Vorbefüllung.

## Erste Umsetzungsscheibe

Die erste Scheibe bleibt bewusst browser-konservativ:

1. Companion-Kontext einführen.
2. Intent-Allowlist und Blocklist einführen.
3. Companion-Antworten mit lokal abgeleiteten UI-Vorschlägen anzeigen.
4. Erlaubte UI-Intents ausführen.
5. Verbotene Intents sichtbar blockieren.
6. Tests für Kontext-Redaktion, Default-Deny und UI-Mapping ergänzen.

Eine spätere `/companion`-Backend-Route kann strukturierte Antworten serverseitig validieren. Sie ist nicht Teil der ersten Scheibe.

## Fehler- und Grenzverhalten

- Backend nicht erreichbar: Companion erklärt Settings-/Verbindungsprüfung und bietet `navigate_tab: settings`.
- Modell nicht verfügbar: Companion erklärt Modellrouting auf Alias-Ebene und bietet Settings-Hilfe.
- GitHub nicht verbunden: Companion erklärt Install/Authorize-Flow und bietet Settings- oder Workbench-Navigation.
- Matrix nicht verbunden: Companion erklärt read-only versus write-gated Flächen und bietet Matrix-/Settings-Navigation.
- Unbekannter Intent: blockieren, protokollierbare Warnung erzeugen, keine Aktion ausführen.
- Verbotener Intent: blockieren und bestehenden approval-gated Workspace als nächsten Schritt nennen.

## Tests

- `web/test/floating-companion.test.ts`: Rendering von Antworten, Vorschlägen, blockierten Aktionen und A11y-Wiring.
- Neuer Test für `companion-context`: keine verbotenen Schlüssel wie `token`, `secret`, `apiKey`, `cookie`, `provider`, `target`.
- Neuer Test für `companion-intents`: Allowlist, Blocklist, Default-Deny.
- App-Source-Test: Companion erhält Kontext, erzeugt UI-Vorschläge und ruft nur validierte Intent-Handler auf.
- Browser-Regression später: GitHub-/Matrix-Hilfe darf navigieren oder Drafts vorbereiten, aber keine Write-/Execute-Aktion starten.

## Review-Status

Observed: Scope ist vom Nutzer bestätigt: agentic mit Restrictions und Guardrails.

Open: Spätere serverseitige `/companion`-Route braucht separates Design, sobald strukturierte LLM-Antworten backend-owned werden sollen.
