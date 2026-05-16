# Wiki Index

Format: `[[link]] | summary | #tags | YYYY-MM-DD`

[[../README.md]] | Repo-Frontdoor mit aktuellem Console-Ist-Zustand, Authority-Diagrammen, Routen, Env-Flächen und Verifikation | #frontdoor #canonical #product | 2026-05-16
[[../AGENTS.md]] | Operating Contract, Authority Boundary und Hard Rules | #governance #authority #canonical | 2026-05-10
[[../WORKFLOW.md]] | Lineare Arbeitssequenz, Fail-Closed-Regeln und Logging-Route | #governance #workflow #canonical | 2026-05-10
[[../00-schema/AGENTS.md]] | Workflow-Spec, Wahrheitsebenen, Statussprache, Tags und Frontmatter-Contract | #governance #schema #canonical | 2026-05-10
[[../00-schema/mspr-spec.md]] | MSPR-Packet-Format, Trigger und Review-Logik | #governance #schema #mspr | 2026-05-10
[[../system/index.md]] | Durable System-Index und Referenzrouting | #system #governance #derived | 2026-05-10
[[../system/repo-map.md]] | Repo-Map mit Product-, Governance- und Derived-Flächen | #system #map #derived | 2026-05-10
[[../system/file-conventions.md]] | Ordnerrollen, Namensregeln und Dokumentationssplit | #system #conventions #derived | 2026-05-10
[[../system/working-rules.md]] | Dokumentationsregeln, Change-Regeln und Fail-Closed-Regel | #system #workflow #derived | 2026-05-10
[[../docs/test-matrix.md]] | Verifikationsmatrix und Statusmodell fuer Checks | #docs #verification #derived | 2026-05-10
[[../docs/vercel-deployment.md]] | Vercel-Deployment-Topologie und Ops-Referenz | #docs #deployment #derived | 2026-05-10
[[../03-mspr/packets/2026-05-10-governance-bootstrap.yml]] | Review-Packet fuer neu gebootstrappte Governance-Surfaces | #mspr #governance #proposed | 2026-05-10
[[../03-mspr/packets/2026-05-10-mobile-redesign-browser-suite.yml]] | Superseded Browser-Suite-Validierungsluecke nach Mobile Redesign | #mspr #verification #superseded | 2026-05-10
[[../03-mspr/packets/2026-05-11-vercel-external-deploy-blocked.yml]] | Blocked external Vercel deployment due tenant disclosure policy despite explicit user approval | #mspr #deployment #blocked | 2026-05-11
[[../03-mspr/packets/2026-05-11-live-smoke-github-openrouter-blocked.yml]] | Blocked live GitHub/OpenRouter smoke due missing GitHub admin key and OpenRouter upstream 401 | #mspr #smoke #blocked | 2026-05-11
[[../03-mspr/packets/2026-05-12-vercel-production-deploy-blocked.yml]] | Blocked Vercel production deployment due tenant disclosure policy after explicit approval | #mspr #deployment #blocked | 2026-05-12
[[../03-mspr/packets/2026-05-13-github-env-deploy-blocked.yml]] | Blocked GitHub Install and Authorize deploy repeat due missing app slug and invalid private-key env parse | #mspr #github #deployment #blocked | 2026-05-13
[[../03-mspr/packets/2026-05-16-local-auth-github-key-blocked.yml]] | Accepted local auth review after valid GitHub App PEM restored repo verification; Matrix SSO browser session connected | #mspr #github #matrix #accepted | 2026-05-16
[[../docs/superpowers/plans/2026-05-10-settings-authority-control-center.md]] | Implementation plan for Settings authority control center redesign | #docs #plan #settings | 2026-05-10
[[../docs/superpowers/specs/2026-05-16-agentic-helpdesk-companion-design.md]] | Proposed Design für agentischen Helpdesk Companion mit UI-Hilfe, Allowlist-Intents und Guardrails | #docs #chat #ux #authority | 2026-05-16
[[../docs/superpowers/plans/2026-05-16-agentic-helpdesk-companion.md]] | Implementation plan for guarded agentic Helpdesk Companion UI-help slice | #docs #plan #chat #ux | 2026-05-16
[[../web/src/App.tsx]] | 4-Tab shell (`chat`, `workbench`, `matrix`, `settings`) with legacy mode normalization to `workbench` | #workbench #navigation #authority | 2026-05-11
[[../web/src/components/GitHubWorkspace.tsx]] | Summary-first Workbench review center with explicit local/backend action effect semantics | #workbench #review #authority | 2026-05-11
[[../tests/browser/mosaicstacked.spec.ts]] | Browser verification for keyboard-first shell navigation, truth-rail authority signals, guarded Companion UI-help smoke, fail-closed Matrix composer posture, and backend-capability-gated workbench execution | #workbench #chat #matrix #verification | 2026-05-16
[[../web/src/components/FloatingCompanion.tsx]] | Permanenter Floating Helpdesk Companion mit echter backend-verdrahteter Chat-Interaktion, minimiertem Button, expandierbarem Panel und A11y-Keyboard-Gates | #chat #ux #authority | 2026-05-16
[[../web/src/lib/companion-intents.ts]] | Allowlist- und Blocklist-Contract für agentische Companion-UI-Hilfe mit Default-Deny-Validierung | #chat #ux #authority | 2026-05-16
[[../web/src/lib/companion-context.ts]] | Redigierter Browser-Kontext-Snapshot für Companion-Antworten ohne Secrets, Provider-Ziele oder vollständige Inhalte | #chat #ux #authority | 2026-05-16
[[../server/src/lib/default-free-model.ts]] | Backend-Resolver für Alias `default-free` mit Priorität user-credential -> env -> lokaler Dev-Fallback (fail-closed bei fehlendem Key/Modell) | #chat #routing #authority | 2026-05-16
[[../docs/model-routing.md]] | Routing-Contract inkl. `default-free` Alias, fail-closed Fehlercodes und serverseitiger Key/Model-Priorisierung | #docs #chat #authority | 2026-05-16
[[../web/src/lib/shell-freshness.ts]] | Ableitung von `backend-fresh`, `local-restored` und `stale` für die persistente Truth Rail | #shell #truth #authority | 2026-05-16
[[../web/src/lib/navigation-palette.ts]] | Typisierte Navigation-Palette-Einträge für Tabs und Session-Targets im Keyboard-Flow | #navigation #poweruser #contract | 2026-05-16
[[../web/src/lib/button-gate.ts]] | Einheitliches UI-Gate-Contract-Mapping von Block-Gründen auf `aria-disabled` und Tooltip-Copy | #ux #gating #authority | 2026-05-16
