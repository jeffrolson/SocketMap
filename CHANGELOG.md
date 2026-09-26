# CHANGELOG.md

All notable changes to this project. Format based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
This project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

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
