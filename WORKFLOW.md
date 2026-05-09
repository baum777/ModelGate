---
title: Workflow
page_type: workflow
status: canonical
authority: canonical
owner: governance
updated: 2026-05-10
tags:
  - "#governance"
  - "#workflow"
  - "#authority"
---

# Workflow

## Zweck

Dieses Dokument ist die repo-lokale Frontdoor fuer Arbeitsablaeufe. Es beschreibt, wie Aenderungen in MosaicStacked gelesen, begrenzt, verifiziert und dokumentiert werden.

Runtime-Authority bleibt bei den im Repo-Vertrag benannten Flächen: Backend fuer Provider Calls, SSE, Routing und Ausfuehrung; Browser fuer Rendering, lokalen UI-State und Approval Intent; Matrix nur dort, wo der Server eine Flache explizit implementiert.

## Kernsequenz

1. Kontext lesen: `README.md`, `AGENTS.md`, `WORKFLOW.md`, `02-wiki/index.md`.
2. Authority klaeren: kanonisch, log, derived, import, proposed oder verified.
3. Scope grenzen: Ziel, Ausschluss, betroffene Pfade und unverletzliche Grenzen benennen.
4. Reuse pruefen: vorhandene Patterns, Templates, Tests, Contracts oder Runbooks verwenden.
5. Minimal-Change waehlen: kleinste sichere Aenderung ohne Nebenrefactor.
6. Verifizieren: Zustand lesen, Check/Test ausfuehren oder nicht verifizierbar markieren.
7. Route und Log: erfolgreiche Aenderungen in `02-wiki/log.md` protokollieren und `02-wiki/index.md` bei neuen dauerhaften Surface-Links ergaenzen.

## Fail-Closed

Bei Authority-Konflikt, unklarem Ownership, fehlender Quelle, unscharfer Validierung, importiertem Material ohne Review oder Seiteneffekten auf fremde Arbeit wird nicht automatisch promoviert.

In diesem Fall ein MSPR-Packet unter `03-mspr/packets/` erstellen und menschlichen Review als Next Gate setzen.

## Abschluss

Jede Session endet mit Ziel, Authority, Aenderung, Verifikation, Risiko/Open und Next Gate.

