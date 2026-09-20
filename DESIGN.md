---
name: [Project Name]
colors:
  primary: "#1A1C1E"
  secondary: "#6C7278"
  tertiary: "#2E64B8"
  neutral: "#F7F5F2"
  surface: "#FFFFFF"
  on-surface: "#1A1C1E"
  error: "#B00020"
typography:
  h1:
    fontFamily: Inter
    fontSize: 3rem
  h2:
    fontFamily: Inter
    fontSize: 2rem
  body-md:
    fontFamily: Inter
    fontSize: 1rem
  label-caps:
    fontFamily: Inter
    fontSize: 0.75rem
rounded:
  sm: 4px
  md: 8px
  lg: 16px
spacing:
  sm: 8px
  md: 16px
  lg: 24px
---

## Overview
[Brand personality in two or three sentences: what the product should feel like,
who it is for, the emotional tone. This prose is the agent's fallback when no
specific token or rule covers a decision.]

This file follows the Google `@google/design.md` format. It exists ONLY for projects
with a UI surface. Headless workers do not get a DESIGN.md. Validate before committing:

    npx @google/design.md lint DESIGN.md

Replace every token in the front matter with this venture's real palette and type
scale. For JR Generations ventures, pull from the venture's own brand standard, not
these placeholder values (August and Always in particular is a locked standard).

## Colors
Each color carries a semantic role so an agent never repurposes, for example, error
red as an accent.

- **Primary ([hex]):** [core text and headlines]
- **Secondary ([hex]):** [borders, captions, secondary text]
- **Tertiary ([hex]):** [sole driver for interaction: links, primary buttons]
- **Neutral ([hex]):** [background and foundation]
- **Surface / on-surface:** [card and content surfaces, and text placed on them]
- **Error ([hex]):** [validation and destructive states only]

## Typography
[Type families and scale, and when each level applies. Note any pairing rules.]

## Spacing and radius
[The spacing scale and corner-radius intent. When to use tight versus generous spacing.]

## Components
[Optional. Define component-level token pairs, for example button-primary background
and text color, so the linter can WCAG-check contrast. Keep compound states
(size + variant + disabled) minimal until a real need appears.]