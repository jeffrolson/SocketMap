# ROADMAP.md

Forward plan. Dated entries. Reorder as priorities shift. Shipped items move
to `CHANGELOG.md`.

Direction (set 2026-09-28): SocketMap provides data-driven insights into a page load,
using visualizations and recorded evidence to inform decisions (audience: enterprise IT staff diagnosing slow page loads). The
capture is `chrome://net-export` or `edge://net-export`. Reports are self-contained
HTML anyone can open. Redaction strips secrets (passwords, auth headers, cookies,
tokens) and keeps everything else, including IPs. Real captures never enter the repo.

Rule for every extra data source below (set 2026-09-28): it is optional and enriches a
NetLog; the NetLog alone must keep working. Extra files are read locally in the viewer
or CLI, only a bounded, redacted summary is saved into the report (never the raw file),
and the report stays one self-contained HTML file that works offline with no remote
requests. A source that cannot meet this is not built. A source is worth building only
if it exports a structured file; screenshot-or-copy pages get, at most, a guided paste.

## Now
Actively being built.

- Try SocketMap on Windows and with colleagues; collect what confuses people.
- Two-capture comparison (shipped in 0.7.0): validate with real user workflows.

## Next (2 to 4 weeks)
Queued, priority-ordered.

- Merge the viewer's toolbar into the report header
- From the design mockup: timeline slider with problem markers; export the sequence as an image
- Bring the HAR diagram up to the "only real values" rule, or route HAR files into the report

## Later (this quarter)
Planned but not scheduled.

- Policy tab follow-ups: confirm against a real managed Chrome export and an Edge export (the
  managed per-policy fields are taken from Chromium's source and tested, Edge's metadata keys
  are inferred, and the only real export seen was unmanaged); grow the
  catalog only from vendor pages, keep the review date current, run `npm run
  check:policy-links` before each release (added 2026-09-29)
- Performance profile follow-ups: alignment is validated on one real same-session pair
  (macOS Chrome, 34 of 37 requests matched); still to try a Windows and an Edge pair and a
  trace recorded in a different run from the NetLog; a clock-based placement when no request
  is shared is possible (same monotonic clock) but only safe with an overlap check; CPU profile (`.cpuprofile`) and Lighthouse JSON as further optional files (added 2026-09-29)
- Phase 4: capture helper script (Windows PowerShell and macOS shell) that records
  machine name, public IP and a TCP traceroute to the slowest hosts, plus adapter, DNS,
  proxy and PAC facts, saved as a small file the report can load. Fills the "Network path"
  rows

## Parking lot
Ideas, deferred features, nice-to-haves. No commitment.

- Custom participant grouping and color overrides via CLI config file
- Direct image export flags (`--format svg`, `--format png`)
- OpenTelemetry span and Jaeger trace ingestion
- Interactive timeline playback scrubber
- Standalone desktop companion app (Tauri / Electron)
- Binary PCAP to NetLog/JSON converter utility
- Lighthouse JSON import: scored audit summary by script, render blockers, main-thread work
- `chrome://webrtc-internals` JSON dump import for Teams call quality (loss, jitter, round
  trip, TURN relay); only if Teams quality comes into scope
- Guided paste for pages that only copy or screenshot: `chrome://gpu` (hardware
  acceleration on VDI and older machines) and `chrome://extensions` (installed extensions)
- Windows `netsh trace` and `curl` timing output, probably through the capture helper

## Recently shipped
Last 3 to 5 items for context. Older history lives in `CHANGELOG.md`.

- 2026-09-29: Policy tab reports what a managed browser flags per policy (ignored, deprecated, future, overridden, restart needed), shape checked against Chromium's exporter (0.12.0)
- 2026-09-29: Profile alignment validated on a real same-session NetLog and trace pair; profile now finds the page when blank or internal tabs navigate after it (0.11.1)
- 2026-09-29: Optional Performance profile: what the page's code was doing (long tasks, scripts by main-thread time, paint milestones, waterfall main-thread band), aligned to the NetLog by shared requests (0.11.0)
- 2026-09-29: Optional HAR alongside the NetLog: initiators, resource types, cache and service worker answers, load milestones; redaction by parameter name pattern (0.10.0)
- 2026-09-29: Policy tab: optional chrome://policy or edge://policy export checked against a dated, vendor-linked catalog (0.9.0)
- 2026-09-26: Design system from DESIGN.md, company theming, tabbed report, filters, HTML sequence view with docked inspector
- 2026-09-26: Drag-and-drop viewer that builds the report in the browser
- 2026-09-26: Truthful NetLog troubleshooting report (streaming parser, ratings, findings, plain-language explanations)

- 2026-09-26: Trace Inventory & Tech Stack Catalog with 1-click interactive filtering and KPI metrics
- 2026-09-26: Prescriptive Guidance Engine with Good / Better / Best Chrome Modern Web Guidance playbooks
- 2026-09-26: Critical Path & Render-Blocking classification with `[⚡ Critical Path]` visual toggle
- 2026-09-20: Zero-dependency CLI transforming NetLog and HAR traces into standalone interactive diagrams
