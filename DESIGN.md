---
name: Telemetry Trace Dark
colors:
  surface: '#0b1326'
  surface-dim: '#0b1326'
  surface-bright: '#31394d'
  surface-container-lowest: '#060e20'
  surface-container-low: '#131b2e'
  surface-container: '#171f33'
  surface-container-high: '#222a3d'
  surface-container-highest: '#2d3449'
  on-surface: '#dae2fd'
  on-surface-variant: '#bfc7d2'
  inverse-surface: '#dae2fd'
  inverse-on-surface: '#283044'
  outline: '#89929b'
  outline-variant: '#3f4850'
  surface-tint: '#93ccff'
  primary: '#93ccff'
  on-primary: '#003351'
  primary-container: '#3198dc'
  on-primary-container: '#002c47'
  inverse-primary: '#006398'
  secondary: '#7bd0ff'
  on-secondary: '#00354a'
  secondary-container: '#00a6e0'
  on-secondary-container: '#00374d'
  tertiary: '#4edea3'
  on-tertiary: '#003824'
  tertiary-container: '#00a572'
  on-tertiary-container: '#00311f'
  error: '#ffb4ab'
  on-error: '#690005'
  error-container: '#93000a'
  on-error-container: '#ffdad6'
  primary-fixed: '#cce5ff'
  primary-fixed-dim: '#93ccff'
  on-primary-fixed: '#001d31'
  on-primary-fixed-variant: '#004b73'
  secondary-fixed: '#c4e7ff'
  secondary-fixed-dim: '#7bd0ff'
  on-secondary-fixed: '#001e2c'
  on-secondary-fixed-variant: '#004c69'
  tertiary-fixed: '#6ffbbe'
  tertiary-fixed-dim: '#4edea3'
  on-tertiary-fixed: '#002113'
  on-tertiary-fixed-variant: '#005236'
  background: '#0b1326'
  on-background: '#dae2fd'
  surface-variant: '#2d3449'
  warning: '#f59e0b'
  warning-container: '#3b2a06'
  chart-redirect: '#c084fc'
  chart-queue: '#3f4850'
  chart-proxy: '#f472b6'
  chart-dns: '#3198dc'
  chart-connect: '#f59e0b'
  chart-tls: '#a78bfa'
  chart-stalled: '#89929b'
  chart-send: '#bfc7d2'
  chart-wait: '#4edea3'
  chart-download: '#7bd0ff'
typography:
  headline-xl:
    fontFamily: Inter
    fontSize: 2.25rem
    fontWeight: '700'
    lineHeight: 2.75rem
    letterSpacing: -0.025em
  headline-xl-mobile:
    fontFamily: Inter
    fontSize: 1.75rem
    fontWeight: '700'
    lineHeight: 2.25rem
    letterSpacing: -0.02em
  headline-lg:
    fontFamily: Inter
    fontSize: 1.5rem
    fontWeight: '600'
    lineHeight: 2rem
    letterSpacing: -0.02em
  headline-lg-mobile:
    fontFamily: Inter
    fontSize: 1.25rem
    fontWeight: '600'
    lineHeight: 1.75rem
    letterSpacing: -0.015em
  headline-md:
    fontFamily: Inter
    fontSize: 1.125rem
    fontWeight: '600'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-lg:
    fontFamily: JetBrains Mono
    fontSize: 0.9375rem
    fontWeight: '400'
    lineHeight: 1.5rem
    letterSpacing: -0.01em
  body-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '400'
    lineHeight: 1.375rem
    letterSpacing: 0em
  body-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.75rem
    fontWeight: '400'
    lineHeight: 1.125rem
    letterSpacing: 0.01em
  label-md:
    fontFamily: JetBrains Mono
    fontSize: 0.8125rem
    fontWeight: '500'
    lineHeight: 1.125rem
    letterSpacing: 0.02em
  label-sm:
    fontFamily: JetBrains Mono
    fontSize: 0.6875rem
    fontWeight: '600'
    lineHeight: 1rem
    letterSpacing: 0.05em
rounded:
  sm: 0.125rem
  DEFAULT: 0.25rem
  md: 0.375rem
  lg: 0.5rem
  xl: 0.75rem
  full: 9999px
spacing:
  gutter: 1rem
  gutter-mobile: 0.75rem
  margin: 1.5rem
  margin-mobile: 0.75rem
  space-xs: 0.25rem
  space-sm: 0.5rem
  space-md: 0.75rem
  space-lg: 1.25rem
  space-xl: 2rem
---

## Brand & Style

This design system embodies an uncompromising developer-first, mission-critical ethos: precision instrumentation, zero visual fluff, and pure signal fidelity. Built for infrastructure engineers, network specialists, and systems developers examining raw network telemetry (PCAP, HAR, WebSocket frames, and raw TCP streams), the interface prioritizes immediate density, diagnostic clarity, and ergonomic legibility under extended triage cycles.

The design language balances high-tech minimalism with functional terminal aesthetics:
- **Foundational Mood:** Unflinching stability, tactical dark slate architecture, and laser-focused telemetry.
- **Visual Stance:** Surgical contrast. Information density is treated as an asset rather than visual debt; data surfaces act as interactive packet inspectors rather than passive cards.
- **Micro-Interactions:** Snappy, instantaneous transitions (under 120ms) mimicking low-latency command-line utilities. Interactive sequence lanes, packet stream filters, and payload inspectors feature crisp 1px borders, subtle luminous highlights, and precise cursor feedback.

## Colors

The palette is engineered specifically for prolonged diagnostic inspection across high-density telemetry surfaces. **The tokens in the front matter are the source of truth**; this section explains their roles.

- **Primary (`primary` `#93ccff`) & Secondary (`secondary` `#7bd0ff`):** The primary signal vector. Requests, active lifelines, focus rings, selected rows. `primary-container` (`#3198dc`) fills primary buttons and active navigation.
- **Tertiary (`tertiary` `#4edea3`):** Healthy / success (HTTP 2xx, established connections, "Best" ratings).
- **Warning (`warning` `#f59e0b`):** Degraded or slow (slow server waits, "Good" ratings, medium findings).
- **Error (`error` `#ffb4ab`, `error-container` `#93000a`):** Failures, TLS inspection, "Poor" ratings, high findings.
- **Neutral core:** Base canvas `surface-container-lowest` (`#060e20`), page background `background` (`#0b1326`), panels `surface-container-low` (`#131b2e`), elevated surfaces and inputs `surface-container-high` (`#222a3d`).
- **Borders & Dividers:** `outline-variant` (`#3f4850`) by default, `outline` (`#89929b`) on hover, `secondary` on selection.
- **Charts:** `chart-*` tokens color the timing phases (redirect, queue, proxy, DNS, connect, TLS, waiting, send, server wait, download) in the waterfall and inspector.
- **Contrast Ratios:** Monospace data and body text on these surfaces meet WCAG AA or better.

## Typography

Typography establishes an intentional dichotomy between structural human navigation and mechanical raw payload computation:

- **Structural Headings (`Inter`):** Inter provides tight, neutral, geometric control over layout containers, section headings, and diagnostic dashboard bars. Tight letter tracking (`-0.025em`) imparts a compact, modern engineering tone.
- **Operational Data & Payload (`JetBrains Mono`):** Every data readout, latency indicator, packet offset, CLI prompt, JSON/Hex frame, and protocol label runs strictly on JetBrains Mono. Tabular figures and code ligatures are active by default to guarantee perfect vertical column alignment in trace streams.
- **Hierarchy Rules:** Section labels and protocol pill indicators utilize uppercase `label-sm` with widened letter-spacing (`0.05em`) for immediate perceptual grouping.

## Layout & Spacing

This design system implements a strict, high-density layout paradigm optimized for wide multi-lane network sequence diagrams and deep telemetry inspection tables:

- **Workbench Layout Architecture:** The default canvas employs a 12-column adaptive fluid grid flanked by an optional fixed 320px telemetry inspection sidebar. The primary sequence canvas dynamically expands while maintaining fixed vertical swimlanes for each IP node or socket endpoint.
- **Vertical Rhythm & Compact Density:** Compact spacing tokens (`space-xs` = 4px, `space-sm` = 8px, `space-md` = 12px) govern internal component padding to maintain maximal visible packet sequences per viewport fold.
- **Responsive Adaptations:**
  - **Desktop (>= 1280px):** Simultaneous split-view with trace swimlanes on the left (spanning remaining columns) and payload byte-inspector sidebar docked on the right.
  - **Tablet (768px - 1279px):** Inspector transitions into a bottom-docked slide-over panel; sequence swimlanes enable horizontal touch/trackpad panning with pinned endpoint headers.
  - **Mobile (< 768px):** Flow diagrams condense into a linear vertical event stream list; packet deep-dive opens in a full-screen modal viewport.

## Elevation & Depth

Visual hierarchy does not rely on heavy, fuzzy drop shadows; instead, it is enforced through tonal surface layering, crisp 1px borders, and subtle technical backdrops:

- **Surface Tiers:**
  - **Base Canvas (Level 0):** `surface-container-lowest` — background for the sequence canvas and code blocks.
  - **Panel Layer (Level 1):** `surface-container-low` — cards, sidebar, inspector.
  - **Elevated Overlay (Level 2):** `surface-container-high` — inputs, chips, hover states, the sticky participant header.
- **Borders as Structure:** Clean, 1px solid edges (`outline-variant`) define all functional boundaries. Cards and panels do not bleed into the background; their limits are mathematically explicit.
- **Subtle Glassmorphism & Overlays:** Sticky swimlane headers and the top command bar use a translucent `surface-container-low` with `backdrop-filter: blur(8px)` and a faint `secondary` bottom border, so sequence lines stay visible while scrolling.
- **Focus & Glow:** Selected rows and arrows emit a subtle `secondary` glow.

## Shapes

The shape system adopts a tight `Soft` geometry (`roundedness: 1`):
- **Base Components:** Standard buttons, input bars, code tabs, and status badges feature an exact `0.25rem` (4px) corner radius.
- **Containers & Drawers:** Main inspection panels, sequence frame containers, and modal dialogs step up to `rounded-lg` (`0.5rem` / 8px).
- **Interactive Nodes:** Lifeline nodes, packet direction arrowheads, and endpoint icons maintain sharp, industrial chamfers or micro-radii to preserve a high-precision instrumentation aesthetic.

## Components

### Buttons & Interactive Triggers
- **Primary Action (e.g., Save report):** `primary-container` background, `on-primary-container` text, `0.25rem` radius. Hover brightens.
- **Secondary Action (e.g., filters, copy):** `surface-container-high` background, 1px `outline-variant` border, `on-surface-variant` text in the mono face. Hover: `on-surface` text, `secondary` border.
- **Command Prompt Trigger:** Monospace terminal input trigger styled as an inline shell snippet (`$ socketmap inspect trace.pcap`) with a blinking cursor block.

### Badges & Protocol Chips
- **Protocol Tags (TCP, TLS 1.3, H2, H3, status codes):** Height of 20px, font `label-sm`, uppercase, 1px border in the tag color over a faint tint of it:
  - *Protocol / transport:* `secondary`.
  - *Encryption (TLS):* `chart-tls`.
  - *Healthy (2xx, cache):* `tertiary`.
  - *Slow / degraded:* `warning`.
  - *Failed / inspected:* `error`.

### Sequence Lifeline & Trace Arrows
- **Actor/Node Box:** Pinned top box labeled with hostname and IP, `surface-container` fill, 1px `outline-variant` border.
- **Vertical Lifeline:** 1px dashed `outline-variant` descending line.
- **Signal Vector (Arrow):** 1px horizontal solid line with SVG arrow terminal. Displays compact latency badge above (e.g., `+1.42ms`) and frame type below in `JetBrains Mono` `body-sm`.

### Input Fields & Filter Bars
- **Trace Filter Input:** `surface-container-lowest` background with a prefix icon (`>_`). 1px `outline-variant` border. On focus, the border switches to `secondary`. Font `JetBrains Mono` `body-md` with custom syntax highlighting for filtering expressions (e.g., `proto == 'ws' && latency > 50ms`).

### Inspection Cards & Hex Inspectors
- **Inspector Panel:** `surface-container-low` container with an upper tab strip (`Frame Overview`, `Headers`, `Hex Dump`, `Decoded JSON`).
- **Hex Dump Viewer:** Two-column grid (Offset | Byte Matrix | ASCII Translation). Zero padding, strict monospace alignment, active byte hovered in the sequence highlights synchronized spans across both raw and decoded panes.

## Implementation notes (SocketMap)

- Reports and the viewer read these tokens at build time: `npm run generate:theme` compiles them into `src/renderer/theme.generated.mjs`, and `--theme <path/to/DESIGN.md>` swaps in another file (for example a company theme under `themes/<company>/DESIGN.md`).
- Nothing is loaded remotely. Inter and JetBrains Mono are used when installed; otherwise the stacks fall back to system faces (Segoe UI / SF / Roboto; Cascadia Mono / SF Mono / Menlo / Consolas). Icons are inline SVG.
- Readers include non-technical staff: plain-language text uses the sans face at body size; the mono face is for data (times, IPs, URLs, codes).
