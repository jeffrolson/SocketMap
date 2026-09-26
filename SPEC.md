# SPEC.md

Source of truth for features, requirements, and business logic. When this file
and the code disagree, this file wins and the code gets fixed.

## Features

### Resilient Trace Ingestion
- Purpose: Ingest Chromium NetLog (`chrome://net-export/`), HAR files, and generic JSON execution traces.
- Inputs: Path to NetLog JSON, HAR file, or JSON trace file.
- Outputs: Correlated network transaction events and participants.
- Business rules:
  - Streaming chunked parsing for NetLog files to prevent memory exhaustion on files up to 500MB+.
  - Correlate events by `source.id` and dependencies: DNS (`HOST_RESOLVER_IMPL_JOB`), TLS handshake (`CONNECT_JOB`/`SSL_CONNECT_JOB`), and HTTP transaction (`URL_REQUEST`/`HTTP_TRANSACTION`).
  - Redact sensitive credentials (`Authorization`, `Cookie`, `Set-Cookie`, API tokens) by default.
  - Support regex filtering on URLs and methods.
- Acceptance criteria: Correctly correlates DNS latency, handshake cipher, TTFB, and payload size.

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
- Purpose: Distinguish requests that halt browser page rendering from asynchronous background operations.
- Inputs: Message phase, HTTP method, URL pattern, content type, and execution kind.
- Outputs: `isBlocking` boolean, `blockingReason`, and `⚡` visual badges.
- Business rules:
  - Synchronous document requests, render-blocking `<script>` and `<link rel="stylesheet">` tags in `<head>`, and synchronous API/database dependencies are tagged as blocking.
  - Non-blocking traffic (async/deferred scripts, preloaded fonts, background analytics, and persistent WebSocket/Firestore listeners) tagged as non-blocking.
  - `[⚡ Critical Path]` toggle in header dims all non-blocking routes to isolate the critical render waterfall.
- Acceptance criteria: Automatically flags render-blocking bottlenecks affecting Core Web Vitals (LCP, INP).

### Prescriptive Modern Web Guidance Engine
- Purpose: Map network interactions to actionable optimization patterns inspired by Chrome Modern Web Guidance.
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
  - Supports `--open` to launch default system browser.
- Acceptance criteria: Executable via node directly or npm bin symlink.

## Requirements

### Functional
- Ingest Chromium NetLog, HAR, and generic JSON execution traces.
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
