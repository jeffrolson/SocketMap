# SocketMap

> Zero-dependency Node.js CLI transforming network traces into interactive, presentation-grade sequence diagrams packaged as a single, self-contained HTML file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

---

## Overview

**SocketMap** converts complex network captures—including Chromium NetLogs (`chrome://net-export/`), HAR files, and generic execution traces—into high-density, interactive sequence diagrams. 

Generated artifacts follow the dark **signal-flow** aesthetic: deep obsidian canvas, illuminated vertical activation lifelines, semantic color-coded interaction routing, phase swimlane brackets, and an anchored legend.

---

## Key Features

- **Zero External Dependencies**: Built entirely with Node.js built-ins (`fs`, `stream`, `path`, `readline`, `child_process`). Runs instantly without `npm install`.
- **100% Self-Contained Output**: Generated HTML files embed all SVGs, typography, styles, and interaction logic inline. Works completely offline in air-gapped environments without CDN calls or remote web fonts.
- **Resilient Streaming Ingestion**: Parses Chromium NetLogs (`chrome://net-export/`) via chunked streaming (`fs.createReadStream`), keeping heap memory usage under 30MB even on 500MB+ traces.
- **Trace Format Auto-Detection**: Ingests:
  - **Chromium NetLogs**: Correlates DNS (`HOST_RESOLVER_IMPL_JOB`), TLS handshake (`CONNECT_JOB` / `SSL_CONNECT_JOB`), and HTTP transactions (`URL_REQUEST` / `HTTP_TRANSACTION`).
  - **HAR Files**: Ingests HTTP Archives exported from Chrome, Edge, Firefox, or Safari DevTools.
  - **Generic JSON / Spans**: Ingests OpenTelemetry and custom microservice execution spans.
- **Automatic Credential Redaction**: Automatically scrubs `Authorization`, `Cookie`, `Set-Cookie`, and API keys before outputting diagrams.
- **Interactive Signal-Flow Canvas**:
  - **Pan & Zoom**: Mouse drag pan, scroll wheel zoom with cursor pivot, and floating toolbar (`+`, `−`, `1:1`, `Fit`).
  - **Route Hover Isolation**: Hovering over any arrow or activation bar highlights the active route and dims unrelated lifelines.
  - **Floating Tooltips**: Real-time inspection of latency (ms), HTTP method, status code, and byte transfer.
  - **Inspector Drawer**: Click any interaction to inspect request/response headers, connection info, and raw step JSON.
  - **Search & Filter**: Filter input highlights matching interactions across labels, details, and endpoints.

---

## Quick Start

### 1. Instant Demo Preview

Generate and open the built-in reference diagram in your default browser:

```bash
node bin/traceviz.mjs --sample --open
```

Or specify a custom output path:

```bash
node bin/traceviz.mjs --sample -o sample.html --open
```

### 2. Visualize a Real Trace

```bash
# Chromium NetLog export
node bin/traceviz.mjs ~/Downloads/net-export.json --open

# HTTP Archive (HAR)
node bin/traceviz.mjs network.har --open

# Filter by URL pattern
node bin/traceviz.mjs netlog.json --filter "api/v1" --open
```

---

## Capturing Network Traces

### Chromium NetLog (`chrome://net-export/`)
1. In Google Chrome, Chromium, or Brave, open `chrome://net-export/`.
2. Click **Start Logging to Disk** and choose a destination file.
3. In another tab, reproduce your network flow or issue.
4. Return to `chrome://net-export/` and click **Stop Logging**.
5. Render the NetLog:
   ```bash
   node bin/traceviz.mjs netlog.json --open
   ```

### HAR File (Browser DevTools)
1. Press `F12` (or `Cmd + Option + I`) to open DevTools and switch to the **Network** tab.
2. Perform your network action.
3. Click the **Export HAR** button (or right-click any request $\to$ *Save all as HAR with content*).
4. Render the HAR file:
   ```bash
   node bin/traceviz.mjs recording.har --open
   ```

---

## CLI Reference

```text
node bin/traceviz.mjs <input-trace.json> [options]
socketmap <input-trace.json> [options]

OPTIONS:
  -o, --output <file>    Target output HTML file path (default: ./trace-diagram.html)
  --filter <regex>       Filter requests by URL or method pattern
  --sample               Generate demo diagram using synthetic reference data
  --open                 Automatically open the generated visual in your default browser
  -h, --help             Show help message and exit
  -v, --version          Show version and exit
```

---

## Semantic Interaction Color Guide

| Style | Direction | Semantic Meaning |
|---|---|---|
| **Solid Cyan / Emerald** | `→` | Request / Sync Forward |
| **Dashed Muted Slate** | `←` | Response / Return / Stream |
| **Solid Coral / Crimson** | `→` | Security Guard / JWT Verification |
| **Dashed Purple / Amber** | `⇢` | Async Telemetry / Queue Dispatch |
| **Curved Amber Bezier** | `↺` | Retry / Cache Fallback Loop |

---

## Verification & Testing

SocketMap includes automated test suites covering streaming parsers, HAR ingestion, SVG geometry calculations, standalone HTML constraints, and CLI commands:

```bash
# Run all unit and integration tests
npm test

# Run full project verification (tests + context files standard)
npm run verify
```

---

## License

MIT
