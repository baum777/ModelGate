# Matrix Room Taxonomy

Status: target architecture for a ModelGate/MosaicStacked Matrix knowledge space.

This document describes the intended Matrix space and room structure for ModelGate. It is not evidence that a live Matrix homeserver has already been provisioned with these spaces or rooms.

## Authority Posture

- Matrix credentials stay backend-side.
- Browser state is selection and approval intent only.
- Topic writes require backend-owned plan, approval, execute, and verify flow.
- Room topics are governed summaries, not unrestricted chat notes.
- Provenance and verification rooms are append-only operational evidence surfaces.

## Top-Level Space

```text
MosaicStacked / ModelGate Knowledge Hub
├─ 00-start-here
├─ 10-ai-research
├─ 20-agent-workflows
├─ 30-knowledge-base
├─ 40-community
└─ 90-system-audit
```

The first visible layer should be written for new Matrix users. Users should be able to answer three questions without understanding the governance model first:

- Where do I start?
- Where should I post this?
- What happens when a room topic or structure needs to change?

## Room Map

| Space | Room | Purpose | Initial Topic | Approval Rule |
|---|---|---|---|---|
| `00-start-here` | `#start-here` | First landing room for new users. | Start here: what this Matrix space is for, where to post, and how ModelGate uses room topics. | Topic changes require approval and verification. |
| `00-start-here` | `#where-to-post` | Simple posting guide. | Quick guide for choosing the right room before posting a question, link, workflow, or idea. | Topic changes require approval and verification. |
| `00-start-here` | `#updates` | Operator-visible project and community announcements. | Official updates for the MosaicStacked / ModelGate Matrix knowledge hub. | Topic changes require approval and verification. |
| `00-start-here` | `#rules` | Behavioral and operating rules. | Rules for safe, governed participation in the Matrix knowledge space. | Topic changes require approval and verification. |
| `10-ai-research` | `#papers` | Foundational and current AI papers. | Curated paper threads, notes, and references for AI and LLM research. | Topic changes require approval. |
| `10-ai-research` | `#llm-insights` | Model behavior observations and comparisons. | Observations about LLM behavior, limitations, evaluation, and practical use. | Topic changes require approval. |
| `10-ai-research` | `#model-architecture` | Architecture concepts and system design notes. | Notes on model architecture, reasoning systems, and implementation-relevant concepts. | Topic changes require approval. |
| `20-agent-workflows` | `#prompt-engineering` | Prompt patterns and prompt examples. | Prompting patterns, examples, and reusable instruction structures. | Topic changes require approval. |
| `20-agent-workflows` | `#agentic-system-thoughts` | Agent design thinking and operating principles. | Agentic system design notes, tradeoffs, and conceptual patterns. | Topic changes require approval. |
| `20-agent-workflows` | `#multi-agent-systems` | Multi-agent coordination patterns. | Coordination, delegation, review, and handoff patterns for multi-agent systems. | Topic changes require approval. |
| `20-agent-workflows` | `#agent-workflows` | Practical workflows. | Reusable AI-assisted workflows, execution loops, and verification gates. | Topic changes require approval. |
| `20-agent-workflows` | `#workflow-with-ai` | Human-plus-AI project workflow. | Turning AI conversations and outputs into project plans, tasks, and shipped work. | Topic changes require approval. |
| `20-agent-workflows` | `#building-skills-for-agents` | Skill and tool creation. | Design, build, and maintain reusable skills and tools for agent workflows. | Topic changes require approval. |
| `20-agent-workflows` | `#agent-frameworks` | Framework comparisons. | Frameworks, runtimes, and libraries for agentic applications. | Topic changes require approval. |
| `30-knowledge-base` | `#ai-glossary` | Shared terminology. | Canonical definitions and short explanations for AI, agents, and workflow terms. | Topic changes require approval and verification. |
| `30-knowledge-base` | `#datasets` | Dataset and benchmark references. | Dataset, benchmark, and evaluation references relevant to ModelGate workflows. | Topic changes require approval. |
| `30-knowledge-base` | `#ai-trends` | Trend tracking. | Current AI trends and practical implications for ModelGate users. | Topic changes require approval. |
| `30-knowledge-base` | `#interesting-links` | Link intake and triage. | Useful links for later classification into research, workflows, or glossary entries. | Topic changes require approval. |
| `30-knowledge-base` | `#schooling-stuff` | Learning paths and courses. | Courses, learning tracks, and study notes for AI and agent work. | Topic changes require approval. |
| `40-community` | `#general-chat` | General discussion. | General discussion for the MosaicStacked / ModelGate community. | Topic changes require approval. |
| `40-community` | `#shares-and-finds` | Lightweight sharing. | Quick shares, finds, and references before they are promoted into durable rooms. | Topic changes require approval. |
| `40-community` | `#off-topic` | Non-core discussion. | Off-topic conversation that should not become source-of-truth material. | Topic changes require approval. |
| `90-system-audit` | `#change-proposals` | Proposed topic and structure changes. | Proposed Matrix room, topic, and structure changes awaiting review. | Topic changes require approval and verification. |
| `90-system-audit` | `#approvals` | Approval records. | Approval decisions for governed Matrix actions. | Topic changes require approval and verification. |
| `90-system-audit` | `#provenance-log` | Source and snapshot evidence. | Provenance records for scope summaries, topic plans, and verified Matrix updates. | Topic changes require approval and verification. |
| `90-system-audit` | `#topic-change-log` | Topic update history. | Verified Matrix room topic change history. | Topic changes require approval and verification. |
| `90-system-audit` | `#verification-results` | Execute/verify outcomes. | Backend verification results for Matrix actions. | Topic changes require approval and verification. |

## New User Entry Layer

`00-start-here` is intentionally simpler than the rest of the taxonomy. It should explain the space in user language before exposing the audit model.

```text
00-start-here
├─ #start-here
│  └─ What this space is and how ModelGate uses it.
├─ #where-to-post
│  └─ Short routing guide for questions, links, workflows, and proposals.
├─ #updates
│  └─ Human-readable announcements.
└─ #rules
   └─ Participation rules and safe-use expectations.
```

Recommended `#where-to-post` copy:

```text
Post papers in #papers.
Post prompt examples in #prompt-engineering.
Post reusable workflows in #agent-workflows or #workflow-with-ai.
Post tools, skills, and agent-building notes in #building-skills-for-agents.
Post quick links in #interesting-links.
Post structure or topic changes in #change-proposals.
```

`90-system-audit` should not be presented as a normal community area. It is the audit and evidence layer for ModelGate's backend-owned Matrix workflows.

## ModelGate Workspace Mapping

| ModelGate Workspace Step | Matrix Taxonomy Surface | Behavior |
|---|---|---|
| Scope selection | spaces and rooms above | User selects one or more rooms/spaces. |
| Scope resolve | selected rooms/spaces | Backend creates a scoped snapshot. |
| Scope summary | selected scope | Backend returns normalized room metadata and summary. |
| Provenance | `#provenance-log` plus selected scope | Backend reports source snapshot and authority context. |
| Topic analyze | target room | Backend creates a topic update plan. |
| Approval | `#approvals` in `90-system-audit` | User approval intent is recorded before execution. |
| Execute | target room | Backend applies the approved topic update. |
| Verify | `#verification-results` in `90-system-audit` and target room | Backend verifies observed Matrix state after execution. |

## Topic Risk Rules

| Risk | Examples | Required Gate |
|---|---|---|
| `low` | Clarifying a room topic without changing room purpose. | Approval and verify. |
| `medium` | Changing room scope, moving a concept between spaces, or updating canonical definitions. | Approval, execute, verify, provenance record. |
| `high` | Changing governance rooms, rules, onboarding, or evidence semantics. | Explicit approval, execute, verify, provenance record, and human review note. |

## Initial Provisioning Order

1. Create `00-start-here` and `90-system-audit`.
2. Create `30-knowledge-base`.
3. Create `20-agent-workflows`.
4. Create `10-ai-research`.
5. Create `40-community`.
6. Run backend read-only discovery.
7. Capture scope summary.
8. Prepare topic plans.
9. Execute only after approval.
10. Verify topic state and record provenance.

## Open Gaps

- No local `matrix-server` repo is present in this workspace.
- Live Matrix room creation is not verified by this document.
- Matrix hierarchy preview is currently documented as advisory/mock-only in ModelGate.
- Approval-gated Matrix execution remains bounded by real Matrix origin verification.
