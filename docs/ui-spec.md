# MosaicStack — UI Specification

**Version:** 1.0.0-alpha  
**Stack:** Vite + React · Fastify · TypeScript · Vercel  
**Live:** [modelgate.vercel.app](https://modelgate.vercel.app)  
**Repo:** [github.com/baum777/mosaicStack](https://github.com/baum777/mosaicStack)

---

## Table of Contents

1. [Design Principles](#1-design-principles)
2. [Color Tokens](#2-color-tokens)
3. [Typography](#3-typography)
4. [Spacing & Layout Grid](#4-spacing--layout-grid)
5. [Elevation & Borders](#5-elevation--borders)
6. [Motion & Animation](#6-motion--animation)
7. [Component Library](#7-component-library)
   - 7.1 [Buttons](#71-buttons)
   - 7.2 [Badges & Status Indicators](#72-badges--status-indicators)
   - 7.3 [Form Inputs](#73-form-inputs)
   - 7.4 [Cards](#74-cards)
   - 7.5 [Navigation](#75-navigation)
   - 7.6 [Toasts & Feedback](#76-toasts--feedback)
   - 7.7 [Code & Mono Elements](#77-code--mono-elements)
   - 7.8 [Skeleton Loaders](#78-skeleton-loaders)
8. [Application Patterns](#8-application-patterns)
   - 8.1 [App Shell](#81-app-shell)
   - 8.2 [Chat Interface](#82-chat-interface)
   - 8.3 [SSE Stream UI](#83-sse-stream-ui)
   - 8.4 [GitHub Review Surface](#84-github-review-surface)
   - 8.5 [Matrix Knowledge Surface](#85-matrix-knowledge-surface)
   - 8.6 [Diff Viewer](#86-diff-viewer)
   - 8.7 [Model Selector](#87-model-selector)
   - 8.8 [Approval Gate](#88-approval-gate)
9. [Page Layouts](#9-page-layouts)
10. [Accessibility](#10-accessibility)
11. [Dark Mode & Theming](#11-dark-mode--theming)
12. [Responsive Behaviour](#12-responsive-behaviour)
13. [Icon System](#13-icon-system)
14. [CSS Custom Properties Reference](#14-css-custom-properties-reference)

---

## 1. Design Principles

MosaicStack is a **backend-first console overlay**. The browser is a review surface — not an authority. Every UI decision must reinforce this trust model.

### 1.1 Core Principles

**Backend-authoritative.** The UI renders results, holds local state, and sends intent. It never writes directly to GitHub or executes model calls. Visual hierarchy must make approval gates prominent.

**Dark-first.** The primary mode is dark. Light mode is a full-fidelity alternate theme, not an afterthought. All tokens must resolve correctly in both.

**Precision over decoration.** No gradients on backgrounds, no decorative shadows, no noise textures in the shell. Colour is used only to encode meaning.

**Monospace as identity.** Technical metadata — API routes, tokens, repo paths, commit SHAs — always render in the monospace stack. This distinguishes system data from prose at a glance.

**Streaming is a first-class state.** SSE token delivery is not a loading state — it's the normal operating mode. Streaming has its own visual language distinct from loading.

**Fail-closed visibility.** When the backend fails closed (malformed SSE, bad Matrix response), the UI must show it explicitly — not silently repair or continue.

### 1.2 Design Anti-Patterns

The following are explicitly prohibited:

- Gradients on surface backgrounds in the shell
- Box shadows for decoration (only focus rings and elevation are allowed)
- Rounded corners on elements that use single-side accent borders
- Writing to GitHub directly from the browser
- Hiding error states behind optimistic UI
- Colour alone to distinguish interactive states (always pair with text or icon)

---

## 2. Color Tokens

All values are defined as CSS custom properties on `:root` and overridden in `.light-mode`. No hardcoded hex values outside the token file.

### 2.1 Brand Palette

| Token | Dark Value | Light Value | Usage |
|---|---|---|---|
| `--ms-accent` | `#6c5ce7` | `#6c5ce7` | Primary CTA, focus rings, active nav |
| `--ms-accent2` | `#a29bfe` | `#4834d4` | Accent text, link colour, model badges |
| `--ms-teal` | `#00cec9` | `#00b5b1` | Matrix integration, secondary brand |
| `--ms-teal2` | `#81ecec` | `#007a78` | Teal highlights, hover states |

### 2.2 Semantic Palette

| Token | Dark Value | Light Value | Meaning |
|---|---|---|---|
| `--ms-green` | `#55efc4` | `#00b894` | Success, verified, SSE done |
| `--ms-amber` | `#fdcb6e` | `#d4900a` | Warning, pending, rate-limited |
| `--ms-red` | `#ff7675` | `#d63031` | Error, rejected, fail-closed |
| `--ms-accent` | `#6c5ce7` | `#6c5ce7` | Info, streaming active |

### 2.3 Surface Scale

Surfaces are layered using a 4-step elevation system. Each step adds ~5–7% lightness in dark mode.

| Token | Dark Value | Light Value | Role |
|---|---|---|---|
| `--ms-bg` | `#0f0f11` | `#f5f4f8` | Canvas — page background |
| `--ms-bg2` | `#171719` | `#ffffff` | Panel — sidebar, topbar |
| `--ms-bg3` | `#1e1e21` | `#eeecf5` | Raised — cards, inputs |
| `--ms-bg4` | `#252529` | `#e5e3ef` | Overlay — dropdowns, tooltips |
| `--ms-surface` | `#1a1a1d` | `#ffffff` | Generic surface alias |

### 2.4 Text Scale

| Token | Dark Value | Light Value | Role |
|---|---|---|---|
| `--ms-text` | `#f0eff4` | `#1a1929` | Primary text |
| `--ms-text2` | `#9b99a8` | `#6b6882` | Secondary / muted |
| `--ms-text3` | `#5e5d6b` | `#b0aec0` | Tertiary / placeholders |

### 2.5 Border Scale

| Token | Dark Value | Light Value |
|---|---|---|
| `--ms-border` | `rgba(255,255,255,0.07)` | `rgba(0,0,0,0.07)` |
| `--ms-border2` | `rgba(255,255,255,0.12)` | `rgba(0,0,0,0.13)` |

### 2.6 Colour Usage Rules

Semantic colours must never be used decoratively. The mapping is strict:

- Green → success, verified state, done signal
- Amber → warning, pending approval, rate limit
- Red → error, rejection, fail-closed, destructive action
- Accent/Iris → info, streaming, brand interaction
- Teal → Matrix-specific integration surfaces

Transparent tinted fills (`rgba(colour, 0.08–0.15)`) are used for badge backgrounds. Never use raw semantic hex as a solid fill on a surface.

---

## 3. Typography

### 3.1 Font Stack

| Role | Family | Fallback |
|---|---|---|
| UI / prose | `DM Sans` | `system-ui, sans-serif` |
| Code / tokens | `JetBrains Mono` | `'Courier New', monospace` |

Both fonts are loaded from Google Fonts. The `display=swap` descriptor is required to prevent layout blocking.

```
https://fonts.googleapis.com/css2?family=JetBrains+Mono:wght@400;500&family=DM+Sans:ital,opsz,wght@0,9..40,300;0,9..40,400;0,9..40,500;0,9..40,600;1,9..40,300&display=swap
```

### 3.2 Type Scale

| Step | Size | Weight | Letter-spacing | Line-height | Role |
|---|---|---|---|---|---|
| Display | 30px | 700 | -1px | 1.15 | Hero headlines, page titles |
| Title | 22px | 600 | -0.5px | 1.25 | Section titles, modal headers |
| Heading | 16px | 500 | 0 | 1.4 | Card titles, subsection headings |
| Body | 14px | 400 | 0 | 1.7 | Default prose, descriptions |
| Caption | 12px | 400 | 0 | 1.5 | Metadata, timestamps, subtitles |
| Label | 11px | 500 | 0.8px | 1.4 | Uppercase section labels (always uppercase) |
| Mono | 12px | 400–500 | 0 | 1.7 | Code, API paths, commit SHAs, tokens |

### 3.3 Usage Rules

Section labels (the small uppercase callouts above headings) are always `font-size: 11px; font-weight: 500; letter-spacing: 1.2px; text-transform: uppercase; color: var(--ms-text3)`.

Monospace usage is mandatory for: API endpoint strings, environment variable names, commit SHAs, file paths, model name strings, port numbers, and HTTP methods.

Italic is used only for prose quotation or emphasis within body copy — never for UI labels or interactive elements.

---

## 4. Spacing & Layout Grid

### 4.1 Base Unit

The base spacing unit is **4px**. All spacing values are multiples of 4.

| Token | Value | Common Use |
|---|---|---|
| `--sp-1` | 4px | Icon padding, tight gaps |
| `--sp-2` | 8px | Inline element gaps, badge padding |
| `--sp-3` | 12px | Input internal padding |
| `--sp-4` | 16px | Component internal padding (standard) |
| `--sp-5` | 20px | Card padding |
| `--sp-6` | 24px | Section horizontal padding |
| `--sp-8` | 32px | Larger section gaps |
| `--sp-10` | 40px | Page section padding |
| `--sp-12` | 48px | Large section separation |
| `--sp-16` | 64px | Hero spacing |

### 4.2 Border Radius

| Token | Value | Use |
|---|---|---|
| `--r` | 8px | Buttons, inputs, small cards, badges |
| `--r2` | 14px | Main cards, panels, modals |
| `--r3` | 20px | App shell sections, large containers |
| `pill` | 100px | Badge pills, toggle tracks |

Single-side accent borders (e.g., Matrix card `border-left`) always use `border-radius: 0` on the accented side's corners.

### 4.3 App Layout

The application uses a three-region layout:

```
┌─────────────────────────────────────────┐
│              Topbar (sticky, 57px)       │
├───────────┬─────────────────────────────┤
│           │                             │
│  Sidebar  │        Main content         │
│  (180px)  │        (flex: 1)            │
│  sticky   │                             │
│           │                             │
└───────────┴─────────────────────────────┘
```

- Topbar: `height: 57px; position: sticky; top: 0; z-index: 100`
- Sidebar: `width: 180px; position: sticky; top: 57px; height: calc(100vh - 57px); overflow-y: auto`
- Main: `flex: 1; overflow: hidden; min-width: 0`

### 4.4 Content Width

Maximum readable content width is **720px** for prose sections. Technical surfaces (diff viewer, code browser, tree view) expand to full available width.

---

## 5. Elevation & Borders

MosaicStack does not use drop shadows for elevation. Elevation is communicated through background colour progression (bg → bg2 → bg3 → bg4) and border opacity.

### 5.1 Border Styles

| Context | Style |
|---|---|
| Default panel/card | `1px solid var(--ms-border)` |
| Hover / focus emphasis | `1px solid var(--ms-border2)` |
| Active selection | `1px solid var(--ms-accent)` with inner ring |
| Featured card | `2px solid var(--ms-accent)` (only use case for 2px) |
| Matrix accent | `3px solid var(--ms-teal)` on `border-left` only |
| Error state | `1px solid rgba(255,118,117,0.4)` |

### 5.2 Focus Ring

All interactive elements use the same focus ring pattern:

```css
box-shadow: 0 0 0 3px rgba(108, 92, 231, 0.2);
outline: none;
```

Focus rings must be visible in both dark and light mode. The `rgba` opacity is sufficient — do not use `outline: 2px solid var(--ms-accent)` as an alternative (it doesn't compose with border-radius correctly across browsers).

---

## 6. Motion & Animation

### 6.1 Principles

Motion must be functional, not decorative. Every animation communicates a system state change:

- **Streaming active** — pulse on the stream dot
- **Loading** — skeleton shimmer
- **Processing** — spinner
- **State change** — slide or fade transition

Decorative animations (e.g., hover sparkles, background particles) are prohibited.

### 6.2 Easing Tokens

| Token | Value | Use |
|---|---|---|
| `--ease-hover` | `cubic-bezier(0.2, 0, 0, 1)` | Hover state transitions (150ms) |
| `--ease-focus` | `ease-in-out` | Focus ring, input expansion (200ms) |
| `--ease-stream` | `linear` | SSE tick, skeleton shimmer (continuous) |
| `--ease-enter` | `cubic-bezier(0.16, 1, 0.3, 1)` | Panel entrance, modal open (300ms) |
| `--ease-exit` | `ease-in` | Panel exit, modal close (200ms) |

### 6.3 Duration Scale

| Token | Value | Use |
|---|---|---|
| `--dur-fast` | 100ms | Micro-interactions (checkbox, toggle) |
| `--dur-base` | 150ms | Hover, background colour change |
| `--dur-slow` | 300ms | Panel enter, modal, page transitions |
| `--dur-stream` | 1200ms–2600ms | SSE pulse, skeleton shimmer cycles |

### 6.4 Named Animations

**`ms-pulse`** — Used for the live SSE dot indicator.  
Keyframes: `0%,100% { opacity: 1 }` → `50% { opacity: 0.4 }`  
Duration: 1200ms, `ease-in-out`, infinite.

**`ms-spin`** — Used for loading spinner.  
Keyframes: `to { transform: rotate(360deg) }`  
Duration: 1000ms, `linear`, infinite.

**`ms-shimmer`** — Used for skeleton loaders.  
Keyframes: `0% { background-position: -200% center }` → `100% { background-position: 200% center }`  
Duration: 1500ms, `ease-in-out`, infinite.  
Background: gradient sweep from `--ms-bg3` through `--ms-bg4` and back.

**`ms-slide-in`** — Used for toast entry, panel mount.  
Keyframes: `0% { transform: translateX(-8px); opacity: 0 }` → `100% { transform: translateX(0); opacity: 1 }`  
Duration: 400ms, `--ease-enter`, forwards.

### 6.5 Reduced Motion

All animations must be wrapped in `@media (prefers-reduced-motion: no-preference)` or equivalent. When reduced motion is preferred, all continuous animations (pulse, shimmer, spin) stop and transitions shorten to 50ms.

---

## 7. Component Library

### 7.1 Buttons

#### Anatomy

```
[ icon? ] [ label ] [ trailing-icon? ]
```

Padding: `8px 16px` (default), `5px 10px` (small), `11px 22px` (large).  
Height: 36px (default), 28px (small), 44px (large).  
Border-radius: `var(--r)` (8px).  
Font: 13px, weight 500, `var(--ms-sans)`.  
Transition: `background 150ms, transform 150ms, box-shadow 150ms`.

#### Variants

**Primary** — Main affirmative actions. Approve, Execute, Submit.  
Background: `var(--ms-accent)` (#6c5ce7). Text: white.  
Hover: `#7d6df0`, `translateY(-1px)`.  
Active: `#5a4bd1`, `translateY(0)`.  
Disabled: `opacity: 0.38; cursor: not-allowed`.

**Secondary** — Supporting actions. View, Export, Open.  
Background: `var(--ms-bg3)`. Border: `1px solid var(--ms-border2)`. Text: `var(--ms-text)`.  
Hover: `var(--ms-bg4)`.

**Ghost** — Tertiary actions. Cancel, Dismiss, Back.  
Background: transparent. Border: `1px solid var(--ms-border)`. Text: `var(--ms-text2)`.  
Hover: `var(--ms-bg3)`, text `var(--ms-text)`.

**Danger** — Destructive actions. Reject, Delete, Revoke.  
Background: `rgba(255,118,117,0.12)`. Border: `rgba(255,118,117,0.2)`. Text: `var(--ms-red)`.  
Hover: `rgba(255,118,117,0.20)`.

**Teal** — Matrix-specific actions. Sync, Connect, Publish.  
Background: `rgba(0,206,201,0.10)`. Border: `rgba(0,206,201,0.2)`. Text: `var(--ms-teal)`.  
Hover: `rgba(0,206,201,0.18)`.

**Icon** — Square buttons for single-icon actions. Padding: 8px. Width = Height = 36px.

#### Loading State

When a button triggers an async action, replace the label with a spinner (12px, border 2px, `var(--ms-accent)` with transparent top). The button becomes `disabled` and `cursor: wait`. Width does not change (use `min-width` equal to the default label width).

#### Button Groups

Buttons in a row use `gap: 8px`. For approval gates, Primary + Ghost ("Approve" + "Cancel") is the canonical pairing. Never place two Primary buttons side by side.

---

### 7.2 Badges & Status Indicators

#### Badge Anatomy

```
[ dot? ] [ label ]
```

Height: 20px. Padding: `3px 9px`. Border-radius: 100px (pill).  
Font: 11px, weight 500, letter-spacing 0.1px.  
The dot (when present) is `5px × 5px`, border-radius 50%, `background: currentColor`.

#### Semantic Variants

| Variant | Background | Text | Border |
|---|---|---|---|
| `badge-green` | `rgba(85,239,196,0.12)` | `var(--ms-green)` | `rgba(85,239,196,0.2)` |
| `badge-amber` | `rgba(253,203,110,0.12)` | `var(--ms-amber)` | `rgba(253,203,110,0.2)` |
| `badge-red` | `rgba(255,118,117,0.12)` | `var(--ms-red)` | `rgba(255,118,117,0.2)` |
| `badge-purple` | `rgba(108,92,231,0.15)` | `var(--ms-accent2)` | `rgba(108,92,231,0.25)` |
| `badge-teal` | `rgba(0,206,201,0.12)` | `var(--ms-teal)` | `rgba(0,206,201,0.2)` |
| `badge-gray` | `var(--ms-bg3)` | `var(--ms-text2)` | `var(--ms-border2)` |

#### SSE Lifecycle Badges

The SSE stream passes through these states in sequence:

```
[start] → [streaming ●] → [done] | [error]
```

- `start` → `badge-gray`
- `streaming` → `badge-purple` with animated pulse dot
- `done` → `badge-green`
- `error` → `badge-red`

The live indicator dot (outside of badges) is a standalone element: `6px × 6px`, `border-radius: 50%`, `background: var(--ms-green)`, `animation: ms-pulse 1200ms ease-in-out infinite`.

#### Model Tags

Model name badges use `badge-purple` for Claude models, `badge-teal` for other providers, `badge-gray` for local/unknown. The model string always renders in `var(--ms-mono)` inside the badge.

---

### 7.3 Form Inputs

#### Base Input

Height: 36px. Padding: `8px 12px`. Border-radius: `var(--r)`.  
Border: `1px solid var(--ms-border2)`. Background: `var(--ms-bg)`. Color: `var(--ms-text)`.  
Font: 13px, `var(--ms-sans)`. Placeholder: `var(--ms-text3)`.  
Transition: `border-color 150ms, box-shadow 150ms`.

Focus: `border-color: var(--ms-accent); box-shadow: 0 0 0 3px rgba(108,92,231,0.15); outline: none`.

Disabled: `opacity: 0.4; cursor: not-allowed`.

Error: `border-color: var(--ms-red); box-shadow: 0 0 0 3px rgba(255,118,117,0.15)`.

#### Input with Icon

When an icon precedes the input (search, filter), the icon sits at `left: 10px; top: 50%; transform: translateY(-50%)` inside a relative wrapper. Input padding-left becomes `30px`.

Icon colour: `var(--ms-text3)`. Size: 13px (if text glyph) or `14px × 14px` (if SVG).

#### Monospace Input

For technical fields (tokens, API keys, env vars, paths):

```css
font-family: var(--ms-mono);
font-size: 12px;
```

These fields always show a `badge-gray` label above reading e.g. `MATRIX_ACCESS_TOKEN` or `GITHUB_TOKEN`.

#### Textarea

Same token set as base input. `min-height: 80px; resize: vertical; line-height: 1.7`.

---

### 7.4 Cards

#### Base Card

```css
background: var(--ms-bg2);
border: 1px solid var(--ms-border);
border-radius: var(--r2);  /* 14px */
padding: 20px;
```

Hover (interactive cards): `border-color: var(--ms-border2); transform: translateY(-1px)`. Transition: 150ms.

#### Repo Card

Displays a GitHub repository entry. Structure:

```
┌─────────────────────────────────────┐
│ repo/name              [status badge]│
│ branch · N commits                  │
│                                     │
│ Short description text (2 lines max)│
│                                     │
│ 🔷 TypeScript 90%  ★ 0  ⑂ 0  PRs N │
└─────────────────────────────────────┘
```

Repo name: `font-size: 14px; font-weight: 600; color: var(--ms-accent2)`.  
Branch/commit meta: `font-size: 11px; font-family: var(--ms-mono); color: var(--ms-text3)`.  
Description: `font-size: 12px; color: var(--ms-text2); line-height: 1.5; -webkit-line-clamp: 2`.  
Stats row: `font-size: 11px; color: var(--ms-text3); display: flex; gap: 12px`.

#### Matrix Knowledge Card

Displays a Matrix room knowledge entry. Left accent border distinguishes it from repo cards.

```css
background: var(--ms-bg2);
border: 1px solid var(--ms-border);
border-left: 3px solid var(--ms-teal);
border-radius: var(--r);
padding: 14px 16px;
```

For Iris/accent-tagged entries: `border-left-color: var(--ms-accent)`.

Room label: `font-size: 11px; font-weight: 500; color: var(--ms-teal); font-family: var(--ms-mono)`.  
Content: `font-size: 13px; color: var(--ms-text); line-height: 1.5`.  
Meta: `font-size: 11px; color: var(--ms-text3); margin-top: 6px`.

#### Diff Card

Used in the review surface. Structure:

```
┌── file/path/component.ts ─────────[badge]┐
│ - removed line                           │
│ + added line                             │
│   context line                           │
└──────────────────────────────────────────┘
```

File header: monospace, `font-size: 12px`, background `var(--ms-bg3)`, padding `8px 16px`.  
Removed lines: `background: rgba(255,118,117,0.08)`, left border `2px solid var(--ms-red)`, text `var(--ms-red)`. Prefix `−`.  
Added lines: `background: rgba(85,239,196,0.08)`, left border `2px solid var(--ms-green)`, text `var(--ms-green)`. Prefix `+`.  
Context lines: no background, text `var(--ms-text2)`.  
All diff text: `font-family: var(--ms-mono); font-size: 12px; line-height: 1.6`.

---

### 7.5 Navigation

#### Topbar

Height: 57px. Background: `var(--ms-bg2)`. Border-bottom: `1px solid var(--ms-border)`. `position: sticky; top: 0; z-index: 100`.

Three zones: left (logo + wordmark + tag), centre (nav pills), right (status + mode toggle).

**Logo mark:** 28×28px, `border-radius: 7px`, gradient `135deg, var(--ms-accent), var(--ms-teal)`. Contains 2×2 grid icon at 16px.

**Nav pills:** `padding: 6px 12px; border-radius: var(--r); font-size: 13px`. Default: `color: var(--ms-text2)`. Active: `background: var(--ms-bg4); color: var(--ms-text); font-weight: 500`. Hover: `background: var(--ms-bg3); color: var(--ms-text)`.

#### Sidebar

Width: 180px. Background: `var(--ms-bg2)`. Border-right: `1px solid var(--ms-border)`.  
`position: sticky; top: 57px; height: calc(100vh - 57px); overflow-y: auto`.  
Padding: `32px 20px`.

**Section labels:** `font-size: 10px; font-weight: 600; letter-spacing: 1px; text-transform: uppercase; color: var(--ms-text3); margin-bottom: 8px; padding: 12px 10px 6px`.

**Nav items:** `display: flex; align-items: center; gap: 8px; padding: 7px 10px; border-radius: var(--r); font-size: 13px; margin-bottom: 2px`.  
Default: `color: var(--ms-text2)`. Active: `background: rgba(108,92,231,0.12); color: var(--ms-accent2); font-weight: 500`. Hover: `background: var(--ms-bg3); color: var(--ms-text)`. Transition: 150ms.

#### Breadcrumb

Used above the main content area to show location context.

```
baum777 › mosaicStack › Chat
```

Font-size: 12px. Separator `›`: `color: var(--ms-text3)`. Items: `color: var(--ms-text2)`. Active/last item: `color: var(--ms-text); font-weight: 500`. Gap between items: 6px.

#### Tab Bar

Sits below the breadcrumb, above the content area. `border-bottom: 1px solid var(--ms-border); margin-bottom: 16px; display: flex; gap: 2px`.

Tab items: `padding: 8px 14px; font-size: 13px; border-bottom: 2px solid transparent; margin-bottom: -1px`. Active: `color: var(--ms-accent2); border-bottom-color: var(--ms-accent); font-weight: 500`. Hover: `color: var(--ms-text)`. Transition: 150ms.

---

### 7.6 Toasts & Feedback

Toasts appear in the bottom-right corner at `position: fixed; bottom: 24px; right: 24px`. They stack with `gap: 8px`, newest on top. Maximum 3 visible at once. Auto-dismiss after 5s (error: 8s, no auto-dismiss).

#### Toast Anatomy

```
┌─────────────────────────────────┐
│ [icon]  Title                   │
│         Description (optional)  │
└─────────────────────────────────┘
```

`display: flex; align-items: flex-start; gap: 10px; padding: 12px 14px; border-radius: var(--r2); border: 1px solid; font-size: 13px; min-width: 280px; max-width: 380px`.

Entry animation: slide-in from right (400ms, `--ease-enter`).  
Exit animation: slide-out to right + fade (200ms, `--ease-exit`).

#### Toast Variants

| Variant | Background | Border | Icon |
|---|---|---|---|
| Success | `rgba(85,239,196,0.08)` | `rgba(85,239,196,0.2)` | `✓` green |
| Error | `rgba(255,118,117,0.08)` | `rgba(255,118,117,0.2)` | `✕` red |
| Warning | `rgba(253,203,110,0.08)` | `rgba(253,203,110,0.2)` | `⚠` amber |
| Info | `rgba(108,92,231,0.08)` | `rgba(108,92,231,0.2)` | `ℹ` accent2 |

Title: `font-weight: 500; color: var(--ms-text)`. Description: `font-size: 12px; color: var(--ms-text2); margin-top: 2px`.

---

### 7.7 Code & Mono Elements

#### Inline Code

```css
font-family: var(--ms-mono);
font-size: 12px;
background: var(--ms-bg3);
padding: 2px 7px;
border-radius: 5px;
color: var(--ms-accent2);
```

Used inline within prose for: file paths, API routes, env variable names, function names.

#### Code Block

```css
font-family: var(--ms-mono);
font-size: 12px;
background: var(--ms-bg3);
border: 1px solid var(--ms-border);
border-radius: var(--r);
padding: 14px 16px;
color: var(--ms-text);
line-height: 1.7;
overflow: auto;
```

Code blocks do not have syntax highlighting in v1. Token colour is `var(--ms-text)` by default. Comments: `var(--ms-text2)`. String-like content: `var(--ms-accent2)`. Keywords: `var(--ms-teal)`. This colouring is done manually for any code Claude generates in the UI (e.g., proposed API plans shown to the user).

#### HTTP Method Tags

HTTP methods are rendered as compact inline badges beside route strings:

| Method | Color |
|---|---|
| `GET` | `var(--ms-green)` on `rgba(85,239,196,0.1)` |
| `POST` | `var(--ms-amber)` on `rgba(253,203,110,0.1)` |
| `PUT` / `PATCH` | `var(--ms-teal)` on `rgba(0,206,201,0.1)` |
| `DELETE` | `var(--ms-red)` on `rgba(255,118,117,0.1)` |

Font: 10px, weight 600, monospace, letter-spacing 0.5px. Padding: `2px 6px`. Border-radius: 4px.

---

### 7.8 Skeleton Loaders

Used while waiting for backend responses (repo tree fetch, context load, Matrix room list).

```css
border-radius: 6px;
background: linear-gradient(
  90deg,
  var(--ms-bg3) 25%,
  var(--ms-bg4) 50%,
  var(--ms-bg3) 75%
);
background-size: 200% 100%;
animation: ms-shimmer 1500ms ease-in-out infinite;
```

Skeletons are sized to approximate the content they replace:

- Single line: `height: 12px; width: 60–80%`
- Heading: `height: 16px; width: 40–50%; margin-bottom: 8px`
- Card: `height: 80px; width: 100%`
- Avatar: `width: 28px; height: 28px; border-radius: 8px`

Skeleton rows are spaced with `gap: 8px` and rendered in groups of 3 with decreasing widths to simulate text.

---

## 8. Application Patterns

### 8.1 App Shell

The application shell is the persistent chrome present on all authenticated views.

```
┌──────────────────────────────────────────────────────┐
│ [M] MosaicStack Design System  [Foundations][Comp]  [☀️ Light] │
├──────────┬───────────────────────────────────────────┤
│  Repos   │  baum777 › mosaicStack › Chat             │
│  ─────── │  [Chat][Review][Tree][Matrix]             │
│  [repo]  │                                           │
│  ─────── │  Repo chat                 [● Streaming]  │
│  Workflow│                                           │
│  [Chat ●]│  Context: server/src/app.ts · 3 files    │
│  [Review]│                                           │
│  [Diffs] │  ┌─ AI ───────────────────────────────┐  │
│  ─────── │  │ Review complete. 2 issues found.   │  │
│  Know.   │  └────────────────────────────────────┘  │
│  [Matrix]│                                           │
│  [Prov.] │  [ Ask a question or request a review… ] │
│  ─────── │  [claude-3.5-sonnet][mosaicStack][● live]│
│  [⚙]     │                                           │
└──────────┴───────────────────────────────────────────┘
```

The sidebar persists all state including the SSE connection status. When the backend loses connection, the live indicator changes to `badge-amber badge-dot` labelled "Reconnecting" — not `badge-red` (which signals permanent error).

### 8.2 Chat Interface

The chat surface is the primary interaction mode.

#### Message Layout

User messages: right-aligned, `flex-direction: row-reverse`.  
AI messages: left-aligned, `flex-direction: row`.  
Gap between messages: 10px. Thread padding: 16px.

#### Avatar

28×28px, `border-radius: 8px`.  
AI: gradient `135deg, var(--ms-accent), var(--ms-teal)`, white initials `"M"`, font-size 11px weight 600.  
User: `var(--ms-bg4)`, initials in `var(--ms-text2)`.

#### Bubbles

Max-width: 76% of thread width.

AI bubble: `background: var(--ms-bg3); border: 1px solid var(--ms-border); border-radius: 12px; border-top-left-radius: 4px; padding: 10px 14px; font-size: 13px; line-height: 1.6`.

User bubble: `background: var(--ms-accent); color: white; border-radius: 12px; border-top-right-radius: 4px; padding: 10px 14px; font-size: 13px; line-height: 1.6`.

#### Streaming Bubble

When an AI message is in-flight:

```
[M]  [● Generating plan…]
```

The streaming bubble shows the SSE pulse dot + muted text label. As tokens arrive, they render directly into the bubble — no re-mount, no flash. The bubble grows in height naturally. No "typing indicators" (bouncing dots) — the pulse dot is sufficient.

#### Input Area

Sits at the bottom of the chat column, not fixed to the viewport (scrolls with content until reaching the bottom).

```
┌──────────────────────────────────────┐ [↑]
│ Ask about the codebase…              │
└──────────────────────────────────────┘
[claude-3.5-sonnet] [mosaicStack] [● live]
```

Input box: `background: var(--ms-bg3); border: 1px solid var(--ms-border2); border-radius: 10px; padding: 10px 14px; font-size: 13px`. Focus: same as base input.

Submit button: Primary sm `[↑ Send]`. Disabled when input is empty or stream is active.

Context chips row sits below the input. Chips are non-interactive `badge-gray` elements. The live status chip uses `badge-teal badge-dot`.

### 8.3 SSE Stream UI

Server-Sent Events are the canonical delivery mechanism for chat responses. The UI lifecycle is:

**State: `start`**  
The send button changes to a stop button (`badge-purple`). Input is disabled. The streaming bubble appears with pulse indicator.

**State: `token*`**  
Each token arrives and is appended to the bubble. No buffering — render on receive. The bubble auto-grows. Scroll follows the bottom of the bubble if the user has not manually scrolled up.

**State: `done`**  
Input re-enables. Stop button returns to Send. The streaming badge transitions to `badge-green`. The token counter (if shown) updates.

**State: `error`**  
`badge-red` appears on the message. The bubble renders the error message in `var(--ms-red)` text. A "Retry" ghost button appears below the bubble. The backend's error payload is shown verbatim in a code block.

**Malformed response (fail-closed)**  
If the SSE stream delivers a malformed or unexpected response, the UI shows `badge-red` labelled "Protocol error" and the raw response in a collapsed code block (not silently recovered). A "Report issue" ghost button links to the GitHub issues page.

### 8.4 GitHub Review Surface

The GitHub layer is the primary viewer path. It has five sequential steps:

1. **Browse** — Repo list. Cards in a 2-column grid.
2. **Select** — File tree. Monospace paths, depth-indented.
3. **Read** — File content with syntax-light highlighting.
4. **Review** — Proposal diff rendered in the diff card component.
5. **Approve / Execute** — Approval gate (see section 8.8).

The file tree uses:

```
📁 server/
  📁 src/
    📄 app.ts           ← modified  [● pending]
    📄 routes.ts
  📄 package.json
```

Folder icons: `▶ / ▼` for collapsed/expanded (no emoji, plain text glyphs). File status badges (`● pending`, `badge-green verified`) appear right-aligned. Monospace, 12px, line-height 2.

### 8.5 Matrix Knowledge Surface

The Matrix layer shows the shared knowledge space. It is read-only in v1 (write and execute flows remain contract-only).

#### Room List

Each room entry:

```
┌──────────────────────────────────────┐
│ #mosaicstack:matrix.org    [● joined]│
│ 3 topics · last active 4 min ago     │
└──────────────────────────────────────┘
```

Room name: monospace, `var(--ms-teal)`. Meta: 11px, `var(--ms-text3)`.

#### Knowledge Entry

Uses the Matrix knowledge card component (section 7.4). Entries are sorted by recency. Provenance state is shown as a badge: `verified`, `pending`, `contract-only`.

`contract-only` entries render with a dashed border and `opacity: 0.7` to signal they are not wired to a real Matrix origin.

### 8.6 Diff Viewer

The diff viewer renders proposed code changes before the approval gate.

Structure:

```
┌── server/src/routes/matrix.ts ──────────── [TypeScript] ─┐
│ @@ -42,7 +42,12 @@                                       │
│   context line                                            │
│ - const result = await client.execute(plan);              │
│ + const result = await client.execute(plan, {             │
│ +   timeout: 5000,                                        │
│ +   failClosed: true                                      │
│ + });                                                     │
│   return result;                                          │
└──────────────────────────────────────────────────────────-┘
```

File header: `background: var(--ms-bg3); padding: 8px 16px; font-family: var(--ms-mono); font-size: 12px; display: flex; justify-content: space-between; border-bottom: 1px solid var(--ms-border)`.

Hunk header (`@@ … @@`): `background: rgba(108,92,231,0.06); color: var(--ms-text3); font-family: var(--ms-mono); font-size: 11px; padding: 3px 16px`.

Lines are rendered as `display: flex` rows: `[gutter: 36px] [content: flex-1]`.

Gutter shows line numbers in `var(--ms-text3)`, 11px mono, right-aligned. Click on a gutter number opens an inline comment input.

The diff card has a two-button footer: `[Approve]` (Primary) and `[Reject]` (Danger), with a `[View in GitHub]` ghost button.

### 8.7 Model Selector

The model selector appears as a compact dropdown in the chat input area.

**Trigger:** `badge-purple [model-name]` — clicking opens the picker.

**Picker (dropdown):** `background: var(--ms-bg4); border: 1px solid var(--ms-border2); border-radius: var(--r2); padding: 8px; min-width: 260px`. Uses `position: absolute; bottom: calc(100% + 8px); left: 0` relative to the trigger.

**Model entries:**

```
[badge] claude-3.5-sonnet-20241022          [✓ active]
        Via OpenRouter · fast, capable
[badge] gpt-4o                              
        Via OpenRouter · multimodal
[badge] local/ollama                        
        Direct · no token cost
```

Model name: 13px monospace. Provider line: 11px `var(--ms-text3)`. Active marker: `✓` in `var(--ms-green)`.

Provider IDs never appear in the picker — only the model alias from `config/model-capabilities.yml`. This enforces the principle that provider IDs are not UI truth.

### 8.8 Approval Gate

The approval gate is the most critical UI pattern. It prevents browser-initiated writes to GitHub.

When a proposal is ready for execution, the UI enters the gate state:

```
┌─────────────────────────────────────────────────────┐
│ ⚠  Approval required                                │
│                                                     │
│ This action will push 3 changes to                  │
│ baum777/mosaicStack on branch main.                 │
│                                                     │
│ Diff: server/src/routes/matrix.ts (+12 / -4)        │
│       server/src/types.ts (+2 / -0)                 │
│                                                     │
│ Backend verification: ✓ Pre-flight passed           │
│ GitHub state:         ✓ Branch up to date           │
│                                                     │
│         [Cancel]          [Execute changes →]       │
└─────────────────────────────────────────────────────┘
```

The gate is a modal overlay. Background: `rgba(0,0,0,0.6)` over the shell. Modal: `background: var(--ms-bg2); border: 1px solid var(--ms-border2); border-radius: var(--r3); padding: 28px; max-width: 480px`.

The "Execute" button is Primary lg. It is disabled until both verification checks pass. Each check is shown as `✓` (green) or `⏳` (pending) or `✕` (failed). A failed check prevents execution regardless of user action.

After execution:

- Success → Toast success + badge-green on the diff card + "View in GitHub" ghost button
- Failure → Toast error + badge-red + raw error in collapsed code block + "Retry" option

The approval gate cannot be bypassed from the browser. The `GITHUB_AGENT_API_KEY` is only sent server-side via `X-MosaicStack-Admin-Key`.

---

## 9. Page Layouts

### 9.1 Authentication / Login

Full-viewport centred card. Background: `var(--ms-bg)` with a radial gradient vignette at 50% 0% (`var(--ms-accent)` at 10% opacity → transparent).

```
        [M] MosaicStack

    Connect your workspace

[GITHUB_TOKEN]  ───────────────── 
[MATRIX_BASE_URL]  ─────────────
[OPENROUTER_API_KEY]  ──────────

        [Connect →]

    baum777/mosaicStack · v1.0.0
```

Card: `max-width: 400px; background: var(--ms-bg2); border: 1px solid var(--ms-border); border-radius: var(--r3); padding: 40px`.

### 9.2 Settings

Two-column layout: left sidebar with sections (General, GitHub, Matrix, Models, Developer), right with form content. Uses the base input system exclusively. Saved state indicated by a `badge-green` "Saved" toast — no inline save indicators.

### 9.3 Error Pages

```
        [M]

     503 Backend unavailable

     The server is not reachable.
     Check your OPENROUTER_API_KEY
     and try again.

     [Retry connection]   [View logs →]
```

Minimal layout. No sidebar. Error code: `font-size: 64px; font-weight: 700; color: var(--ms-bg4)`. Message: body text, max-width 360px, centered. Buttons: Primary + Ghost.

---

## 10. Accessibility

### 10.1 Colour Contrast

All text/background combinations must meet WCAG 2.1 AA (4.5:1 for normal text, 3:1 for large text). In dark mode, `var(--ms-text)` (#f0eff4) on `var(--ms-bg)` (#0f0f11) achieves ~17:1. Badge text must meet 3:1 against badge backgrounds — test each semantic variant in both modes.

### 10.2 Focus Management

All interactive elements must be focusable via keyboard. Custom components (model picker, approval gate) manage focus trapping and restore focus on close.

Tab order must follow visual order. Skip-link to main content is present but visually hidden until focused.

### 10.3 ARIA

Streaming state: the SSE bubble region has `aria-live="polite"` and `aria-atomic="false"`. Screen readers announce each completed sentence, not each token.

Approval gate modal: `role="dialog"; aria-modal="true"; aria-labelledby="gate-title"`. Focus trapped within the modal. Escape closes the modal and returns focus to the trigger.

Status badges: `role="status"` when they update live (SSE lifecycle). `aria-label` includes the full meaning e.g. `aria-label="SSE stream: streaming"`.

### 10.4 Reduced Motion

All CSS animations are gated on `@media (prefers-reduced-motion: no-preference)`. When reduced motion is preferred: pulse animation stops (dot remains visible but static), skeleton shimmer becomes a static fill, transitions reduce to 50ms.

---

## 11. Dark Mode & Theming

### 11.1 Implementation

The theme is implemented as CSS custom properties on `:root` (dark, default) and `.light-mode` (light, applied to `#ds-root` or `body`).

Mode is toggled by:
1. User explicit toggle (persisted to `localStorage` as `ms-theme: "light" | "dark"`)
2. System preference via `prefers-color-scheme` (initial load only, overridden by explicit toggle)

### 11.2 Toggle Control

The mode toggle button in the topbar right zone:

```
[☀️ Light]   ←→   [🌙 Dark]
```

`padding: 5px 10px; border-radius: var(--r); border: 1px solid var(--ms-border2); background: var(--ms-bg3)`. Transition: background, color 150ms. Icon and label update together.

### 11.3 Transition

Mode switch uses a CSS transition on `:root` or `.light-mode`:

```css
transition: background 300ms ease, color 300ms ease;
```

Individual token values do not need transitions — the root transition handles all derived colours.

### 11.4 Rules

- Never hardcode a hex value in a component. Always use a CSS custom property.
- Test every component variant in both modes before shipping.
- Images and icons that are literal (photos, favicons) do not need to adapt. UI icons (SVG inline) must use `currentColor` or CSS variables.
- The Matrix accent `#00cec9` is the same in both modes — it's a brand colour, not a surface colour. Surface colours change; brand colours do not.

---

## 12. Responsive Behaviour

MosaicStack is a desktop-first application. The minimum supported viewport is 1024px wide. Mobile viewports are not currently in scope.

### 12.1 Breakpoints

| Name | Width | Behaviour |
|---|---|---|
| Desktop (default) | ≥ 1280px | Full 3-column shell |
| Compact | 1024–1279px | Sidebar collapses to icon-only (48px) |
| Not supported | < 1024px | "Use desktop browser" message |

### 12.2 Sidebar Collapse (Compact)

At 1024–1279px, the sidebar shows only icon glyphs (no text labels). Hover shows a tooltip with the label. Active item retains `background: rgba(108,92,231,0.12)`. Section labels are hidden.

### 12.3 Grid Adaptations

Component grids that use `grid-template-columns: 1fr 1fr` collapse to `1fr` at the compact breakpoint. The diff viewer and code browser maintain horizontal scroll rather than wrapping.

---

## 13. Icon System

MosaicStack v1 uses **text glyphs and Unicode symbols** rather than an SVG icon library. This avoids a bundled dependency and keeps the codebase TypeScript-only.

| Glyph | Meaning |
|---|---|
| `⊟` | Collapse / close repo |
| `⊞` | Expand / add |
| `⊡` | Review surface |
| `⊘` | Blocked / diffs |
| `⊛` | Matrix rooms |
| `⊙` | Provenance |
| `⊕` | Add / create |
| `↑` | Submit / send |
| `↗` | External link |
| `▶` / `▼` | Expand / collapse tree |
| `⋯` | More actions |
| `✓` | Verified / success |
| `✕` | Error / close |
| `⚠` | Warning |
| `●` | Live / streaming dot |
| `↻` | Retry / refresh |

All glyphs render at the component's inherited font-size unless explicitly sized. For the 4×4 logo grid, use inline SVG (`<rect>` elements) to ensure pixel-perfect rendering.

v2 will introduce Lucide React icons for a richer, consistent icon language.

---

## 14. CSS Custom Properties Reference

Complete list of all custom properties. Define in `:root {}` (dark default) and override in `.light-mode {}`.

```css
:root {
  /* Brand */
  --ms-accent:  #6c5ce7;
  --ms-accent2: #a29bfe;
  --ms-teal:    #00cec9;
  --ms-teal2:   #81ecec;

  /* Semantic */
  --ms-green:   #55efc4;
  --ms-amber:   #fdcb6e;
  --ms-red:     #ff7675;

  /* Surfaces */
  --ms-bg:      #0f0f11;
  --ms-bg2:     #171719;
  --ms-bg3:     #1e1e21;
  --ms-bg4:     #252529;
  --ms-surface: #1a1a1d;

  /* Text */
  --ms-text:    #f0eff4;
  --ms-text2:   #9b99a8;
  --ms-text3:   #5e5d6b;

  /* Borders */
  --ms-border:  rgba(255,255,255,0.07);
  --ms-border2: rgba(255,255,255,0.12);

  /* Typography */
  --ms-sans:  'DM Sans', system-ui, sans-serif;
  --ms-mono:  'JetBrains Mono', 'Courier New', monospace;

  /* Spacing */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-12: 48px;
  --sp-16: 64px;

  /* Radius */
  --r:  8px;
  --r2: 14px;
  --r3: 20px;

  /* Motion */
  --dur-fast:   100ms;
  --dur-base:   150ms;
  --dur-slow:   300ms;
  --dur-stream: 1200ms;
  --ease-hover: cubic-bezier(0.2, 0, 0, 1);
  --ease-enter: cubic-bezier(0.16, 1, 0.3, 1);
  --ease-exit:  ease-in;
}

.light-mode {
  --ms-bg:      #f5f4f8;
  --ms-bg2:     #ffffff;
  --ms-bg3:     #eeecf5;
  --ms-bg4:     #e5e3ef;
  --ms-surface: #ffffff;
  --ms-border:  rgba(0,0,0,0.07);
  --ms-border2: rgba(0,0,0,0.13);
  --ms-text:    #1a1929;
  --ms-text2:   #6b6882;
  --ms-text3:   #b0aec0;
  --ms-accent2: #4834d4;
  --ms-teal:    #00b5b1;
  --ms-teal2:   #007a78;
  --ms-amber:   #d4900a;
  --ms-red:     #d63031;
  --ms-green:   #00b894;
}
```

---

*MosaicStack UI Spec v1.0.0-alpha — maintained by @baum777*
