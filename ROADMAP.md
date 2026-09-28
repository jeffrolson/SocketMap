# ROADMAP.md

Forward plan. Dated entries. Reorder as priorities shift. Shipped items move
to `CHANGELOG.md`.

Direction (set 2026-09-28): SocketMap provides data-driven insights into a page load,
using visualizations and recorded evidence to inform decisions (first target: M365 SharePoint and Office web apps). The
capture is `chrome://net-export` or `edge://net-export`. Reports are self-contained
HTML anyone can open. Redaction strips secrets (passwords, auth headers, cookies,
tokens) and keeps everything else, including IPs. Real captures never enter the repo.

## Now
Actively being built.

- Try SocketMap on Windows and with colleagues; collect what confuses people.
- Two-capture comparison (shipped in 0.7.0): validate with real user workflows.
- Phase 2: Microsoft 365 detectors (TLS inspection via certificate issuer, proxy and PAC
  cost, QUIC fallback, localhost calls, sign-in redirect chains, embedded Microsoft 365
  endpoint list). Needs a real SharePoint capture from work.

## Next (2 to 4 weeks)
Queued, priority-ordered.

- Merge the viewer's toolbar into the report header
- From the design mockup: timeline slider with problem markers; export the sequence as an image
- Bring the HAR diagram up to the "only real values" rule, or route HAR files into the report

## Later (this quarter)
Planned but not scheduled.

- Phase 4: capture helper script (Windows PowerShell and macOS shell) that records
  machine name, public IP and a TCP traceroute to the slowest hosts

## Parking lot
Ideas, deferred features, nice-to-haves. No commitment.

- Custom participant grouping and color overrides via CLI config file
- Direct image export flags (`--format svg`, `--format png`)
- OpenTelemetry span and Jaeger trace ingestion
- Interactive timeline playback scrubber
- Standalone desktop companion app (Tauri / Electron)
- Binary PCAP to NetLog/JSON converter utility

## Recently shipped
Last 3 to 5 items for context. Older history lives in `CHANGELOG.md`.

- 2026-09-26: Viewer start page explains SocketMap, with a sample capture; README and user guide rewritten; Windows support
- 2026-09-26: Design system from DESIGN.md, company theming, tabbed report, filters, HTML sequence view with docked inspector
- 2026-09-26: Drag-and-drop viewer that builds the report in the browser
- 2026-09-26: Truthful NetLog troubleshooting report (streaming parser, ratings, findings, plain-language explanations)

- 2026-09-26: Trace Inventory & Tech Stack Catalog with 1-click interactive filtering and KPI metrics
- 2026-09-26: Prescriptive Guidance Engine with Good / Better / Best Chrome Modern Web Guidance playbooks
- 2026-09-26: Critical Path & Render-Blocking classification with `[⚡ Critical Path]` visual toggle
- 2026-09-20: Zero-dependency CLI transforming NetLog and HAR traces into standalone interactive diagrams
