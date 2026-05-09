---
title: MSPR Spec
page_type: schema
status: canonical
authority: canonical
owner: governance
updated: 2026-05-10
tags:
  - "#governance"
  - "#schema"
  - "#mspr"
---

# MSPR Spec

## Zweck

MSPR steht fuer menschlichen Sicherheits- und Promotion-Review. Ein MSPR-Packet wird erstellt, wenn ein Agent nicht fail-open weiterarbeiten darf oder wenn Material vor einer Promotion menschlich bestaetigt werden muss.

## Trigger

| Trigger | Bedeutung |
| --- | --- |
| `authority_conflict` | Quellen widersprechen sich oder Ownership ist unklar |
| `missing_source` | Erwartete Quelle, Surface oder Proof fehlt |
| `derived_promotion` | Derived oder importiertes Material soll kanonisch werden |
| `validation_gap` | Riskante Aenderung hat keinen belastbaren Check |
| `side_effect_risk` | Aenderung koennte fremde Arbeit oder Runtime-Verhalten beeinflussen |
| `contract_gap` | Contract-only Flache wird mit implementierter Flache verwechselt |
| `governance_bootstrap_review` | Neue Governance-Surface braucht menschliche Bestaetigung |

## Ablage

MSPR-Packets liegen unter `03-mspr/packets/` und verwenden `YYYY-MM-DD-<slug>.yml` oder `YYYY-MM-DD-<slug>.json`.

Packets enthalten nur strukturierte Keys und Values. Keine freien Markdown-Abschnitte, keine langen Prosa-Erklaerungen.

## YAML-Format

```yaml
id: MSPR-YYYYMMDD-001
date: YYYY-MM-DD
status: proposed
trigger: governance_bootstrap_review
scope:
  paths:
    - path/to/file.md
authority:
  observed:
    - source
  inferred:
    - inference
risk:
  level: low
  statement: short risk statement
decision_needed: human decision
review:
  owner: human
  state: pending
verification:
  proof:
    - command or check
links:
  - relative/path.md
next_gate: review_required
```

## Review-Status

| Status | Bedeutung |
| --- | --- |
| proposed | Packet erstellt, noch nicht entschieden |
| accepted | Menschlicher Review bestaetigt den Vorschlag |
| rejected | Vorschlag wird nicht uebernommen |
| superseded | Packet wurde durch neueres Packet ersetzt |
| blocked | Arbeit bleibt bis zur Klaerung gesperrt |

