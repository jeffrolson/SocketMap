# ARCHITECTURE.md

How this system works. Components, data flow, infrastructure identifiers, and the
decisions behind them. Imported into agent context by `CLAUDE.md`, so treat it as
always-loaded.

**Ceiling: 400 lines.**

**No counts. No dates.** A number that describes the running system belongs in
`docs/STATE.generated.md`, which is regenerated and therefore cannot go stale.

Visual design tokens belong in `DESIGN.md`.

## Overview

SocketMap turns browser network captures into a standalone HTML file. There are two paths.
A Chromium NetLog (`chrome://net-export`, `edge://net-export`) produces the
troubleshooting report. HAR and generic JSON produce the interactive sequence diagram.

```
NetLog path (troubleshooting report)          HAR / JSON path (diagram)
[NetLog file]                                 [HAR / spans / IR JSON]
   │ netlog-stream: one event at a time         │ generic-parser
   ▼                                            ▼
[netlog-analyzer: capture model]              [Intermediate Representation (IR)]
   │ analysis: ratings, findings, summary       │ normalizer + svg-builder
   ▼                                            ▼
[report.html.mjs: standalone report]          [template.html.mjs: standalone diagram]
```

## Components

| Component | Responsibility | Runs on |
|---|---|---|
| `bin/traceviz.mjs` | CLI entrypoint, argument parsing, file format detection, browser launcher | Node.js CLI |
| `src/parsers/netlog-stream.mjs` | Incremental tokenizer: emits each NetLog event and top-level block (`constants`, `polledData`) as it completes | Node.js or browser |
| `src/parsers/netlog-analyzer.mjs` | Keeps a small summary per relevant NetLog source, follows `source_dependency` links, builds the capture model (environment, pages, requests, connections, DNS lookups) | Node.js or browser |
| `src/parsers/netlog-parser.mjs` | Node entry point: streams the file from disk through tokenizer and analyzer | Node.js |
| `src/redact.mjs` | Secret redaction for URLs and header lines | Node.js or browser |
| `src/cert.mjs` | Minimal X.509 reader: subject, issuer, root, expiry from PEM | Node.js or browser |
| `src/analysis.mjs` | Page selection, Good / Better / Best / Poor host ratings, findings, time breakdown, AI summary text | Node.js or browser |
| `src/renderer/report.html.mjs` | Troubleshooting report HTML: findings, hosts, waterfall, sequence diagram, environment, AI summary | Node.js or browser |
| `src/parsers/generic-parser.mjs` | Parser for HAR archives and generic span JSON traces | Node.js |
| `src/normalizer.mjs` | Maps events into canonical IR schema; credential redactor; critical path classifier & guidance engine | Node.js |
| `src/renderer/svg-builder.mjs` | Computes column geometry, lifelines, activation blocks, glow filters, markers, and blocking indicators | Node.js |
| `src/renderer/template.html.mjs` | Embeds SVG, pan/zoom, visual toggles, inspector drawer with guidance, and trace health dashboard | Node.js |
| `src/sample-data.mjs` | Synthetic reference trace for demo rendering and visual verification | Node.js |

## Data flow

NetLog capture, end to end:

1. `traceviz capture.json` reads the first bytes. A `constants` or `events` key means NetLog.
2. `netlog-parser` streams the file. `netlog-stream` emits each event as soon as its closing brace arrives.
3. `netlog-analyzer` updates a summary for the event's source (request, stream job controller, stream job, connect job, socket, HTTP/2 session, QUIC pool job, QUIC session, certificate verifier job, DNS job). Events themselves are discarded.
4. At end of file it follows the links: request → controller (proxy decision) → stream job → socket, HTTP/2 session, or QUIC session → connect job (DNS) and certificate verifier job (chain, public root or not). URLs and headers are redacted here.
5. `analysis` picks the page (the site with a main-frame load and the most requests), rates each host, and builds findings with evidence.
6. `report.html.mjs` writes one self-contained HTML file.

HAR or generic JSON, end to end:

1. User invokes `traceviz input-trace.json` via CLI.
2. The CLI inspects the input header bytes. If Chromium constants or events are present, it invokes `parseNetLog`; otherwise, `parseGenericTrace`.
3. The parser correlates events (DNS resolution, TCP/TLS connect, URL request/response) into chronological interactions.
4. Credentials (`Authorization`, `Cookie`, `Set-Cookie`, tokens) are sanitized via `redactSensitiveData`.
5. The normalizer produces the canonical Intermediate Representation with assigned participant roles, semantic colors, critical path classifications (`isBlocking`, `blockingReason`), and Good / Better / Best architectural guidance playbooks.
6. The SVG layout engine calculates coordinates: participant lifelines evenly spaced along the X-axis, sequential steps down the Y-axis, activation spans, critical path badges, and phase boundaries.
7. The HTML generator wraps the SVG and client-side interaction engine (pan/zoom, route dimming/highlighting, critical path toggle, visual density controls, inspector drawer with Lighthouse deep-links, and trace health dashboard) into a single standalone HTML document.
8. The output HTML is written to disk and optionally opened in the user's default browser.

## Non-obvious behavior

- Chromium NetLogs can exceed several hundred megabytes. Using `JSON.parse()` on the entire file causes Node.js heap exhaustion. The tokenizer tracks bracket depth and string state across chunks and parses one event at a time; the analyzer keeps per-source summaries, never the event list.
- NetLog phases come from `constants.logEventPhase`: `PHASE_BEGIN` is 1 and `PHASE_END` is 2 in current Chrome. Do not hard-code them.
- The response status line is always written as `HTTP/1.1 <code>`, even for HTTP/2 and HTTP/3. The protocol comes from which send-headers event fired (`HTTP_TRANSACTION_HTTP2_SEND_REQUEST_HEADERS`, `..._QUIC_...`, or the plain one).
- The page a request belongs to is the top-frame site: the first token of `network_isolation_key` on `URL_REQUEST_START_JOB`. Sites that are not `http(s)://` (new tab page, extensions, `null`) are background traffic.
- `CERT_VERIFIER_JOB` carries both the presented chain (begin) and `is_issued_by_known_root` (end). A chain to a root that is not a known public root is the TLS inspection signal. It covers QUIC too, whose sessions do not log PEM chains themselves.
- A connection counts as new for a request only if it finished setting up after that request started waiting for a stream. Only new connections contribute DNS, connect, and TLS time to a request.
- Redirects followed inside one request share a source. Timing phases describe the last leg; the time before it is reported as `redirect`.
- A capture Chrome never finished writing still parses: complete events are kept, `polledData` is simply absent.
- The sequence diagram in the report has display limits (`MAX_SEQUENCE_HOSTS`, `MAX_SEQUENCE_REQUESTS` in `report.html.mjs`). The waterfall and analysis always include every request.
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
- Decision: Stream the NetLog file and parse events individually; aggregate into per-source summaries without keeping events.
- Rationale: Chromium net-export files easily grow to hundreds of megabytes. Memory use must not grow with file size.
- Alternatives considered: `JSON.parse(fs.readFileSync())`; streaming but collecting all events first (the original implementation, which defeated the purpose).
- Trade-offs accepted: Custom tokenizer in `netlog-stream.mjs`; correlation happens once at end of file.

### Truthful Capture Model
- Status: Accepted
- Decision: The NetLog path reports only what the capture recorded. Missing values are null and shown as "not recorded".
- Rationale: This is a troubleshooting tool. A default that looks like data (a fixed latency, an assumed TLS version, an invented proxy hop) sends people to the wrong team.
- Alternatives considered: Filling gaps with typical values for a nicer diagram (the original implementation).
- Trade-offs accepted: Some cells are empty, for example certificate details for connections opened before the capture started.

### Report, Not Only a Diagram, for NetLogs
- Status: Accepted
- Decision: NetLog captures produce a report: findings, host ratings, waterfall, then the sequence diagram as a drill-down.
- Rationale: The audience is enterprise IT staff asking "why is this page slow and whom do I call". A waterfall and per-host ratings answer that; a sequence diagram of hundreds of requests does not.
- Alternatives considered: Sequence diagram as the only view.
- Trade-offs accepted: Two renderers (`report.html.mjs` for NetLog, `template.html.mjs` for HAR/JSON) until HAR moves to the report.

### Redact Secrets, Keep Evidence
- Status: Accepted
- Decision: Remove credentials (auth headers, cookies, tokens, signed-URL signatures, including in URLs). Keep IPs, hostnames, URLs, paths, and certificate details.
- Rationale: The report's readers are network, security, and vendor support teams who need addresses and paths. Credentials are never needed for diagnosis.
- Alternatives considered: Masking IPs and document paths by default.
- Trade-offs accepted: Reports identify the client machine's IP and the documents it opened; users must share them accordingly.

### Browser-Portable Core
- Status: Accepted
- Decision: Tokenizer, analyzer, redaction, certificate reader, analysis, and report renderer use no Node APIs.
- Rationale: The planned drag-and-drop HTML viewer runs the same code in the browser, so the capture never leaves the user's machine.
- Alternatives considered: Separate browser implementation later.
- Trade-offs accepted: A hand-written DER reader instead of `node:crypto` `X509Certificate`.

### Prescriptive Modern Web Guidance & Critical Path Classification
- Status: Accepted
- Decision: Annotate interactions with render-blocking status and Good / Better / Best optimization playbooks referencing Chrome Modern Web Guidance.
- Rationale: Raw visual diagrams show what happened but do not explain why it matters or how to optimize it. Prescriptive intelligence highlights render-blocking waterfalls and gives immediate architectural remediation steps.
- Alternatives considered: Passive visualization without guidance or diagnostic links.
- Trade-offs accepted: Small embedded guidance catalog in `src/normalizer.mjs`.

## External dependencies

| Service | Purpose | Why this one |
|---|---|---|
| Node.js Standard Library | Core runtime, filesystem, streaming, process spawning | Standard built-ins with zero supply chain risk |

## Known risks

- HAR/JSON diagrams with thousands of requests are tall. Mitigation: `--filter`, and the HAR parser's entry limit.
- The HAR parser still uses the fixed four-lifeline model and adds an invented upstream hop and default values. It does not yet meet the Truthful Capture Model decision.
- Pages with tens of thousands of requests produce a report HTML of tens of megabytes (every waterfall row carries its detail).
- NetLog cannot see page JavaScript/CPU time or security software inside the browser; findings say so rather than guess.
