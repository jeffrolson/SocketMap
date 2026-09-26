# CHANGELOG.md

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
