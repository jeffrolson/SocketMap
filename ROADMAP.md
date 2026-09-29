# ROADMAP.md

Forward plan. Dated entries. Reorder as priorities shift. Shipped items move
to `CHANGELOG.md`.

Direction (set 2026-09-28): SocketMap provides data-driven insights into a page load,
using visualizations and recorded evidence to inform decisions (first target: M365 SharePoint and Office web apps). The
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
- Phase 2: Microsoft 365 detectors (TLS inspection via certificate issuer, proxy and PAC
  cost, QUIC fallback, localhost calls, sign-in redirect chains, embedded Microsoft 365
  endpoint list). Needs a real SharePoint capture from work.

## Next (2 to 4 weeks)
Queued, priority-ordered.

- Merge the viewer's toolbar into the report header
- From the design mockup: timeline slider with problem markers; export the sequence as an image
- Bring the HAR diagram up to the "only real values" rule, or route HAR files into the report
- SharePoint's own timing headers: confirm names and meaning in a real SharePoint capture,
  then interpret them (until then they appear raw under "Other timing headers")
- Optional HAR alongside the NetLog: which script started each request, resource type,
  memory, disk and service worker cache flags, DOMContentLoaded and load milestones, and a
  join panel showing matched and unmatched requests. Streams one entry at a time, keeps only
  whitelisted fields, ignores bodies. Needs a real NetLog and sanitized HAR pair
  (added 2026-09-28)

## Later (this quarter)
Planned but not scheduled.

- Policy tab follow-ups: validate against a managed Chrome export and an Edge export (the
  first real export seen was from an unmanaged Chrome, zero policies, so the managed shape,
  policy `error` and `warning` fields and Edge's metadata keys are unconfirmed); grow the
  catalog only from vendor pages, keep the review date current, run `npm run
  check:policy-links` before each release (added 2026-09-29)
- Optional Performance profile from DevTools: main-thread busy bands on the waterfall,
  slowest scripts, paint and layout timings, and request initiators. Streams the trace and
  keeps only bounded aggregates; screenshots dropped, URLs redacted (added 2026-09-28)
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
- Microsoft 365 connectivity test results import; check the export format first
- Guided paste for pages that only copy or screenshot: `chrome://gpu` (hardware
  acceleration on VDI and older machines) and `chrome://extensions` (installed extensions)
- Windows `netsh trace` and `curl` timing output, probably through the capture helper

## Recently shipped
Last 3 to 5 items for context. Older history lives in `CHANGELOG.md`.

- 2026-09-29: Policy tab: optional chrome://policy or edge://policy export checked against a dated, vendor-linked catalog (0.9.0)
- 2026-09-29: "What the servers said": Server-Timing, CDN and cache headers, timing-like headers and request IDs from response headers already in the capture (0.8.0)
- 2026-09-26: Viewer start page explains SocketMap, with a sample capture; README and user guide rewritten; Windows support
- 2026-09-26: Design system from DESIGN.md, company theming, tabbed report, filters, HTML sequence view with docked inspector
- 2026-09-26: Drag-and-drop viewer that builds the report in the browser
- 2026-09-26: Truthful NetLog troubleshooting report (streaming parser, ratings, findings, plain-language explanations)

- 2026-09-26: Trace Inventory & Tech Stack Catalog with 1-click interactive filtering and KPI metrics
- 2026-09-26: Prescriptive Guidance Engine with Good / Better / Best Chrome Modern Web Guidance playbooks
- 2026-09-26: Critical Path & Render-Blocking classification with `[⚡ Critical Path]` visual toggle
- 2026-09-20: Zero-dependency CLI transforming NetLog and HAR traces into standalone interactive diagrams
