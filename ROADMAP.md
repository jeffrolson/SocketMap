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
- Two-capture comparison (shipped in 0.7.0): validated on a real fast and slow-network pair; still to validate with real user workflows.

## Next (2 to 4 weeks)
Queued, priority-ordered.

- Nothing buildable is queued. What remains needs real machines, files or people: see Now and Later.

## Later (this quarter)
Planned but not scheduled.

- Policy tab follow-ups: managed exports with `ignored`, `info`, `future` and `superseded` flags (`error`, `warning`, `deprecated` and `conflicts` are confirmed on real managed Chrome, and an actual Edge export has been read); grow the
  catalog only from vendor pages, keep the review date current, run `npm run
  check:policy-links` before each release (added 2026-09-29)
- Performance profile follow-ups: alignment is validated on real same-session pairs (macOS Chrome
  and Edge, Windows Chrome and Edge, Linux Chrome; 34 of 37 requests matched each); still to try a trace recorded in a
  different run from the NetLog (added 2026-09-29)
- Network path helper follow-ups: run on real Windows machines with Wi-Fi and a corporate proxy, and on Linux desktops (validated on Windows and Linux runners, including registry proxy, PAC and auto-detect settings; the runners have no Wi-Fi, and their route probes are dropped, so Wi-Fi signal and answered route hops are unobserved on real Windows); TCP-based route probes; a 'run it for me' one-liner; per-hop loss with several probes (added 2026-09-30)

## Parking lot
Ideas, deferred features, nice-to-haves. No commitment.

- Custom participant grouping and color overrides via CLI config file
- Direct image export flags (`--format svg`, `--format png`)
- OpenTelemetry span and Jaeger trace ingestion
- Interactive timeline playback scrubber
- Standalone desktop companion app (Tauri / Electron)
- Binary PCAP to NetLog/JSON converter utility
- `chrome://webrtc-internals` JSON dump import for Teams call quality (loss, jitter, round
  trip, TURN relay); only if Teams quality comes into scope
- Guided paste for pages that only copy or screenshot: `chrome://gpu` (hardware
  acceleration on VDI and older machines) and `chrome://extensions` (installed extensions)
- Windows `netsh trace` and `curl` timing output, probably through the capture helper

## Recently shipped
Last 3 to 5 items for context. Older history lives in `CHANGELOG.md`.

- 2026-09-30: An actual exported Edge policy file captured on a Windows runner and validated (0.17.4)
- 2026-09-30: Helper 1.1: proxy credential leak, two-host bug and failed-probe reporting found and fixed on real runners (0.17.3)
- 2026-09-30: Windows, Linux and managed-policy data recorded on disposable CI runners and validated; conflict notes name what they override (0.17.2)
- 2026-09-30: Edge and A/B comparison validated on real recordings; comparison no longer colours changes under 10 ms (0.17.1)
- 2026-09-30: Waterfall timeline with problem markers and a window filter, sequence PNG and SVG export, one-row viewer toolbar (0.17.0)
- 2026-09-30: Lighthouse JSON and V8 CPU profile as optional files, labelled as lab and summary views (0.16.0)
- 2026-09-30: A HAR on its own opens in the full report (viewer and CLI); the older diagram remains for generic JSON and --diagram (0.15.0)
- 2026-09-30: Network path helper: Mac and Linux shell script, Windows PowerShell script, viewer and CLI support, Overview panel, Coverage rows (0.14.0)
- 2026-09-30: Clock-based profile placement, redaction audit (found and fixed a leaked API key shape), real-browser smoke test, CI on three operating systems, smaller Diagnostics (0.13.0)
- 2026-09-29: Policy tab reads Chrome 134's policyGroups exports (0.12.1)
- 2026-09-29: Profile alignment validated on a real same-session NetLog and trace pair; profile now finds the page when blank or internal tabs navigate after it (0.11.1)
- 2026-09-29: Optional Performance profile: what the page's code was doing (long tasks, scripts by main-thread time, paint milestones, waterfall main-thread band), aligned to the NetLog by shared requests (0.11.0)
- 2026-09-26: Design system from DESIGN.md, company theming, tabbed report, filters, HTML sequence view with docked inspector
- 2026-09-26: Drag-and-drop viewer that builds the report in the browser
- 2026-09-26: Truthful NetLog troubleshooting report (streaming parser, ratings, findings, plain-language explanations)

- 2026-09-26: Trace Inventory & Tech Stack Catalog with 1-click interactive filtering and KPI metrics
- 2026-09-26: Prescriptive Guidance Engine with Good / Better / Best Chrome Modern Web Guidance playbooks
- 2026-09-26: Critical Path & Render-Blocking classification with `[⚡ Critical Path]` visual toggle
- 2026-09-20: Zero-dependency CLI transforming NetLog and HAR traces into standalone interactive diagrams
