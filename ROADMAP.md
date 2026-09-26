# ROADMAP.md

Forward plan. Dated entries. Reorder as priorities shift. Shipped items move
to `CHANGELOG.md`.

Direction (set 2026-09-26): SocketMap is a troubleshooting tool for enterprise IT staff
diagnosing slow page loads (first target: M365 SharePoint and Office web apps). The
capture is `chrome://net-export` or `edge://net-export`. Reports are self-contained
HTML anyone can open. Redaction strips secrets (passwords, auth headers, cookies,
tokens) and keeps everything else, including IPs. Real captures never enter the repo.

## Now
Actively being built.

- Phase 1, MVP: truthful NetLog report from the CLI (branch `feat/netlog-mvp`)
  - Streaming parser that processes events as they arrive, correlating each request
    to its real connection and DNS lookup
  - One entry per real host, no request cap, page traffic separated from browser and
    extension background traffic
  - No invented values: missing data shows as unknown
  - Environment card (OS, browser, local IP, proxy setup), findings, host table with
    Good / Better / Best / Poor connection ratings, waterfall timeline
  - Secret redaction including tokens in URLs
  - Copy-able AI summary
  - Validate: `npm run verify` passes; synthetic fixtures use documentation IP ranges only

## Next (2 to 4 weeks)
Queued, priority-ordered.

- Phase 2: M365 detectors (TLS inspection via certificate issuer, proxy and PAC cost,
  QUIC fallback, localhost calls, sign-in redirect chains, embedded M365 endpoint list).
  Needs a real SharePoint capture from work.
- Phase 3: drag-and-drop HTML viewer (runs fully in the browser) and company theming
  from `themes/<company>/DESIGN.md`

## Later (this quarter)
Planned but not scheduled.

- Phase 4: capture helper script (Windows PowerShell and macOS shell) that records
  machine name, public IP and a TCP traceroute to the slowest hosts
- Phase 5: compare two captures (on network vs off, inspection on vs bypassed)

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

- 2026-09-26: Trace Inventory & Tech Stack Catalog with 1-click interactive filtering and KPI metrics
- 2026-09-26: Prescriptive Guidance Engine with Good / Better / Best Chrome Modern Web Guidance playbooks
- 2026-09-26: Critical Path & Render-Blocking classification with `[⚡ Critical Path]` visual toggle
- 2026-09-20: Zero-dependency CLI transforming NetLog and HAR traces into standalone interactive diagrams
