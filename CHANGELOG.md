# CHANGELOG.md

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.9.0] - 2026-09-29
### Added
- **Policy tab:** an optional upload area for a `chrome://policy` or `edge://policy` JSON export. It lists the policies that shape the network path (proxy and PAC, QUIC, DNS, prediction, certificate revocation, connection limits, caching, background running) with each value in plain words, flags policies the vendor has deprecated with their replacement, notes a documented override (Chrome: `ProxyMode` is ignored when `ProxySettings` is set), cross-checks a policy against the capture (for example QUIC blocked by policy while the capture used HTTP/3), and suggests policies worth considering only when this capture provides evidence. The export is read in the page only, secrets are removed, and nothing is uploaded or saved into the report. Every entry links to its Chrome Enterprise or Microsoft Edge documentation page and is labeled **Documented** (paraphrased from the vendor) or **SocketMap guidance** (our judgment), with a note when the paraphrase came from the other browser's page. Policies outside the catalog are counted, not judged. The catalog carries a review date. `npm run check:policy-links` confirms every vendor link still resolves. Policies that report an error or warning in the export are surfaced as "Browser reported". Validated so far against unmanaged Chrome exports and synthetic data; managed-device and Edge exports are expected to work but are not yet confirmed.

## [0.8.0] - 2026-09-29
### Added
- **What the servers said:** an Overview panel and a per-request block built from response headers already in the NetLog. It shows how many responses reported their own `Server-Timing`, the largest reported phase against the wait it belongs to, a ranked list of reported phases as nested bars, cache and CDN answers (hit, miss, mixed), the CDN a response looks like it came through (a hint from header names), other timing-like headers shown raw, and request IDs with copy buttons. The waterfall draws a thin line under the wait bar as wide as the largest reported phase. Everything is labeled as reported by the server; phases are never added together; an absent header is "not recorded", never zero. When a server sends nothing, the panel says so and what to ask the platform team.
- The slow-server finding and the AI summary include the server's own figures, labeled as reported.
- Coverage: "Server processing time" now reflects what servers report (Recorded, Partial, or Not in this file), and a new "CDN and cache answers" row and comparison-table row.
- The sample capture carries synthetic Server-Timing, cache and request-ID headers so the sample report demonstrates the panel.
- Coverage tab: **Which tool sees what**, a side-by-side table of NetLog, HAR, Performance profile, Lighthouse, packet capture, route trace and server logs across 17 page-load questions. The first column is measured from your capture; the others describe each tool in general. Includes how to get each tool, when it is best, setup, sensitive content, whether SocketMap reads it, a "show only what this capture is missing" filter, and an "if you see this, add that" guide.

## [0.7.0] - 2026-09-28
### Added
- Coverage tab: a map of the request path showing what the capture recorded at each stage (Recorded, Partial, Not in this file, Never in a NetLog), what a NetLog cannot see, and other data worth collecting separately. The same summary is in the AI handoff.
- Capture-wide Diagnostics for the reference NetLog viewer's browser snapshots, source families, errors and timeline series, including background-only captures and unknown event types.
- Local streaming event inspection with source/type/text/error filters, pagination, dependency navigation and recorded enum decoding; saved reports can attach the original NetLog for deeper inspection.
- Actionable diagnostic evidence cards, capture integrity notices, browser-state and source-family A/B comparisons, and diagnostic context in the AI handoff.
- A reference coverage matrix in `docs/NETLOG-PARITY.md` and a synthetic browser-wide diagnostic fixture.
- Compare two NetLog captures inside the standalone viewer: independent page selection, A/B swapping, timing differences, paired request bars, environment changes, and a portable comparison report and text summary.
- Light and dark themes for the viewer and NetLog reports, with a remembered preference and the selected appearance included in saved reports.
- A prominent copy button for `chrome://net-export` and a short capture checklist on the viewer's start page.
- A pinned waterfall timing key, explanations for HTTP methods and sequence labels, and a hide-details control inside the sequence inspector.
- A searchable glossary, additional recorded browser/DNS/proxy details, and a detailed AI handoff that can be copied or saved as text.

### Changed
- Describe SocketMap as providing data-driven insights into a page load across the viewer, AI summary, and capture documentation.
- The page selector groups websites separately from browser and extension activity and shows the selected page URL.
- At narrower widths, sequence details sit below the diagram instead of covering it.

### Fixed
- Missing request ends, TLS versions and cache evidence remain unknown; absence of a send event no longer claims a cache hit.
- Constants appearing after events trigger a bounded second pass, and scalar capture metadata is retained.
- Recursive sanitization covers diagnostic snapshots, event parameters and numeric credential values while preserving protocol session data and enum dictionaries.
- Comparison timings distinguish completed requests from requests whose end event was not captured; unknown values are not treated as zero.
- Redact credential-bearing command-line switches and environment URLs before including them in reports and AI summaries.
- Clipboard fallback reports when manual copying is needed instead of claiming success.
- Diagnostics snapshots no longer render the same recorded data two or three times: tables are capped at 100 rows with the cap stated, and nested cells no longer repeat their JSON. A real capture's report drops from 11.6 MB to 8.1 MB.

## [0.6.0] - 2026-09-26
### Added
- The viewer's start page explains what SocketMap does, how it works, what it shows, and what it cannot see, with a **Try the sample capture** button that opens a report from the built-in synthetic capture.
- `npm run demo` builds `demo-report.html` from the synthetic capture.
- User guide (`docs/USER-GUIDE.md`) covering capture, the viewer, every report tab, each finding, protocols, sharing, and troubleshooting; screenshots in `docs/images/`.
- Windows quick start in the README (winget, PowerShell commands, Download ZIP route).
- Prebuilt `socketmap-viewer.html` published on the GitHub Releases page, so the viewer needs no Node.js.
- MIT `LICENSE` file (copyright JR Generations).

### Changed
- README rewritten around the troubleshooting report; the older HAR/JSON diagram documentation moved to `docs/HAR-DIAGRAM.md`.
- The synthetic capture builder moved from the tests to `src/demo/sample-capture.mjs`, shared by the viewer, the demo, and the tests.

### Fixed
- Windows: `.gitattributes` keeps LF line endings on checkout, the theme freshness check ignores CRLF, and `npm test` uses Node's built-in test discovery instead of a shell glob that Windows does not expand.

## [0.5.0] - 2026-09-26
### Added
- Telemetry Trace Dark design system: DESIGN.md tokens drive the report and viewer colors, fonts, and rounding (`npm run generate:theme`). `--theme <DESIGN.md>` applies a company theme to CLI reports and viewer builds.
- Report layout with sidebar views (Overview, Waterfall, Sequence, Environment, AI summary, Learn), a top bar showing the capture file, size, load time, and findings, and a status bar.
- Shared filter for the waterfall and sequence: search by host, address, status, or protocol, plus Problems, Slow, TLS inspection, and Local calls chips with counts.
- Sequence view rebuilt as rows under a sticky host header: time offsets, protocol/status/wait/size tags, red rows for failures and inspection, amber rows for slow steps, and a docked inspector with Explained, Timing, Connection, and Headers tabs.

- Hover explanations for protocol (H3, H2, HTTP/1.1), result, wait, size, TLS, and rating labels, plus a collapsible "What do H3, H2, and HTTP/1.1 mean?" comparison with this page's counts in the Waterfall and Sequence views.
- "Hide details panel" button in the Sequence view (remembered per browser); selecting a row brings the panel back. "How to read this view" is collapsible.

### Changed
- Viewer start page tagline now describes what the tool shows.
- One sequence row per request (request and answer together) plus one per new connection, sorted by time. The display limit rose to 1,000 requests.

### Fixed
- Links inside a report opened in the viewer no longer load the viewer page into the report frame.

## [0.4.0] - 2026-09-26
### Added
- Drag-and-drop viewer (`socketmap-viewer.html`, built with `npm run build:viewer`): drop a NetLog capture in Chrome or Edge and get the report with no install. Reads the file locally with a progress bar, lets you pick the page, and saves the standalone report.
- Dependency-free viewer bundler that fails the build on unsupported module syntax or Node APIs.

## [0.3.0] - 2026-09-26
### Added
- Troubleshooting report for Chrome/Edge NetLog captures: findings with evidence and the team to involve, host table with Good / Better / Best / Poor ratings, request waterfall with per-phase timing, sequence diagram, environment card, and a copyable AI summary.
- Findings for TLS inspection (certificate from a private root), proxies and slow proxy lookups, calls to services on this computer, failed requests, slow servers, slow connections, slow DNS, QUIC failures, browser queueing, and HTTP/1.1 hosts.
- Environment details from the capture: browser, OS, local IP, DNS servers and search domains, secure DNS, proxy setup.
- `--page <site>` option to analyze a specific site in a capture.
- Sequence diagram in the report keeps the host cards pinned at the top while scrolling, aligned with their lifelines.
- Long participant names shrink to fit their card, with the full name and IP shown on hover.
- Click any arrow, activity bar, or column heading in the sequence diagram for a plain-language explanation: what happened, a verdict, each timing step with its meaning, where to look, and technical details, with a link to the matching waterfall row.
- "How to read this diagram" guide above the sequence diagram, a plain-language summary in every waterfall row, and explanations of each host rating.
- Learn tab: next troubleshooting steps, verified links (Web Vitals, Chrome Modern Web Guidance, DevTools, NetLog Viewer, Microsoft 365 networking, Wireshark, and more), and a glossary.
- Capture guide for `chrome://net-export` / `edge://net-export` in the README.

### Changed
- NetLog parsing now streams one event at a time and never holds the event list in memory.
- Requests are linked to the connection, DNS lookup, and certificate check Chrome actually used, instead of the first one in the file.
- Every request in the capture is kept; the 20-request cap is gone.
- Redaction now also removes secrets in URLs (tokens, OAuth codes, SAML, signed-URL signatures) and more credential headers.
- Example and fixture data use documentation IP ranges; real captures are gitignored.

### Fixed
- NetLog event phases were read backwards (begin as end), which produced wrong timings.
- The NetLog diagram invented a "Route Handler" hop, default TLS/protocol values, latencies, and sizes. Values not in the capture are now shown as not recorded.
- All hosts were drawn on one lifeline named after the first request's host.

### Removed
- The old NetLog sample fixture, which did not match Chrome's real format.

## [0.2.0] - 2026-09-26
### Added
- Prescriptive Guidance Engine mapping network interactions to Chrome Modern Web Guidance with Good / Better / Best optimization playbooks.
- Trace Inventory & Tech Stack Catalog automatically extracting counts and breakdowns for domains, ports, client libraries, infrastructure tools, and resource types.
- Interactive header toggle `[📦 Inventory]` and dedicated drawer view with KPI metrics and 1-click component filtering.
- Network & Tech Stack Fingerprint section in inspector drawer with clickable filter chips (`🌐 Domain`, `🔌 Port`, `⚡ Technology`, `📄 Resource Type`).
- Critical path and render-blocking detection (`⚡ BLOCKING`) flagging resources that halt browser page rendering.
- Interactive header toggles for `[⚡ Critical Path]` isolation, `[✨ Glow FX]` ambient lighting, and `[⏱️ Latency Badges]` chips.
- Trace Health & Architecture Dashboard drawer (`[💡 Insights]`) displaying blocking ratios, latency percentiles, and actionable guidance summaries.
- One-click Google PageSpeed Insights / Lighthouse deep-links and Chrome DevTools profiling workflows in the inspector drawer.
- Product vision, architectural philosophy, and Good/Better/Best guidance tables added to README.

### Fixed
- Replaced inline `onclick` string interpolation in HTML template with centralized DOM data-attribute event delegation, resolving syntax errors and restoring full interactivity to drawer controls and inventory filtering.

## [0.1.0] - 2026-09-20
### Added
- Zero-dependency Node.js CLI tool transforming network traces into interactive sequence diagrams.
- Resilient streaming chunked parser for Chromium NetLog files (`chrome://net-export/`).
- Ingestion support for HAR archives and generic execution span traces.
- Canonical Intermediate Representation (IR) normalizer with automatic credential redaction.
- Signal-flow SVG layout engine featuring dark obsidian theme, glowing activation lifelines, and semantic arrows.
- Standalone, 100% self-contained HTML generation with zero external CDN or font dependencies.
- Interactive client-side canvas engine with pan/zoom, route hover highlighting, floating tooltips, and inspector drawer.
- CLI command `traceviz` / `socketmap` supporting `--sample`, `--filter`, `-o/--output`, and `--open`.
- Comprehensive step-by-step guide in README for non-technical users covering prerequisites, HAR/NetLog capture, terminal drag & drop, and diagram navigation.
- Standalone interactive example gallery (`examples/`) showcasing e-commerce checkout, login/2FA, and slow API timeout troubleshooting with a dedicated generation script (`npm run generate:examples`) and visual showcase in README.
- Ingested real-world 5.46 MB Chromium NetLog trace (`Example_Weekend Game Plan_chrome-net-export-log.json`) and added standalone visualization artifact (`examples/weekend-game-plan.html`).
