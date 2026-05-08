# MozaicStacked / Mosaic Obsidian Knowledge Audit Log

## 1. Result
- Status: partial
- Kurzfazit: `Observed` es existiert eine klare, aber verteilte Markdown-Wissensschicht (24 Dateien) mit starkem Fokus auf Architektur-/Governance-/Implementierungsdokumentation; `Inferred` eine Community-Content-Schicht (Raw Sources, Discord, Prompt-Cards, Tool-Dossiers) ist noch kaum als eigene Struktur ausgebildet.
- Wichtigster Strukturfund: `Observed` die Wissensbasis ist in vier Ebenen verteilt: `README/AGENTS` (Frontdoor/Contract), `system/` (Regeln/Map), `projects/console-overlay/` (Projekttruth + Daily), `docs/` (tiefe Fachdokumente).
- Wichtigstes Risiko: `Observed` gemischte Namens- und Wahrheitsebenen (`MosaicStacked` vs. `ModelGate`, lokal verifiziert vs. contract-only) in denselben Dokumentbereichen können spätere Community-Nutzung und Reuse verwässern.
- Wichtigste nächste menschliche Entscheidung: `Recommended` verbindlich festlegen, welche Inhalte als Community-Knowledge-Kern gelten und welche rein interne Engineering-/Contract-Dokumentation bleiben.

## 2. Scope
- Geprüfter Vault / Pfad: `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack`
- Geprüfte MozaicStacked-/Mosaic-relevante Ordner:
  - `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/docs`
  - `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/system`
  - `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/projects/console-overlay`
  - `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/server` (`README.md`)
  - `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/icon_favico_bundle` (`README.md`)
  - Repo-Frontdoor: `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/README.md`, `/home/baum/Schreibtisch/workspace/main_projects/mosaicStack/AGENTS.md`
- Geprüfte Dateien:
  - `AGENTS.md`
  - `README.md`
  - `system/index.md`
  - `system/repo-map.md`
  - `system/file-conventions.md`
  - `system/working-rules.md`
  - `projects/console-overlay/project.md`
  - `projects/console-overlay/context.md`
  - `projects/console-overlay/decisions.md`
  - `projects/console-overlay/daily/2026-04-21.md`
  - `server/README.md`
  - `docs/settings-login-adapter-mapping.md`
  - `docs/model-routing.md`
  - `docs/routing-matrix.md`
  - `docs/vercel-deployment.md`
  - `docs/matrix-room-taxonomy.md`
  - `docs/integration-auth-rotation-live-smoke.md`
  - `docs/modelgate-smoke.md`
  - `docs/ux-workflow-continuity-plan.md`
  - `docs/implementation-plan.md`
  - `docs/ui-spec.md`
  - `docs/matrix-evidence-room-write-contract.md`
  - `docs/test-matrix.md`
  - `icon_favico_bundle/README.md`
- Ausgelassene Bereiche:
  - `node_modules/`, Build-Artefakte, Runtime-Code (`server/src`, `web/src`), Binärbilder, `.env`/Secrets-Dateien
- Gründe für Auslassungen:
  - `Observed` Audit-Ziel ist Obsidian-/Markdown-Struktur-Mapping, nicht Code-/Runtime-Review.
  - `Observed` sensible Bereiche (Credentials/Secrets) wurden nicht ausgelesen.

## 3. Existing Mosaic Structure Map

```text
mosaicStack/
  AGENTS.md
  README.md
  system/
    index.md
    repo-map.md
    file-conventions.md
    working-rules.md
  projects/
    console-overlay/
      project.md
      context.md
      decisions.md
      daily/
        2026-04-21.md
  docs/
    implementation-plan.md
    integration-auth-rotation-live-smoke.md
    matrix-evidence-room-write-contract.md
    matrix-room-taxonomy.md
    model-routing.md
    modelgate-smoke.md
    routing-matrix.md
    settings-login-adapter-mapping.md
    test-matrix.md
    ui-spec.md
    ux-workflow-continuity-plan.md
    vercel-deployment.md
  server/
    README.md
  icon_favico_bundle/
    README.md
```

`Observed` relevante Inhalte sind verteilt (kein separater `mosaic/`- oder `obsidian/`-Vault-Ordner).

## 4. Content Type Mapping

| Datei/Ordner | Inhaltstyp | Zweck | Zustand | Empfehlung |
|---|---|---|---|---|
| `README.md` | repo note | Projekt-Frontdoor, Positionierung, Status | useful | Als kanonischen Produkt-Einstieg behalten; später Community-Extrakte ableiten |
| `AGENTS.md` | repo note | Operating Contract / Authority Boundary | useful | Als Governance-Quelle beibehalten, nicht mit Community-Content mischen |
| `system/index.md` | report | Regelindex und Referenzrouting | useful | Als internes Steuerdokument belassen |
| `system/repo-map.md` | report | Repo-Map, authoritative vs derived Flächen | useful | Für späteres Knowledge-Indexing nutzen |
| `system/file-conventions.md` | power-user guide | Doku-Struktur- und Naming-Regeln | useful | Als Konventionsquelle für spätere Obsidian-Struktur verwenden |
| `system/working-rules.md` | power-user guide | Arbeits-/Fail-Closed-Regeln | useful | Für Workflow-Governance referenzieren |
| `projects/console-overlay/project.md` | repo note | Ziel/Scope/Status/Nächste Gates | useful | Als Projekt-Kernblatt beibehalten |
| `projects/console-overlay/context.md` | report | Current Truth + Gaps | useful | Für regelmäßige Truth-Snapshots nutzen |
| `projects/console-overlay/decisions.md` | report | Durable Decisions | useful | Kandidat für späteres Decision-Log-Template |
| `projects/console-overlay/daily/2026-04-21.md` | report | Tageslog | mixed | Nur Journal, nicht als Produkttruth wiederverwenden |
| `server/README.md` | tool note | Backend-Contract, API, Routing, Security-Posture | useful | Grundlage für Tool-/Backend-Dossier |
| `docs/model-routing.md` | tool dossier candidate | Modellrouting-Authority und Contract | useful | Als Tool-Intelligence-Baustein markieren |
| `docs/routing-matrix.md` | tool note | Browser/API/Server Ownership Matrix | useful | Für Governance-/Security-Erklärung extrahieren |
| `docs/settings-login-adapter-mapping.md` | tool note | Adapter-Modell für Integrationen | useful | Kandidat für Integrations-Guide (Beginner + Builder) |
| `docs/vercel-deployment.md` | repo note | Deployment-Topologie und Checks | useful | Als Ops-Referenz bündeln |
| `docs/implementation-plan.md` | report | Implementierungsstand + Gaps | useful | Für Release-/Roadmap-Digest verwendbar |
| `docs/ux-workflow-continuity-plan.md` | workflow prompt | UX-Workflow-Slice inkl. Validierungsplan | useful | Kandidat für Workflow-Template |
| `docs/ui-spec.md` | webapp copy | UI-Spezifikation inkl. Interaction-Muster | useful | Quelle für Webapp-Handbook/Landing-Claims |
| `docs/test-matrix.md` | power-user guide | Verifikationsmatrix + Statusmodell | useful | Als QA-/Trust-Cheatsheet aufbereitbar |
| `docs/matrix-room-taxonomy.md` | community post | Zielbild für Community-Raumstruktur | draft | Vor externer Nutzung strikt als „target architecture“ labeln |
| `docs/matrix-evidence-room-write-contract.md` | tool dossier candidate | Contract für Evidence-Room-Writes | draft | Nur mit klarer Contract-Only-Markierung reuse |
| `docs/integration-auth-rotation-live-smoke.md` | experiment | Live-Smoke-Prozedur für Credentials-Rotation | useful | Kandidat für Sicherheits-Runbook |
| `docs/modelgate-smoke.md` | report | einzelner Smoke-Lauf-Output | stale | Mit Quelle/Datum/Owner kontextualisieren oder archivieren |
| `icon_favico_bundle/README.md` | webapp copy | Icon-Bundle-Nutzung für Webapp | useful | In Webapp-Handbook-Sektion auslagern |

## 5. Community-Knowledge Potential

| Inhalt | Mögliche spätere Form | Zielgruppe | Reifegrad | Risiko |
|---|---|---|---|---|
| `docs/matrix-room-taxonomy.md` | Beginner Guide | Community | mittel | Zielbild kann als bereits implementiert missverstanden werden |
| `docs/matrix-room-taxonomy.md` | Discord-Post | Community | niedrig | Ohne Live-Status droht Overclaim |
| `docs/ui-spec.md` | Webapp Handbook Section | Builder | hoch | Sehr umfangreich, braucht Verdichtung |
| `docs/implementation-plan.md` | Weekly Digest | Internal only | mittel | enthält gemischte Verified/Deferred Ebenen |
| `docs/model-routing.md` | Tool-Dossier | Prompt Engineer | mittel | technische Tiefe braucht Einordnung für Nicht-Dev-Leser |
| `docs/settings-login-adapter-mapping.md` | Tutorial | Beginner | mittel | muss verkürzt und jargonärmer werden |
| `docs/test-matrix.md` | Power-User Cheatsheet | Power User | mittel | hoher Detailgrad, Risiko von Informationsüberlastung |
| `server/README.md` | Repo-Review | Builder | mittel | Sicherheits-/Env-Details sollten redigiert werden |
| `projects/console-overlay/decisions.md` | Experiment Note | Internal only | mittel | knapper Inhalt braucht Kontext-Links |
| `icon_favico_bundle/README.md` | Landingpage Section | Founder | niedrig | branding-/asset-fokussiert, geringer Knowledge-Wert allein |

## 6. Prompt and Workflow Candidates

1. Name: Matrix Posting/Routing Prompt-Seed
   Quelle / Datei: `docs/matrix-room-taxonomy.md`
   Aktueller Zustand: draft
   Mögliche Nutzung: Rollenprompt für Community-Routing („wo posten“, „wie klassifizieren“)
   Muss vor Nutzung bereinigt werden? ja
   Risiko bei direkter Wiederverwendung: target architecture könnte als Live-Struktur fehlinterpretiert werden

2. Name: Settings Integration Workflow Prompt
   Quelle / Datei: `docs/settings-login-adapter-mapping.md`
   Aktueller Zustand: useful
   Mögliche Nutzung: Workflow-Prompt für sichere Adapter-Implementierung/Review
   Muss vor Nutzung bereinigt werden? nein
   Risiko bei direkter Wiederverwendung: mittlerer Jargon-Level für Beginner

3. Name: Model-Routing Governance Prompt
   Quelle / Datei: `docs/model-routing.md`
   Aktueller Zustand: useful
   Mögliche Nutzung: Agentenprompt für fail-closed Routing-Checks
   Muss vor Nutzung bereinigt werden? nein
   Risiko bei direkter Wiederverwendung: kann produkt-/repo-spezifisch zu eng sein

4. Name: UX Continuity Workflow Blueprint
   Quelle / Datei: `docs/ux-workflow-continuity-plan.md`
   Aktueller Zustand: useful
   Mögliche Nutzung: Multi-Step Workflow-Prompt für UI-Iteration mit Validierung
   Muss vor Nutzung bereinigt werden? nein
   Risiko bei direkter Wiederverwendung: veraltet, wenn IA sich ändert

5. Name: Matrix Evidence Write Workflow
   Quelle / Datei: `docs/matrix-evidence-room-write-contract.md`
   Aktueller Zustand: draft
   Mögliche Nutzung: Prompt für execute/verify/evidence-Phasen
   Muss vor Nutzung bereinigt werden? ja
   Risiko bei direkter Wiederverwendung: contract-only Flows ohne echte Backend-Verifikation

6. Name: Verification Matrix Prompt Scaffold
   Quelle / Datei: `docs/test-matrix.md`
   Aktueller Zustand: useful
   Mögliche Nutzung: Audit-/QA-Prompt-Template (Statuslegend, Gate-Checks)
   Muss vor Nutzung bereinigt werden? nein
   Risiko bei direkter Wiederverwendung: groß, wenn Statusstände nicht aktualisiert sind

## 7. Tool and Repo Intelligence Candidates

1. Tool / Repo: Backend Model Routing
   Quelle / Datei: `docs/model-routing.md`
   Warum relevant? Klare Authority-Chain + öffentliche Contract-Oberflächen
   Möglicher Nutzen für MozaicStacked: Grundlage für model-agnostische Tool-Erklärung
   Reifegrad: mittel-hoch
   Offene Prüffragen: Stimmen alle genannten Felder mit aktuellem Runtime-Code überein?

2. Tool / Repo: Integration Login Adapter Layer
   Quelle / Datei: `docs/settings-login-adapter-mapping.md`
   Warum relevant? Explizite Browser-safe Adapter-Struktur
   Möglicher Nutzen für MozaicStacked: Tool-Dossier für sichere Integrations-UX
   Reifegrad: mittel
   Offene Prüffragen: Welche Adapterzustände sind produktiv beobachtet vs. nur dokumentiert?

3. Tool / Repo: Routing Ownership Matrix
   Quelle / Datei: `docs/routing-matrix.md`
   Warum relevant? Endpunkt-Ownership und Secret-Boundary sichtbar
   Möglicher Nutzen für MozaicStacked: Repo-Review-Material für Security-/Governance-Kommunikation
   Reifegrad: mittel-hoch
   Offene Prüffragen: Sind alle Route-Mappings noch drift-frei zu `vercel.json`/Server?

4. Tool / Repo: Matrix Evidence Write Contract
   Quelle / Datei: `docs/matrix-evidence-room-write-contract.md`
   Warum relevant? präziser Contract für Audit-/Evidence-Schicht
   Möglicher Nutzen für MozaicStacked: Baustein für späteres Tool-Dossier „Governed Matrix Writes“
   Reifegrad: niedrig-mittel
   Offene Prüffragen: Wann wird aus contract-only ein verifizierter Produktpfad?

5. Tool / Repo: Test Matrix
   Quelle / Datei: `docs/test-matrix.md`
   Warum relevant? Aggregiert Testabdeckung, manuelle Lücken, Contract-Status
   Möglicher Nutzen für MozaicStacked: Grundlage für Repo-Review/Trust-Transparenz
   Reifegrad: hoch
   Offene Prüffragen: Welche `implemented-but-manual` Cases sollen zuerst automatisiert werden?

6. Tool / Repo: Vercel Deployment Surface
   Quelle / Datei: `docs/vercel-deployment.md`
   Warum relevant? Produktiver Deployment-Contract + Verification Checklist
   Möglicher Nutzen für MozaicStacked: Dossier für „How this stack ships“
   Reifegrad: mittel
   Offene Prüffragen: Gibt es einen aktuellen live-verified Deployment-Report pro Release?

## 8. Beginner vs Power-User Mapping

| Inhalt | Beginner | Power User | Begründung | Empfohlene spätere Form |
|---|---|---|---|---|
| `README.md` | hoch | mittel | narrativer Einstieg, wenig Umsetzungstiefe | Beginner Guide |
| `docs/ui-spec.md` | mittel | hoch | teils erklärend, teils sehr detailreich | Webapp Handbook Section |
| `docs/settings-login-adapter-mapping.md` | mittel | hoch | gutes Modell, aber technisch | Tutorial + Power-User Anhang |
| `docs/model-routing.md` | niedrig | hoch | klar technisch/governance-lastig | Power-User Cheatsheet |
| `docs/routing-matrix.md` | niedrig | hoch | Contract-/Endpoint-Matrix | Tool-Dossier |
| `docs/test-matrix.md` | niedrig | hoch | QA-/Statusmodell mit hoher Dichte | Power-User Guide |
| `docs/matrix-room-taxonomy.md` | hoch | mittel | Community-Struktur und Posting-Routing | Beginner Guide |
| `projects/console-overlay/project.md` | mittel | mittel | kompakter Scope/Status | Digest-Intro |
| `projects/console-overlay/context.md` | niedrig | mittel | setzt Vorwissen voraus | Internal Snapshot |
| `system/*` | niedrig | hoch | interne Governance-Konventionen | Internal only |

## 9. Webapp / Landingpage Related Findings

1. Datei: `docs/ui-spec.md`
   Inhalt: umfassende Feature-/Komponenten-/Tab-/State-Beschreibungen inkl. Chat, Matrix, Review, Accessibility
   Eignet sich für Webapp, Landingpage, Handbook oder Cheatsheet? Webapp Handbook + Teile für Landingpage Features
   Muss gekürzt, vereinfacht oder umgeschrieben werden? ja (stark kürzen für externe Kommunikation)

2. Datei: `README.md`
   Inhalt: Produktpositionierung, Value Proposition, Trust Boundaries, Status
   Eignet sich für Webapp, Landingpage, Handbook oder Cheatsheet? Landingpage Section + Handbook Intro
   Muss gekürzt, vereinfacht oder umgeschrieben werden? ja (marketingtaugliche Kurzfassungen)

3. Datei: `docs/implementation-plan.md`
   Inhalt: Next Slices, Gaps, Acceptance Criteria
   Eignet sich für Webapp, Landingpage, Handbook oder Cheatsheet? Webapp Handbook Section (intern)
   Muss gekürzt, vereinfacht oder umgeschrieben werden? ja (Roadmap-Sprache vereinfachen)

4. Datei: `docs/ux-workflow-continuity-plan.md`
   Inhalt: User Actions, Workflow-Übergänge, Validierungsplan
   Eignet sich für Webapp, Landingpage, Handbook oder Cheatsheet? Webapp Handbook + Power-User Cheatsheet
   Muss gekürzt, vereinfacht oder umgeschrieben werden? ja

5. Datei: `docs/matrix-room-taxonomy.md`
   Inhalt: Onboarding-Rooms, Where-to-post, Community-Routing
   Eignet sich für Webapp, Landingpage, Handbook oder Cheatsheet? Beginner-Onboarding + Community-Handbook
   Muss gekürzt, vereinfacht oder umgeschrieben werden? ja (klarer „target only“-Hinweis nötig)

6. Datei: `icon_favico_bundle/README.md`
   Inhalt: Asset-/Icon-Nutzung
   Eignet sich für Webapp, Landingpage, Handbook oder Cheatsheet? Webapp Handbook (Assets)
   Muss gekürzt, vereinfacht oder umgeschrieben werden? nein (bereits knapp)

## 10. Structural Issues

| Befund | Datei/Ordner | Problem | Risiko | Review-Frage |
|---|---|---|---|---|
| Namensdrift `MosaicStacked` vs `ModelGate` | `docs/matrix-room-taxonomy.md`, `docs/modelgate-smoke.md`, `docs/ui-spec.md`, `README.md` | Uneinheitliche Produktidentität | Verwirrung bei Community- und Tool-Dossiers | Welcher Name ist künftig kanonisch, und wo gilt Legacy? |
| Verteilte Frontdoors | `README.md`, `AGENTS.md`, `system/index.md`, `projects/console-overlay/project.md` | Einstieg über mehrere Ebenen | Uneinheitliche Onboarding-Pfade | Welche Datei ist „single frontdoor“ für neue Contributors? |
| Gemischte Wahrheitsebenen in Fachdokumenten | v. a. `docs/*` | verified/contract-only/deferred stehen nebeneinander | Overclaim bei Wiederverwendung | Soll jede Datei verpflichtend eine Truth-Box haben? |
| Community-Zielbild ohne klare Live-Abgrenzung im Alltag | `docs/matrix-room-taxonomy.md` | target architecture kann wie Ist-Zustand wirken | Falsche Community-Erwartungen | Braucht es ein standardisiertes „Not implemented yet“-Banner? |
| Kein eigener Raw-Source-Bereich | gesamtes Markdown-Set | Quellen, Links, Experimente, Outputs nicht klar getrennt | spätere Digest-/Card-Pipeline schwer | Wo soll künftig Raw Intake liegen (`sources/`)? |
| Prompt-Material implizit statt explizit | `docs/ux-workflow-continuity-plan.md`, `docs/model-routing.md` | Prompt-/Workflow-Bausteine sind verteilt | Wiederverwendung kostet manuelle Extraktion | Soll ein `prompts/`-Index eingeführt werden? |
| Beginner- und Power-User-Ebenen teils vermischt | `README.md`, `docs/ui-spec.md`, `docs/test-matrix.md` | Anspruchsniveaus wechseln innerhalb derselben Datei | Einstiegshürde für Beginner | Brauchen wir pro Datei ein Zielgruppenlabel? |
| Einzel-Report ohne Kontextkette | `docs/modelgate-smoke.md` | kurzer Smoke-Output ohne Link auf Input/Validierung | schwer überprüfbar, potenziell stale | Soll jeder Report ein Pflicht-Metadaten-Header bekommen? |
| Webapp-nahe Inhalte verstreut | `README.md`, `docs/ui-spec.md`, `docs/ux-workflow-continuity-plan.md`, `icon_favico_bundle/README.md` | kein einheitlicher Webapp-Handbook-Einstieg | redundante Pflege | Welche Datei wird später Webapp-Handbook-Root? |
| Sensible Kategorien erwähnt, aber nicht zentral klassifiziert | mehrere `docs/*`, `server/README.md` | Security-Hinweise verteilt | inkonsistente Redaktion bei Public Reuse | Soll es ein zentrales „public redaction policy“-Dokument geben? |

## 11. Suggested Mosaic Target Map

Noch keine Umsetzung. Nur Vorschlag.

```text
mosaic/
  index.md
  sources/
  ai-news/
  prompts/
  prompt-cards/
  tools/
  tool-dossiers/
  repos/
  repo-reviews/
  discord/
  community-digests/
  webapp-handbook/
  landingpage/
  experiments/
  archive/
```

| Zielbereich | Zweck | Welche bestehenden Inhalte könnten passen? | Welche Inhalte brauchen menschliche Bewertung? | Was darf nicht automatisch verschoben werden? |
|---|---|---|---|---|
| `index.md` | zentrale Frontdoor | `README.md`, `system/index.md` (Auszüge) | Frontdoor-Hierarchie | `README.md` komplett |
| `sources/` | Rohquellen-Inbox | derzeit kaum direkte Kandidaten | Definition, was als Raw Source gilt | sensible/private Notizen |
| `ai-news/` | News-Sammlung | aktuell keine klaren Dateien | Relevanzkriterien | ungeprüfte externe Claims |
| `prompts/` | operative Prompts | Auszüge aus `docs/model-routing.md`, `docs/ux-workflow-continuity-plan.md` | Bereinigung/Generalisierung | contract-only Claims ohne Label |
| `prompt-cards/` | kuratierte Prompt-Cards | abgeleitet aus `prompts/` | Qualitätskriterien | Rohprompts ungeprüft |
| `tools/` | Tool-Notizen | `docs/settings-login-adapter-mapping.md`, `docs/model-routing.md` | Zielgruppe/Abstraktion | sicherheitskritische Details unverändert |
| `tool-dossiers/` | strukturierte Tool-Reviews | `docs/routing-matrix.md`, `docs/matrix-evidence-room-write-contract.md` | Reifegrad je Dossier | ungeprüfte Implementierungsannahmen |
| `repos/` | Repo-bezogene Notizen | `projects/console-overlay/*`, `system/repo-map.md` | Was intern bleiben muss | Daily-Logs ohne Kontext |
| `repo-reviews/` | veröffentlichbare Reviews | `docs/test-matrix.md`, `docs/implementation-plan.md` (abgeleitet) | Public/Private Abgrenzung | interne Prüfdetails mit Sensitivität |
| `discord/` | Community-Rohthreads | aktuell keine direkten Funde | Intake-Prozess | private Handles/PII |
| `community-digests/` | kuratierte Zusammenfassungen | später aus `discord/`, `sources/`, `repos/` | Redaktionsfreigabe | ungeprüfte Aussagen |
| `webapp-handbook/` | produktnahe Nutzdoku | `docs/ui-spec.md`, `docs/ux-workflow-continuity-plan.md`, `icon_favico_bundle/README.md` | Kürzung & Zielgruppen-Split | technische Tiefenteile 1:1 |
| `landingpage/` | externe Produktbotschaft | `README.md`-Auszüge | Messaging/Prioritäten | interne Contract-Details |
| `experiments/` | Experimente und Smokes | `docs/integration-auth-rotation-live-smoke.md`, `docs/modelgate-smoke.md` | Gültigkeit/Verfallsregeln | Reports ohne Metadaten |
| `archive/` | veraltete/ersetzte Inhalte | `docs/modelgate-smoke.md` potenziell | Archivierungsregeln | aktive kanonische Dateien |

## 12. Human Review Questions

1. Welcher Produktname ist kanonisch: `MosaicStacked`, `MozaicStacked` oder `ModelGate`?
2. Welche Datei ist die primäre Frontdoor für neue Community-Mitwirkende?
3. Soll `README.md` eher Produkt-/Community-Einstieg oder Developer-Contract sein?
4. Welche Inhalte aus `system/*` dürfen später öffentlich sichtbar sein?
5. Was gilt verbindlich als „Raw Source“ im zukünftigen Knowledge-Flow?
6. Soll es eine dedizierte Intake-Policy für externe Links/Videos/Threads geben?
7. Welche Mindestmetadaten braucht jede Quelle (Datum, Autor, Ursprung, Prüfflag)?
8. Welche Teile von `docs/matrix-room-taxonomy.md` sind Vision, welche sind bereits real?
9. Welche Prompt-Bausteine dürfen ohne technische Nachbearbeitung wiederverwendet werden?
10. Welche Prompt-Bausteine müssen vor Reuse anonymisiert/vereinfacht werden?
11. Welche Tool-Notizen haben Priorität für ein erstes Tool-Dossier?
12. Welche Repo-Notizen sind intern, welche potenziell öffentlich?
13. Welche Kriterien entscheiden, ob etwas „Beginner“ oder „Power User“ ist?
14. Soll jede Datei künftig ein Zielgruppenlabel tragen?
15. Welche Inhalte aus `docs/ui-spec.md` eignen sich direkt für Landingpage-Copy?
16. Welche Inhalte aus `docs/ui-spec.md` gehören ausschließlich ins interne Handbook?
17. Wie soll mit `contract-only` Inhalten bei externer Kommunikation umgegangen werden?
18. Welche `implemented-but-manual` Bereiche aus `docs/test-matrix.md` haben höchste Priorität?
19. Soll `docs/modelgate-smoke.md` als archiviertes Einzelartefakt markiert werden?
20. Welche sensiblen Kategorien (Credential-/Token-/Security-Details) brauchen zentrale Redaktionsregeln?
21. Wie wird verhindert, dass Daily-Logs als kanonische Wahrheit zitiert werden?
22. Welche Inhalte sollen als erste `Prompt-Card`-Kandidaten markiert werden?
23. Welche Inhalte sollen als erste `Tool-Dossier`-Kandidaten markiert werden?
24. Welche Inhalte sollen als erste `Repo-Review`-Kandidaten markiert werden?
25. Ab welchem Review-Gate darf ein Inhalt von intern zu halböffentlich/öffentlich wandern?

## 13. Recommended Next Iteration

1. `Recommended` Schreibweise und Scope final festlegen (`MosaicStacked`/`ModelGate`, intern vs. öffentlich).
2. `Recommended` Raw Sources strikt von Outputs trennen (zuerst nur markieren/taggen, nichts verschieben).
3. `Recommended` Prompt-/Tool-/Repo-Kandidaten in den bestehenden Dateien per einheitlichem Labelsystem kennzeichnen.
4. `Recommended` Beginner- vs. Power-User-Eignung je Datei markieren (mindestens eine Zeile Metadaten pro Datei).
5. `Recommended` Erst nach menschlichem Review eine Zielstruktur (`mosaic/`) umsetzen und Migrationsreihenfolge festlegen.
