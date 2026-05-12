# Governance Log

## [2026-05-10] governance-bootstrap | created governance schema, workflow frontdoor, wiki index/log, and MSPR packet directory [[../WORKFLOW.md]] [[../00-schema/AGENTS.md]] [[../00-schema/mspr-spec.md]] [[index.md]] [[../03-mspr/packets/2026-05-10-governance-bootstrap.yml]]

## [2026-05-10] mobile-redesign-v1 | aligned mobile PWA tokens, local font aliases, BottomSheet interactions, haptics, GitHub activity rows, Matrix mobile disabled hint, and manifest posture [[../web/src/App.tsx]] [[../web/src/critical.css]] [[../web/src/components/mobile/shared/BottomSheet.tsx]] [[../web/test/mobile-redesign.test.ts]]

## [2026-05-10] mobile-redesign-browser-validation | routed failing browser-suite smoke as MSPR validation gap [[../03-mspr/packets/2026-05-10-mobile-redesign-browser-suite.yml]]

## [2026-05-10] browser-suite-repair | fixed public preview contract, console state loading, chat approval execution, focus outlines, and closed browser-suite validation gap [[../web/src/App.tsx]] [[../web/src/components/ChatWorkspace.tsx]] [[../03-mspr/packets/2026-05-10-mobile-redesign-browser-suite.yml]]

## [2026-05-10] github-oauth-production-fallback | added GitHub OAuth App start/callback support for production GITHUB_OAUTH_* configuration while preserving GitHub App installation flow [[../server/src/routes/integration-auth.ts]] [[../server/src/lib/integration-auth-config.ts]] [[../server/test/integration-auth-routes.test.ts]]

## [2026-05-10] mobile-ui-safe-restore | restored mobile/landing visual surfaces to last good checkpoint 08a88df while preserving OAuth backend fix and browser-suite approval/state-loading repairs [[../web/src/App.tsx]] [[../web/src/critical.css]] [[../web/src/styles.css]] [[../tests/browser/mosaicstacked.spec.ts]]

## [2026-05-10] mobile-css-load-stability | prevented deferred desktop CSS from repainting restored mobile shell chrome after idle timeout and loaded local font CSS immediately [[../web/src/main.tsx]] [[../web/src/ui-adaptation.css]] [[../web/test/mobile-redesign.test.ts]]

## [2026-05-10] desktop-css-responsive-stability | loaded viewport-gated desktop deferred CSS immediately, added critical/deferred desktop pane guards, and verified side panels plus main body stay within bounds [[../web/src/main.tsx]] [[../web/src/critical.css]] [[../web/src/ui-adaptation.css]] [[../tests/browser/mosaicstacked.spec.ts]]

## [2026-05-10] mobile-chat-three-zone-layout | reworked mobile chat into a scrollable conversation zone, compact input stack, and rotating local tip rail while preserving backend-owned chat and approval flow [[../web/src/components/ChatWorkspace.tsx]] [[../web/src/critical.css]] [[../web/src/ui-adaptation.css]] [[../tests/browser/mosaicstacked.spec.ts]]

## [2026-05-10] mobile-chat-composer-header-polish | integrated the mobile send CTA into the input field, hid the textarea scrollbar, aligned chat/input surfaces with a golden-ratio layout token, and added mobile theme plus en/de toggles to the header [[../web/src/components/mobile/chat/ComposeZone.tsx]] [[../web/src/components/mobile/layout/TopContextBar.tsx]] [[../web/src/App.tsx]] [[../web/src/critical.css]] [[../web/src/ui-adaptation.css]]

## [2026-05-10] mobile-header-desktop-toggle-parity | aligned the mobile header controls with desktop theme and language toggles by reusing theme-toggle-button, shell-language-toggle, shell-language-button, and the desktop ☀/☾ theme glyphs [[../web/src/components/mobile/layout/TopContextBar.tsx]] [[../web/src/App.tsx]] [[../web/src/critical.css]] [[../web/src/ui-adaptation.css]]

## [2026-05-10] settings-authority-control-center-plan | created implementation plan for the confirmed Settings authority control center concept [[../docs/superpowers/plans/2026-05-10-settings-authority-control-center.md]]

## [2026-05-10] settings-authority-control-center | reworked mobile Settings into a backend-authority control center with truth snapshot, grouped access/operation/expert rows, safe BottomSheet details, and browser coverage [[../web/src/components/SettingsWorkspace.tsx]] [[../web/src/components/mobile/shared/SettingsRow.tsx]] [[../tests/browser/mosaicstacked.spec.ts]]

## [2026-05-10] mobile-openrouter-settings-dropdown | added a mobile Settings OpenRouter dropdown for backend-owned API key and alias/model-id entry, preserving desktop form behavior and secret redaction [[../web/src/components/SettingsWorkspace.tsx]] [[../tests/browser/mosaicstacked.spec.ts]]

## [2026-05-10] mobile-openrouter-sheet-padding | tightened global mobile BottomSheet text padding and OpenRouter dropdown typography to prevent oversized overlapping copy while keeping 16px input text for mobile keyboards [[../web/src/components/SettingsWorkspace.tsx]] [[../web/src/critical.css]] [[../web/src/styles.css]] [[../web/src/ui-adaptation.css]]

## [2026-05-10] vercel-production-deploy | deployed main commit 31c473f to Vercel production dpl_C2ijFGzgD4FpfoBPowaHbn5mbXv4 and verified /health on https://mosaicstacked.vercel.app [[../docs/vercel-deployment.md]]

## [2026-05-10] openrouter-settings-submit-validation | aligned Settings OpenRouter form validation with backend credential contract, surfaced save/test errors inline, and removed misleading mobile alias-entry copy [[../web/src/components/SettingsWorkspace.tsx]] [[../web/src/lib/openrouter-inputs.ts]] [[../web/src/App.tsx]] [[../web/test/settings-workspace.test.ts]]

## [2026-05-10] openrouter-settings-production-deploy | deployed main commit 1073ed3 to Vercel production dpl_6ShjN52ry85fLw24vhR7VxfC1r6B and verified /health on https://mosaicstacked.vercel.app [[../web/src/components/SettingsWorkspace.tsx]] [[../web/src/lib/openrouter-inputs.ts]] [[../docs/vercel-deployment.md]]

## [2026-05-11] workbench-4-tab-authority-semantics | reduced shell navigation to four tabs, normalized legacy mode URLs to workbench, added Chat Read only/Read & Write guardrails, and converted GitHub workspace into summary-first authority-safe Workbench actions [[../web/src/App.tsx]] [[../web/src/components/ChatWorkspace.tsx]] [[../web/src/components/GitHubWorkspace.tsx]] [[../web/src/lib/localization.tsx]] [[../web/test/mobile-redesign.test.ts]] [[../web/test/app-localization.test.ts]] [[../web/test/github-workspace.test.ts]]

## [2026-05-11] workbench-chat-authority-browser-verification | aligned browser flows with 4-tab Workbench navigation, explicit RW branch-selector gating, local-only mark/remove semantics, and backend-capability-gated PR execution wording [[../web/src/components/GitHubWorkspace.tsx]] [[../web/src/components/ChatWorkspace.tsx]] [[../tests/browser/mosaicstacked.spec.ts]] [[../web/test/chat-workflow.test.ts]] [[../web/test/github-workspace.test.ts]]

## [2026-05-11] vercel-external-deploy-blocked | external deploy attempt remained blocked by tenant disclosure policy after explicit user approval; routed to MSPR for human policy review [[../03-mspr/packets/2026-05-11-vercel-external-deploy-blocked.yml]]

## [2026-05-11] live-smoke-github-openrouter-blocked | opened live app browser and routed blocked GitHub/OpenRouter smoke validation to MSPR due missing GitHub admin key and OpenRouter upstream 401 [[../03-mspr/packets/2026-05-11-live-smoke-github-openrouter-blocked.yml]]

## [2026-05-12] github-app-installation-repo-scope | changed GitHub repo authority from env allowlist-first to GitHub App installation repository selection for user-connected sessions, with optional instance-mode narrowing [[../server/src/routes/github.ts]] [[../server/src/routes/integration-auth.ts]] [[../server/src/lib/github-app-auth.ts]] [[../docs/routing-matrix.md]]

## [2026-05-12] vercel-production-deploy-blocked | production deploy was explicitly approved but blocked by tenant external-disclosure policy after typecheck and build passed [[../03-mspr/packets/2026-05-12-vercel-production-deploy-blocked.yml]]

## [2026-05-12] vercel-production-deploy-repeat-blocked | repeated explicit production deploy command was blocked again by tenant external-disclosure policy; existing MSPR evidence updated [[../03-mspr/packets/2026-05-12-vercel-production-deploy-blocked.yml]]

## [2026-05-12] github-app-install-authorize-callback | resolved GitHub App Install & Authorize OAuth code callbacks into backend-owned installation credentials and GitHub-selected repository scope [[../server/src/routes/integration-auth.ts]] [[../server/test/integration-auth-routes.test.ts]] [[../docs/routing-matrix.md]]

## [2026-05-13] github-env-deploy-repeat-blocked | loaded local dotenv metadata, generated missing local session/encryption secrets, and blocked deploy repeat because GitHub App slug is missing and private key is not parseable as PEM [[../03-mspr/packets/2026-05-13-github-env-deploy-blocked.yml]]

## [2026-05-13] vercel-deploy-repeat-blocked | repeated explicit vercel deploy request after local env updates remained blocked by tenant external-disclosure policy; updated existing MSPR deployment packet evidence [[../03-mspr/packets/2026-05-12-vercel-production-deploy-blocked.yml]]
