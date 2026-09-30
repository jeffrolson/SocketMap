# ARCHITECTURE.md

How this system works: components, data flow, and the decisions behind them.
Visual design tokens live in `DESIGN.md`; features and requirements in `SPEC.md`.

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
| `src/parsers/netlog-evidence.mjs` | Capture-wide source/event aggregates, sanitized snapshots, bounded timeline bins and integrity | Node.js or browser |
| `src/diagnostic-insights.mjs` | Evidence-based next checks and bounded diagnostic AI handoff | Node.js or browser |
| `src/server-insights.mjs` | Reads Server-Timing, CDN and cache headers, timing-like headers and request IDs from recorded response headers; rolls them up per page | Node.js or browser |
| `src/renderer/server-insights.mjs` | Overview panel, per-request block and waterfall marker for server-reported evidence (HTML and CSS only) | Node.js or browser |
| `src/parsers/trace-stream.mjs` | Streaming Chrome trace reader: main thread only, long tasks, script time by union of nested events, paint and layout-shift markers, page requests; drops screenshots, source text, command lines and node names | Node.js or browser |
| `src/profile.mjs` | Aligns a profile to the NetLog from shared requests (median start difference) and places long tasks, activity bins and milestones on the NetLog timeline | Node.js or browser |
| `src/renderer/profile.mjs` | Profile Overview panel, waterfall main-thread band and per-request block | Node.js or browser |
| `src/path.mjs` | Reads the network path helper's JSON (allowlist, bounded, credentials removed from proxy and PAC addresses), joins it to the capture: curl versus browser per host, snapshot age, cautious observations, AI text | Node.js or browser |
| `src/renderer/path.mjs` | Overview panel for the path data, and the card that shows the command and offers the scripts as offline downloads | Node.js or browser |
| `src/renderer/helper-scripts.generated.mjs` | Text of tools/*.sh and *.ps1 (`npm run generate:tools`; `verify` checks it is current) | Node.js or browser |
| `tools/socketmap-path.sh`, `tools/socketmap-path.ps1` | The helper scripts: read link, DNS, proxy and PAC, public address, time hosts with curl, trace routes; write one JSON file | Mac and Linux shell, Windows PowerShell |
| `src/har-capture.mjs` | Builds a capture model from a HAR alone so it opens in the same report: unrecorded fields are null, TLS is split out of connect, entries with no page are background | Node.js or browser |
| `src/parsers/har-stream.mjs` | Streaming HAR tokenizer and per-entry summary: whitelists fields, drops bodies, headers, cookies and titles, redacts URLs | Node.js or browser |
| `src/enrichment.mjs` | Joins a summarized HAR to the capture model: nearest-start pairing, alignment quality, resource types, requesters, cache answers, load milestones | Node.js or browser |
| `src/renderer/enrichment.mjs` | HAR Overview panel, per-request block, waterfall type chips and milestone lines | Node.js or browser |
| `src/policy/catalog.mjs` | Curated, dated catalog of network and page-load policies, each with its vendor page per browser, status, paraphrased documentation and evidence-gated suggestions | Node.js or browser |
| `src/policy/engine.mjs` | Reads a policy export, matches it to the catalog, flags deprecated policies, cross-checks against the capture, renders results. Self-contained so the report embeds the same code | Node.js or browser |
| `src/renderer/policy.mjs` | Policy tab shell, upload area and the in-page script that embeds the engine | Node.js or browser |
| `src/coverage.mjs` | Coverage model: per-stage Recorded / Partial / Not in this file / Never in a NetLog statuses computed from the capture, next-capture suggestions, AI handoff text | Node.js or browser |
| `src/renderer/coverage.mjs` | Coverage tab: request-path map, per-stage rows, suggestions (HTML and CSS only, no script) | Node.js or browser |
| `src/renderer/diagnostics.mjs` | Capture-wide charts, snapshot tables, source search and sorting | Node.js or browser |
| `src/viewer/event-replay.mjs` | On-demand streaming event queries, decoded names, source navigation, bounded pages | Browser or pure matcher tests |
| `src/redact.mjs` | Recursive credential redaction for captured parameters, snapshots, URLs and headers | Node.js or browser |
| `src/cert.mjs` | Minimal X.509 reader: subject, issuer, root, expiry from PEM | Node.js or browser |
| `src/analysis.mjs` | Page selection, Good / Better / Best / Poor host ratings, findings, time breakdown, AI summary text | Node.js or browser |
| `src/comparison.mjs` | Compares selected pages from two capture models: request matching, recorded metric deltas and coverage, environment differences | Node.js or browser |
| `src/renderer/comparison.html.mjs` | Standalone A/B comparison, paired timing bars, request filters, environment table, evidence summary | Node.js or browser |
| `src/demo/sample-capture.mjs` | Synthetic NetLog capture (documentation IPs, throwaway certificates): the viewer's sample, `npm run demo`, and test fixtures | Node.js or browser |
| `src/theme.mjs` | Reads DESIGN.md front matter; turns tokens into CSS variables with semantic roles and local font fallbacks | Node.js or browser |
| `src/renderer/theme.generated.mjs` | Default theme compiled from DESIGN.md (`npm run generate:theme`; `verify` checks it is current) | Node.js or browser |
| `src/viewer/viewer-core.mjs` | Viewer pipeline without page APIs: capture reader, report builder, file check | Node.js or browser |
| `src/viewer/viewer-app.mjs` | Viewer page wiring: drop zone, chunked file read with progress, page picker, save report | Browser |
| `scripts/build-viewer.mjs` | Minimal bundler: packs the viewer and every module it imports into `socketmap-viewer.html` | Node.js |
| `src/explain.mjs` | Plain-language explanations: per diagram arrow and host column, waterfall summaries, rating meanings | Node.js or browser |
| `src/renderer/learn.mjs` | Learn tab: next steps, curated outbound links, glossary | Node.js or browser |
| `src/renderer/report.html.mjs` | Troubleshooting report HTML: findings, hosts, waterfall, sequence diagram with click-to-explain panel, environment, AI summary, Learn tab | Node.js or browser |
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

The drag-and-drop viewer runs steps 2 to 6 in the browser: `File.stream()` feeds decoded chunks to the same tokenizer and analyzer, and the report renders into an iframe.

The viewer and report share a theme preference script and token-based light/dark CSS. The initial appearance follows a saved preference or the operating system; validated parent/frame messages synchronize changes without rebuilding the report. Saved HTML embeds the selected mode. `DESIGN.md` provides the dark `colors` map and the light `light-colors` map; company themes can override either.

The environment model allowlists recorded browser, DNS, and proxy fields and sanitizes credential-bearing metadata before it reaches the renderer or AI summary. The summary separates recorded request/connection details from derived findings and ratings, limits long lists with omission counts, and can be exported as plain text.

The viewer can retain two capture models with independent source metadata and site selections. It streams their files sequentially and only replaces the active state after parsing and report generation succeed. A/B comparisons match exact method and redacted URL (fragment ignored), then pair repeated occurrences chronologically; unknown identifiers stay unpaired. `request.endRecorded` distinguishes an actual end event from an unfinished request. Unrecorded ends and durations are null; separate observed spans support drawing without claiming completion. Completion-based comparison metrics require recorded ends, and partial measurements show coverage. Swapping exchanges the entire capture state. Comparison HTML embeds only the selected rendered evidence, has its own filtering and theme controls, and works without the original files or viewer. Full A/B reports are available in the viewer; they are not embedded in the saved comparison.

The analyzer also sends every event to `netlog-evidence`, including source families it does not understand as page requests. The index retains counts, dependencies, first/last sanitized parameter samples per event type, every sanitized `polledData` field, constants and scalar top-level metadata. It never retains the raw event list. Timeline bins reaggregate with bounded storage; byte/event totals and observed activity states remain distinct. Incomplete JSON and malformed entries produce integrity warnings. Files with constants after events get a second streaming pass with the captured dictionary seeded; no raw-event queue is used.

Event inspection rescans the original local `File` only when requested, keeps one page of sanitized matches, and bounds open duration-pair tracking. Viewer reports request that File through a source-validated parent-frame message; standalone saved reports offer a local file picker. The original capture is never embedded or uploaded. Snapshot and source summaries remain available in a saved report without that file. Captures with no page requests open directly in Diagnostics. Capture comparisons also compare recorded snapshot values and independent source-family totals; source IDs are never matched across different captures.

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
- `CERT_VERIFIER_JOB` carries both the presented chain (begin) and `is_issued_by_known_root` (end). A chain to a root that is not a known public root is a reason to investigate TLS inspection or a privately managed certificate; it does not establish the cause. It covers QUIC too, whose sessions do not log PEM chains themselves.
- A connection counts as new for a request only if it finished setting up after that request started waiting for a stream. Only new connections contribute DNS, connect, and TLS time to a request.
- Redirects followed inside one request share a source. Timing phases describe the last leg; the time before it is reported as `redirect`.
- A capture Chrome never finished writing still parses: complete events are kept, `polledData` is simply absent.
- `.gitattributes` forces LF line endings so generated-file checks and tests behave the same on Windows. `npm test` relies on Node's own test-file discovery (`**/*.test.mjs`), not a shell glob.
- The viewer's start page is also the product explainer. It must only state what the tool does and numbers that were measured.
- The report is one page with views switched by script (`.view.is-active`); without script every view shows. In-page `#` links are handled by the report's own click handler, because inside the viewer the report is an `srcdoc` iframe and `#` links would resolve against the viewer's address.
- The sequence view is HTML, not SVG: rows are positioned with CSS variables (`--a`, `--w` as fractions of the host columns), the host header is `position: sticky` inside the scroll container, and explanations are embedded as JSON (`#seq-explain`) keyed by row (`seq-N`) and column (`card-<id>`).
- Waterfall and sequence rows carry `data-flags` (error, slow, inspected, local) and `data-search`; one filter bar in the top bar drives both.
- The sequence diagram in the report has display limits (`MAX_SEQUENCE_HOSTS`, `MAX_SEQUENCE_REQUESTS` in `report.html.mjs`). The waterfall and analysis always include every request.
- Chromium NetLog event types and source types are often numeric IDs mapped to strings via `constants.logEventTypes` and `constants.logSourceType`. The parser dynamically inverts these constants to resolve event names regardless of numeric assignment across Chrome versions.
- All SVG filters and markers are encapsulated inside `<defs>` with unique IDs. Text elements use `paint-order: stroke` to create an outline buffer, ensuring arrow labels remain legible when crossing lifelines and grid dots.

- The HAR is an optional enrichment, never a second source of truth. `attachHar` sets `model.enrichment`; every view reads it from there, and absent data stays absent. Requests join on method plus redacted URL, pairing repeated URLs by nearest start on the wall clock (NetLog `captureStartedAt` plus request start against the HAR `startedDateTime`); a HAR entry with no partner stays unmatched and is explained (redirect step, cache, service worker). URLs are kept whole for matching because login URLs are long.

- A HAR on its own is a first-class input: `buildCaptureFromHar` gives the report the same model a NetLog does. A HAR's `connect` includes `ssl`, so TLS is subtracted from connect; `blocked` is kept as queue time; a null (`-1` in the file) means not applicable or not recorded and stays null rather than becoming zero. Entries with no page are background when the HAR names its pages. Response headers are kept (credentials masked) only in this mode, feeding server insights; request headers, bodies and cookies are never read. The report hides Diagnostics and Events and says why.

- The network path helper's file is a snapshot of the computer, not of the capture. `collectedAt` against the capture's start gives the gap, shown in the panel and worded into the AI text. Curl runs without the system proxy, so browser-versus-curl gaps are worded as pointing at the browser's path, never as a cause. Route probes are one per hop (UDP on Mac and Linux, ICMP on Windows) and silent hops are common, so route findings are hints. The scripts read settings and make only the requests their header states; a test fails if a script gains a command that changes settings or an unexpected URL. Windows Wi-Fi signal is estimated from the percentage Windows reports. The Windows script is run by CI on a Windows runner, the Mac script on macOS and Linux runners.

- A policy export from a managed browser adds per-policy flags (`ignored`, `deprecated`, `future`, `info`, `restartRequired`, `conflicts`, `superseded`) on top of `value`, `scope`, `level` and `source`. Their names come from Chromium's exporter; a real managed export (Chrome 134) confirmed `level`, `scope`, `source`, `value` and `error`. The policy list sits under `policyValues` in newer Chrome and `policyGroups` in Chrome 134 and earlier; the reader accepts both. The engine reports them as "Browser reported" statements and never judges them. Edge's own keys are inferred: same exporter, product name in `chromeMetadata.application`.

- A Performance profile is aligned by requests, not by an assumed clock. Chrome traces use the browser's monotonic clock (`clock-domain` in the metadata). A genuine pair recorded in one session showed this is the same clock as the NetLog's event times (the request-based offset matched trace time minus the NetLog's first tick to within 5 ms), but two files recorded in different runs share no clock, so `joinProfile` pairs requests both files recorded (method plus redacted URL, in time order) and uses the median difference in start time as the offset. Only when no request is shared does it fall back to the shared clock (offset = minus the NetLog's first tick), and only if the profile's navigation lies inside the capture's time span and its host appears in the capture's requests; otherwise the profile is not placed. The trace's `ResourceSendRequest` precedes the network stack's start by a small, consistent amount, which the offset absorbs. The page is the last navigation of an outermost main frame to an `http(s)` document (blank tabs, `chrome://` and extension pages navigate too, often after the page loads). Only events that name the page's own frame count for milestones (frameless and other-frame events are not the page). Busy time counts top-level `RunTask` durations on the page's main thread; script time is the union of `EvaluateScript`, `FunctionCall` and `v8.compile` intervals so nesting is not double counted.

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
- Rationale: Insights must be grounded in recorded evidence. A default that looks like data (a fixed latency, an assumed TLS version, an invented proxy hop) can lead to the wrong decision.
- Alternatives considered: Filling gaps with typical values for a nicer diagram (the original implementation).
- Trade-offs accepted: Some cells are empty, for example certificate details for connections opened before the capture started.

### Report, Not Only a Diagram, for NetLogs
- Status: Accepted
- Decision: NetLog captures produce a report: findings, host ratings, waterfall, then the sequence diagram as a drill-down.
- Rationale: The audience needs data-driven insights into how a page loaded and what to investigate next. Findings, a waterfall, and per-host ratings provide context for those decisions alongside the detailed sequence diagram.
- Alternatives considered: Sequence diagram as the only view.
- Trade-offs accepted: Two renderers. `report.html.mjs` serves a NetLog and a HAR on its own; `template.html.mjs` (the older diagram) remains for generic JSON traces and `--diagram`.

### Redact Secrets, Keep Evidence
- Status: Accepted
- Decision: Remove credentials (auth headers, cookies, tokens, signed-URL signatures, including in URLs, and well-known token shapes under any name). `npm run audit:redaction` checks real captures against the generated report. Keep IPs, hostnames, URLs, paths, and certificate details.
- Rationale: The report's readers are network, security, and vendor support teams who need addresses and paths. Credentials are never needed for diagnosis.
- Alternatives considered: Masking IPs and document paths by default.
- Trade-offs accepted: Reports identify the client machine's IP and the documents it opened; users must share them accordingly.

### Design Tokens From DESIGN.md
- Status: Accepted
- Decision: DESIGN.md (Google design.md format) is the single source for colors, fonts, and rounding. Its tokens compile into `theme.generated.mjs`; the report maps them to semantic roles (`--bg`, `--poor`, `--seg-dns`, ...) with fallbacks, so a partial company theme still renders.
- Rationale: Company branding without code changes, and one place to change the look.
- Alternatives considered: Hard-coded CSS per renderer (the previous approach).
- Trade-offs accepted: A small YAML subset parser; token values are filtered to safe CSS characters.

### Self-Built Viewer Bundle
- Status: Accepted
- Decision: `scripts/build-viewer.mjs` bundles the browser modules into one HTML file by wrapping each module in a function and linking named imports. It accepts only named relative imports and `export function` / `export const`, and fails the build on anything else or on Node APIs.
- Rationale: Zero dependencies rules out esbuild or Rollup; ES module `<script type="module">` imports do not work from `file://`, and the viewer must work as a double-clicked file.
- Alternatives considered: Inlining modules as `data:` URL imports; a third-party bundler.
- Trade-offs accepted: Modules must stick to the supported syntax. A test runs the bundle and requires its report to match the CLI report byte for byte.

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

- HAR/JSON diagrams (generic JSON, and a HAR with `--diagram`) with thousands of requests are tall. Mitigation: `--filter`, and the HAR parser's entry limit.
- The legacy diagram parser (generic JSON, and a HAR with `--diagram`) still uses the fixed four-lifeline model and adds an invented upstream hop and default values. It does not meet the Truthful Capture Model decision; a HAR on its own no longer goes through it.
- Pages with tens of thousands of requests produce a report HTML of tens of megabytes (every waterfall row carries its detail).
- The Diagnostics view embeds recorded evidence: raw snapshot JSON and first/last event samples per source. On a 5 MB real capture it is most of an 8 MB report, versus a few hundred KB before Diagnostics existed. Snapshot and DNS tables are capped at 100 rows (the raw JSON keeps every row), and event samples are kept only for the 100 most eventful sources plus any with errors (a real 5 MB capture: 8.2 MB down to 6.2 MB). The viewer replays any source from the original file.
- NetLog cannot see page JavaScript/CPU time or security software inside the browser; findings say so rather than guess.
