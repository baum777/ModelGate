---
title: Agenten Workflow Spec
page_type: schema
status: canonical
authority: canonical
owner: governance
updated: 2026-05-10
tags:
  - "#governance"
  - "#schema"
  - "#agents"
---

# Agenten Workflow Spec

## Zweck

Diese Datei ist die kanonische Schema-Spezifikation fuer agentische Arbeit in diesem Repo. Sie ergaenzt `AGENTS.md` und `WORKFLOW.md`, ersetzt aber keine Runtime-Authority aus `server/`, `web/`, `api/` oder expliziten Contracts.

## Wahrheitsebenen

| Ebene | Bedeutung |
| --- | --- |
| canonical | Verbindliche repo-lokale Wahrheit fuer den benannten Scope |
| log | Chronologischer Verlauf, kein Ersatz fuer kanonische Dateien |
| derived | Orientierung oder Zusammenfassung aus anderen Quellen |
| import | Uebernommenes Material, vor Promotion reviewpflichtig |
| proposed | Vorschlag ohne verbindliche Wirkung |
| verified | Gepruefter Zustand mit konkretem Proof |

## Statussprache

| Status | Verwendung |
| --- | --- |
| Observed | Direkt aus Files, Logs, CLI oder sichtbarem Kontext gelesen |
| Inferred | Plausible Ableitung, nicht direkt belegt |
| Open | Fehlende Entscheidung oder fehlender Nachweis |
| Risk | Potenzielle Reibung, Drift, Authority-Konflikt oder Governance-Luecke |
| Applied | Physisch geschrieben oder geaendert |
| Verified | Nach Aenderung geprueft, mit Proof |
| Blocked | Arbeit darf ohne Klaerung nicht fortgesetzt werden |

## Verbindliche Surfaces

| Pfad | Page-Type | Authority | Rolle |
| --- | --- | --- | --- |
| `README.md` | frontdoor | canonical | Produkt- und Repo-Einstieg |
| `AGENTS.md` | contract | canonical | Operating Contract und Authority Boundary |
| `WORKFLOW.md` | workflow | canonical | Arbeitssequenz und Gate-Regeln |
| `00-schema/AGENTS.md` | schema | canonical | Workflow-Spec, Tags, Page-Types, Frontmatter-Contract |
| `00-schema/mspr-spec.md` | schema | canonical | MSPR-Packet-Format, Trigger und Review-Logik |
| `02-wiki/index.md` | wiki-index | derived | Flacher Katalog dauerhafter Dokumentationslinks |
| `02-wiki/log.md` | wiki-log | log | Append-only Arbeitslog |
| `03-mspr/packets/` | mspr-packets | proposed | Strukturierte Review-Packets fuer Risiko oder Unsicherheit |
| `system/` | system-docs | derived | Durable Regel-, Map- und Konventionsschicht |
| `docs/` | deep-docs | mixed | Design-, Contract-, Test- und Runbook-Dokumente |

## Frontmatter-Contract

Kanonische, proposed, derived und importierte Markdown-Governance-Dateien sollen Frontmatter verwenden. `02-wiki/index.md` und `02-wiki/log.md` duerfen fuer flache Katalog- und Append-only-Formate ohne Frontmatter bleiben.

```yaml
---
title: Short Title
page_type: schema | workflow | contract | frontdoor | wiki-index | wiki-log | runbook | decision | project | context | daily | derived | mspr-packet
status: canonical | log | derived | import | proposed | verified
authority: canonical | log | derived | import | proposed | verified
owner: governance | backend | browser | matrix | docs | human-review
updated: YYYY-MM-DD
tags:
  - "#governance"
---
```

## Tags

| Tag | Verwendung |
| --- | --- |
| `#governance` | Regeln, Workflow, Review und Authority |
| `#schema` | Formale Struktur- oder Formatdefinition |
| `#authority` | Ownership, Wahrheitsebene oder Trust Boundary |
| `#workflow` | Arbeitsablauf, Gate oder Sequenz |
| `#mspr` | Menschlicher Review bei Risiko oder Unsicherheit |
| `#verified` | Dokumentierter Proof oder gepruefter Zustand |
| `#derived` | Zusammenfassung oder Orientierung ohne eigene Runtime-Authority |
| `#contract-only` | Externe oder noch nicht end-to-end verifizierte Contract-Flache |

## Routing-Regeln

Neue dauerhafte Dokumentation wird in `02-wiki/index.md` katalogisiert. Erfolgreiche Aenderungen werden in `02-wiki/log.md` angehaengt. Risiko, Unsicherheit oder fehlende Authority werden als MSPR-Packet in `03-mspr/packets/` geroutet und nicht automatisch kanonisiert.

