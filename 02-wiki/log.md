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
