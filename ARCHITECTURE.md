# ARCHITECTURE.md

How this system works. Components, data flow, infrastructure identifiers, and the
decisions behind them. Imported into agent context by `CLAUDE.md`, so treat it as
always-loaded.

**Ceiling: 400 lines.**

**No counts. No dates.** A number that describes the running system belongs in
`docs/STATE.generated.md`, which is regenerated and therefore cannot go stale.

Visual design tokens belong in `DESIGN.md`.

## Overview

SocketMap takes raw network traces (NetLog, HAR, generic JSON) and compiles them into
an interactive, signal-flow sequence diagram packaged into a standalone HTML artifact.

```
[NetLog / HAR / JSON] 
       │
       ▼ (streaming parser / generic parser)
[Intermediate Representation (IR)]
       │
       ▼ (svg-builder)
[Scalable Vector Graphics (SVG)]
       │
       ▼ (template.html.mjs)
[Standalone Self-Contained HTML]
```

## Components

| Component | Responsibility | Runs on |
|---|---|---|
| `bin/traceviz.mjs` | CLI entrypoint, argument parsing, file format detection, browser launcher | Node.js CLI |
| `src/parsers/netlog-parser.mjs` | Streaming chunked reader for Chromium NetLogs; event correlation and sanitization | Node.js |
| `src/parsers/generic-parser.mjs` | Parser for HAR archives and generic span JSON traces | Node.js |
| `src/normalizer.mjs` | Maps events into canonical IR schema; credential redactor | Node.js |
| `src/renderer/svg-builder.mjs` | Computes column geometry, lifelines, activation blocks, glow filters, and markers | Node.js |
| `src/renderer/template.html.mjs` | Embeds SVG, inline CSS reset, pan/zoom controller, tooltip, and inspector into HTML | Node.js |
| `src/sample-data.mjs` | Synthetic reference trace for demo rendering and visual verification | Node.js |

## Data flow

Follow one typical trace end to end:

1. User invokes `traceviz input-trace.json` via CLI.
2. The CLI inspects the input header bytes. If Chromium constants or events are present, it invokes `parseNetLog`; otherwise, `parseGenericTrace`.
3. The parser correlates events (DNS resolution, TCP/TLS connect, URL request/response) into chronological interactions.
4. Credentials (`Authorization`, `Cookie`, `Set-Cookie`, tokens) are sanitized via `redactSensitiveData`.
5. The normalizer produces the canonical Intermediate Representation with assigned participant roles and semantic colors.
6. The SVG layout engine calculates coordinates: participant lifelines evenly spaced along the X-axis, sequential steps down the Y-axis, activation spans, and phase boundaries.
7. The HTML generator wraps the SVG and client-side interaction engine (pan/zoom, route dimming/highlighting, tooltip, inspector drawer) into a single standalone HTML document.
8. The output HTML is written to disk and optionally opened in the user's default browser.

## Non-obvious behavior

- Chromium NetLogs can exceed several hundred megabytes. Using `JSON.parse()` on the entire file causes Node.js heap exhaustion. The streaming parser processes events incrementally using bracket depth counters and regex lookaheads without buffering the file.
- Chromium NetLog event types and source types are often numeric IDs mapped to strings via `constants.logEventTypes` and `constants.logSourceType`. The parser dynamically inverts these constants to resolve event names regardless of numeric assignment across Chrome versions.
- All SVG filters and markers are encapsulated inside `<defs>` with unique IDs. Text elements use `paint-order: stroke` to create an outline buffer, ensuring arrow labels remain legible when crossing lifelines and grid dots.

## Key decisions

### Zero External Dependencies
- Status: Accepted
- Decision: Do not introduce third-party npm packages for parsing, CLI parsing, rendering, or testing.
- Rationale: A trace visualizer must work reliably in air-gapped environments, CI pipelines, and quick local debugging sessions without `npm install` overhead.
- Alternatives considered: Commander.js for CLI, Cheerio for HTML, D3 for layout.
- Trade-offs accepted: Hand-crafted minimal CLI argument parser and SVG geometry generator instead of pulling in large external libraries.

### Streaming JSON Ingestion for NetLogs
- Status: Accepted
- Decision: Stream the NetLog file via `fs.createReadStream` and parse events individually.
- Rationale: Chromium net-export files easily grow to hundreds of megabytes. Streaming keeps the memory footprint under thirty megabytes.
- Alternatives considered: `JSON.parse(fs.readFileSync())`.
- Trade-offs accepted: Custom bracket and string parser logic in `netlog-parser.mjs`.

## External dependencies

| Service | Purpose | Why this one |
|---|---|---|
| Node.js Standard Library | Core runtime, filesystem, streaming, process spawning | Standard built-ins with zero supply chain risk |

## Known risks

- Traces with thousands of simultaneous HTTP requests can produce tall diagrams. Mitigation: requests are sorted chronologically and capped with `--filter` or `maxRequests` options to maintain visual clarity.
