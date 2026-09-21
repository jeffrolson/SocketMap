---
name: SocketMap
colors:
  primary: "#06B6D4"
  secondary: "#94A3B8"
  tertiary: "#10B981"
  neutral: "#070B12"
  surface: "#0B1120"
  on-surface: "#F8FAFC"
  error: "#F43F5E"
typography:
  h1:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1.5rem
  h2:
    fontFamily: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif
    fontSize: 1.125rem
  body-md:
    fontFamily: ui-monospace, "SF Mono", Menlo, monospace
    fontSize: 0.8125rem
  label-caps:
    fontFamily: ui-monospace, "SF Mono", Menlo, monospace
    fontSize: 0.6875rem
rounded:
  sm: 4px
  md: 8px
  lg: 14px
spacing:
  sm: 6px
  md: 12px
  lg: 24px
---

## Overview

SocketMap delivers a dark "signal-flow" aesthetic designed for high-density, mission-critical network analysis. The visual tone is technical, crisp, and telemetry-focused: deep obsidian canvas, illuminated neon activation lifelines, and sharp directional interaction routing.

## Colors

- **Primary (`#06B6D4` - Cyan):** Request flow, client-origin sync operations, active route indicators.
- **Secondary (`#94A3B8` - Slate):** Return arrows, dashed response lines, participant sublabels, lifelines.
- **Tertiary (`#10B981` - Emerald):** Live artifact status beacon, gateway edge nodes, successful connections.
- **Neutral (`#070B12` - Deep Navy/Black):** Canvas background foundation with subtle dotted grid overlay.
- **Surface / on-surface (`#0B1120` / `#F8FAFC`):** Participant header cards, inspector drawer, floating tooltip, legend.
- **Error (`#F43F5E` - Crimson):** Security barriers, authentication checks, credential verification.
- **Warning / Accent (`#F59E0B` - Amber):** Retry loops, cache fallbacks, origin service nodes.
- **Infrastructure (`#8B5CF6` - Purple):** DNS resolvers, DoH endpoints, async telemetry workers.

## Typography

- System Monospace (`ui-monospace, "SF Mono", Menlo, Monaco, Consolas, monospace`): Interaction labels, status codes, timings, latency badges, and inspector code payloads.
- Native System Sans (`-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif`): Participant titles, application branding, and UI control buttons.
- No external web fonts or CDN links: strictly system-native typography for 100% offline consistency.

## Spacing and radius

- Rounded 4px (`sm`): Badges, status chips, code boxes.
- Rounded 8px (`md`): Navigation controls, search inputs, tooltips.
- Rounded 10-14px (`lg`): Participant cards, live artifact badge, legend container.