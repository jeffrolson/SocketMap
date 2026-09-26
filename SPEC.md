# SPEC.md

Source of truth for features, requirements, and business logic. When this file
and the code disagree, this file wins and the code gets fixed.

## Features

### Resilient Trace Ingestion
- Purpose: Ingest Chromium NetLog (`chrome://net-export/`, `edge://net-export/`), HAR files, and generic JSON execution traces.
- Inputs: Path to NetLog JSON, HAR file, or JSON trace file.
- Outputs: For NetLog, a capture model (environment, pages, requests, connections, DNS lookups). For HAR/JSON, the IR.
- Business rules:
  - NetLog files are tokenized one event at a time; the event list is never held in memory. Truncated captures parse.
  - Each request is linked through Chrome's `source_dependency` graph to the stream job, socket or HTTP/2 or QUIC session, connect job, and certificate verifier job it actually used.
  - Event names, source types, phases, and net error names are resolved from the capture's own `constants`.
  - Every request is kept. Values the capture did not record are null.
  - Redact secrets: `Authorization`, `Proxy-Authorization`, `Cookie`, `Set-Cookie`, token/key/digest/signature headers, and secret URL parameters (for example `tempauth`, `access_token`, `code`, `SAMLResponse`, `sig`). Keep IPs, hostnames, URLs, and paths.
  - Support regex filtering on URLs and methods.
- Acceptance criteria: For each request, reports the real protocol, status, server IP, TLS version, certificate issuer and public-root status, and timing phases (redirect, queue, proxy lookup, DNS, connect, TLS, waiting for connection, send, server wait, download).

### NetLog Troubleshooting Report
- Purpose: Tell enterprise IT staff why a page loaded slowly and which team to involve.
- Inputs: NetLog capture model; optional page site (`--page`).
- Outputs: Standalone HTML report.
- Business rules:
  - Page selection: the non-background site with a main-frame load and the most requests, unless `--page` names one. Other sites are listed as other activity.
  - Environment card: browser, OS, capture time and mode, local IP, DNS servers and search domains, secure DNS, proxy setup, bad proxies.
  - Host ratings (Best / Better / Good / Poor; "not recorded" when the capture has no data):
    - Protocol (most used): HTTP/3 Best, HTTP/2 Better, HTTP/1.1 Good; QUIC failed with TCP fallback Poor.
    - TLS (weakest): 1.3 Best, 1.2 Better, older Poor.
    - Connection setup (slowest new connection): reused only Best, under 100 ms Better, 100 to 300 ms Good, over 300 ms or failed Poor.
    - DNS (slowest lookup): cached Best, under 20 ms Better, 20 to 100 ms Good, over 100 ms or failed Poor.
    - Path: direct Best, through a proxy Better, certificate chaining to a non-public root Poor.
    - Server wait (median time to first byte): under 200 ms Best, 200 to 500 ms Better, 500 ms to 1 s Good, over 1 s Poor.
  - Findings, each with severity, evidence lines from the capture, and the team to involve: TLS inspection, proxy authentication (407), calls to this computer or local network, proxy use, slow proxy lookup, failed requests, slow server, slow connection, slow DNS, QUIC failure, browser queueing, HTTP/1.1 hosts.
  - Waterfall with every page request; each row expands to timing, connection, certificate, and redacted headers.
  - Sequence diagram with one lifeline per host; connection setup drawn only for new connections. Host cards stay pinned while scrolling.
  - Plain language for every audience: clicking any arrow, activity bar, or host column opens an explanation (what happened, a verdict, each step with its meaning, where to look, technical details). Each waterfall row opens with a one-paragraph summary.
  - Learn tab with next steps, verified outbound links, and a glossary. Links open in a new tab; the report itself loads nothing remote.
  - AI summary: compact plain text with environment, time breakdown, findings, host ratings, and slowest requests.
- Acceptance criteria: Opens offline with no remote resources; contains no credentials; contains no value that is not in the capture.

### Signal-Flow SVG Layout Engine
- Purpose: Calculate geometry and render dark signal-flow sequence diagrams.
- Inputs: Normalized Intermediate Representation (IR).
- Outputs: Inline scalable SVG markup with glowing filters and custom arrow markers.
- Business rules:
  - Participant header cards with role-specific SVG iconography and semantic accents.
  - Vertical lifelines with glowing activation pills matching participant colors.
  - Interaction arrows color-coded by semantic kind: solid cyan/emerald (request), dashed gray (response), crimson (security/auth), purple (async), amber (retry/loop).
  - Horizontal phase swimlane divider lines with left-aligned category labels.
  - Self-loop bezier curves for internal operations and cache retries.
  - Anchored interaction legend at bottom-left.
- Acceptance criteria: Pure SVG markup rendered without external styling or image assets.

### Standalone Interactive HTML Generator
- Purpose: Package diagram into a zero-dependency, single-file HTML document.
- Inputs: Generated SVG, normalized trace data, guidance catalog, and trace inventory.
- Outputs: Standalone `.html` file.
- Business rules:
  - 100% self-contained: no external CDN links, remote scripts, or Google Fonts.
  - Interactive route hovering: highlights active participant route and dims unrelated lifelines.
  - Floating tooltip displaying exact latency (ms), HTTP method, status code, and payload size.
  - Native pan & zoom controls via mouse drag, wheel scroll, and floating toolbar.
  - Slide-out inspector drawer for detailed headers, performance ratings (Fast/Moderate/Slow), and payload inspection.
  - Instant text filter to highlight matching interactions.
- Acceptance criteria: File opens and functions 100% identically with network disconnected.

### Critical Path & Render-Blocking Classification
- Purpose: Distinguish requests that halt browser page rendering from asynchronous background operations. Applies to the HAR / JSON diagram.
- Inputs: Message phase, HTTP method, URL pattern, content type, and execution kind.
- Outputs: `isBlocking` boolean, `blockingReason`, and `⚡` visual badges.
- Business rules:
  - Synchronous document requests, render-blocking `<script>` and `<link rel="stylesheet">` tags in `<head>`, and synchronous API/database dependencies are tagged as blocking.
  - Non-blocking traffic (async/deferred scripts, preloaded fonts, background analytics, and persistent WebSocket/Firestore listeners) tagged as non-blocking.
  - `[⚡ Critical Path]` toggle in header dims all non-blocking routes to isolate the critical render waterfall.
- Acceptance criteria: Automatically flags render-blocking bottlenecks affecting Core Web Vitals (LCP, INP).

### Prescriptive Modern Web Guidance Engine
- Purpose: Map network interactions to actionable optimization patterns inspired by Chrome Modern Web Guidance. Applies to the HAR / JSON diagram.
- Inputs: Request classification (`dns_tls`, `render_blocking_asset`, `api_endpoint`, `database_service`, `async_background`).
- Outputs: Structured Good / Better / Best architectural recommendations and diagnostic links in inspector.
- Business rules:
  - Embed official playbooks directly into the diagram drawer for 100% offline access.
  - Provide direct hyperlinks to Google PageSpeed Insights (Lighthouse) and Chrome DevTools documentation.
- Acceptance criteria: Every inspected route includes concrete architectural remediation steps.

### Trace Inventory & Tech Stack Fingerprinting
- Purpose: Discover, catalog, and count all architectural building blocks and provide 1-click filtering.
- Inputs: Normalized trace messages, headers, URLs, and participants.
- Outputs: Aggregate catalog of Domains, Service Ports, Client Libraries, Infrastructure Tools, and Resource Types.
- Business rules:
  - Extract and count unique domains, ports, client libraries/frameworks (React, Next.js, Stripe.js, Firebase, etc.), and cloud tools (Cloudflare, GWS, Redis, Nginx, PostgreSQL, etc.).
  - Header button `[📦 Inventory (N)]` displays total component counts and opens a dedicated drawer view.
  - Clicking any inventory item or inspector fingerprint chip isolates matching routes with an active filter banner and clear button.
  - DOM event delegation with `data-filter-type` and `data-filter-value` ensures reliable client-side execution.
- Acceptance criteria: Displays complete KPI metrics and provides seamless 1-click interactive filtering.

### CLI Binary Entrypoint
- Purpose: Command-line interface for developer workflows.
- Inputs: CLI arguments (`bin/traceviz.mjs <file> [options]`).
- Outputs: Generated HTML file and optional browser launch.
- Business rules:
  - Supports `--sample` for immediate demo generation.
  - Supports `-o, --output` for custom output file paths.
  - Supports `--filter <regex>` for URL filtering.
  - Supports `--page <site>` to choose the analyzed site in a NetLog capture.
  - Supports `--open` to launch default system browser.
- Acceptance criteria: Executable via node directly or npm bin symlink.

## Requirements

### Functional
- Ingest Chromium NetLog, HAR, and generic JSON execution traces.
- Produce a troubleshooting report from a NetLog capture.
- Auto-detect input format without manual flags.
- Redact credentials by default.
- Produce standalone HTML file matching visual specifications.

### Non-functional
- Performance: Streaming NetLog parsing keeps heap memory low regardless of file size.
- Security: Zero telemetry sent externally, zero remote assets requested, credentials stripped.
- Portability: Zero runtime dependencies, runs on any Node.js LTS environment (macOS, Linux, Windows).

## Out of scope
- Live WebSocket proxying or packet sniffing at network interface layer.
- Binary PCAP/Wireshark raw packet capture decoding.
