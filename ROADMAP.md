# ROADMAP.md

Forward plan. Dated entries. Reorder as priorities shift. Shipped items move
to `CHANGELOG.md`.

## Now
Actively being built.

- Comprehensive documentation alignment & zero-regression test hardening (owner: Antigravity, target: 2026-09-26)

## Next (2 to 4 weeks)
Queued, priority-ordered.

- Custom participant grouping and color overrides via CLI config file
- Direct image export flags (`--format svg`, `--format png`)
- Enhanced OpenTelemetry span & Jaeger distributed trace ingestion

## Later (this quarter)
Planned but not scheduled.

- Interactive timeline playback scrubber animating request dispatches in real-time
- Visual Trace Diff Mode: side-by-side waterfall comparison between two traces (e.g., baseline vs. optimized)

## Parking lot
Ideas, deferred features, nice-to-haves. No commitment.

- Standalone lightweight desktop companion app (Tauri / Electron)
- Binary PCAP to NetLog/JSON converter utility

## Recently shipped
Last 3 to 5 items for context. Older history lives in `CHANGELOG.md`.

- 2026-09-26: Trace Inventory & Tech Stack Catalog with 1-click interactive filtering and KPI metrics
- 2026-09-26: Prescriptive Guidance Engine with Good / Better / Best Chrome Modern Web Guidance playbooks
- 2026-09-26: Critical Path & Render-Blocking classification with `[⚡ Critical Path]` visual toggle
- 2026-09-26: Ingested real-world 5.46 MB Chromium NetLog (`weekend-game-plan.html`)
- 2026-09-20: Zero-dependency CLI transforming NetLog and HAR traces into standalone interactive diagrams
