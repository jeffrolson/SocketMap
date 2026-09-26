# SocketMap

> Zero-dependency Node.js CLI transforming network traces into interactive, presentation-grade sequence diagrams packaged as a single, self-contained HTML file.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Node.js](https://img.shields.io/badge/node-%3E%3D18.0.0-brightgreen.svg)](https://nodejs.org)
[![Zero Dependencies](https://img.shields.io/badge/dependencies-0-success.svg)](package.json)

---

## Overview

When a website or web app is slow, fails to load, or behaves unexpectedly, your web browser can record everything happening under the hood. That recording is called a **network trace**.

**SocketMap** takes those dense, complicated technical recordings (like HAR files or Chromium NetLogs) and automatically turns them into a clean, interactive **visual sequence diagram** that looks like an easy-to-read timeline of conversations between your browser and servers.

- **For Non-Technical Users**: No coding knowledge needed. Drag, drop, and view an interactive visual map in your browser that you can share with anyone.
- **For Engineers & Architects**: Zero external dependencies, chunked streaming ingestion for massive files (500MB+), automatic credential redaction, and dark signal-flow visualization aesthetics.

---

## Troubleshoot a slow page with a Chrome NetLog

This is the main workflow. The capture works in any Chrome or Edge browser, with nothing to install, and records far more than DevTools does: the proxy decision, DNS, every connection, and the certificate each server presented.

### 1. Capture (2 minutes)

1. Close other tabs, so their traffic does not mix into the capture.
2. Open a new tab and go to `chrome://net-export` (in Edge: `edge://net-export`).
3. Leave the default **Strip private information** selected and click **Start Logging to Disk**. Save the file.
4. In another tab, load the slow page (or reproduce the slow action).
5. Go back to the net-export tab and click **Stop Logging**.

### 2. Build the report

**No install: the viewer.** Open `socketmap-viewer.html` in Chrome or Edge and drop the capture on it. The capture is read inside the browser and never uploaded; the page works offline. Use **Save report** to get a standalone report file to share.

**Company look:** reports follow `DESIGN.md`. To brand them, copy it to `themes/<company>/DESIGN.md`, change the tokens, and pass `--theme themes/<company>/DESIGN.md` to the CLI or to `npm run build:viewer -- socketmap-viewer.html --theme themes/<company>/DESIGN.md`.

Build the viewer once with `npm run build:viewer`, then share the single `socketmap-viewer.html` file (email, SharePoint, intranet). Nobody who uses it needs Node.js.

**Command line (power users, scripts, AI agents):**

```bash
node bin/traceviz.mjs ~/Downloads/chrome-net-export-log.json -o report.html --open
```

SocketMap picks the page you loaded and lists everything else (other tabs, extensions, Chrome itself) separately. To analyze a different site from the same capture, add `--page https://site.example.com`.

### 3. Read the report

The report is one HTML file you can email or attach to a ticket. It opens offline on any machine.

- **Findings**: plain-language problems with the evidence and the team to involve. They cover TLS inspection (certificates from a private root), proxies and slow proxy lookups, calls to services on this computer (such as sign-in agents on `localhost`), failed requests, slow servers, slow connections, slow DNS, and QUIC failures.
- **Hosts and connection ratings**: every host the page used, with its server IP and certificate issuer, rated on six measures.
- **Request waterfall**: every request, with its time split into phases. Click a row for connection, certificate, and header details.
- **Sequence diagram**: the page load drawn as conversations between the browser and each host. Click any arrow, bar, or host heading for a plain-language explanation of that step.
- **Filter**: search by host, address, status, or protocol, or click Problems, Slow, TLS inspection, or Local calls to see only those requests in the waterfall and sequence.
- **Learn**: what to do next, links to deeper tools and guidance (Web Vitals, Chrome DevTools, Microsoft 365 networking, Wireshark), and a glossary.
- **Environment**: browser, OS, local IP, DNS servers, and proxy setup at capture time.
- **AI summary**: a compact text version to paste into your AI assistant.

| Measure | Best | Better | Good | Poor |
|---|---|---|---|---|
| Protocol | HTTP/3 (QUIC) | HTTP/2 | HTTP/1.1 | QUIC failed, fell back to TCP |
| TLS | 1.3 | 1.2 | | Below 1.2 |
| Connection setup | Reused an open connection | New, under 100 ms | 100 to 300 ms | Over 300 ms, or failed |
| DNS | From cache | Under 20 ms | 20 to 100 ms | Over 100 ms, or failed |
| Path | Direct | Through a proxy | | Certificate from a private root (inspection) |
| Server wait (median) | Under 200 ms | 200 to 500 ms | 500 ms to 1 s | Over 1 s |

**Privacy:** passwords, cookies, authorization headers, and tokens (including tokens in URLs) are removed. Everything else stays, including IP addresses and full URLs, because the network team needs them.

**Limits:** a NetLog records network activity only. It cannot show page JavaScript/CPU time or security software running inside the browser, and it does not contain the machine name, public IP, or a traceroute.

---

## 🎯 Product Vision & Architecture Philosophy

### From Opaque Network Telemetry to Prescriptive Intelligence

Network traces hold the ground truth of every web application, but raw captures—containing tens of thousands of lines of cryptic socket descriptors, microsecond timestamps, and hex buffers—are virtually unreadable to anyone outside specialized network engineering teams.

**SocketMap bridges this gap with four core design pillars:**

1. **Visual Storytelling**: Complex client-server interactions, multi-service orchestrations, and background event streams are rendered as an illuminated, chronological sequence diagram that reads like a clear script.
2. **Prescriptive Intelligence over Passive Graphing**: Most diagnostic tools only show *what* happened. SocketMap tells you *why it matters* and *how to fix it*, integrating the [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) standard directly into the visualization.
3. **Critical Path Isolation**: Not all network requests are created equal. SocketMap automatically identifies which requests are actively **blocking the user experience** (`⚡ BLOCKING`) versus those operating asynchronously in the background.
4. **Radical Portability & Privacy**: Zero npm packages to install. Zero remote CDN, API, or font calls. 100% self-contained HTML that runs anywhere—even inside air-gapped secure enclaves. All credentials, tokens, and cookies are automatically scrubbed and redacted.

---

## 🏆 The "Good / Better / Best" Modern Web Guidance Framework

SocketMap categorizes every network interaction and matches it against battle-tested patterns inspired by the [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance):

| Category | 🥉 Good (Baseline) | 🥈 Better (Optimized) | 🥇 Best (Cutting-Edge) |
|---|---|---|---|
| **DNS & Connection Setup** | Standard DNS resolution over HTTP/1.1 or HTTP/2. | Preconnect (`<link rel="preconnect">`) or `dns-prefetch` for known cross-origin critical origins. | **HTTP/3 (QUIC)** with 0-RTT connection resumption and co-located edge origins on an Anycast CDN. |
| **Render-Blocking Web Assets** | Synchronous `<script>` or `<link rel="stylesheet">` tags in `<head>`. | Add `defer` or `async` to scripts, inline critical above-the-fold CSS, and leverage HTTP/2 multiplexing. | **Dynamic code-splitting**, modern ES modules (`type="module"`), and selective `blocking="render"` only on critical subresources. |
| **API & Dynamic Data Endpoints** | Sequential client-side JSON API requests after the main bundle mounts. | Parallel requests, `stale-while-revalidate` HTTP caching headers, and Brotli/Gzip compression. | **Server-Side Rendering (SSR) with streaming HTML** (`Suspense` / chunked transfer) to interleave data fetching with initial paint. |
| **Database & Backend Services** | Direct unindexed relational queries with a new connection per request. | Connection pooling, read replicas, and prepared statements with parameterized queries. | **Distributed cache layer (Redis/Memcached)**, read-through cache with TTL invalidation, and async event-driven writes. |
| **Async & Background Operations** | Synchronous AJAX or `fetch()` on user interaction or page unload. | `navigator.sendBeacon()` or `fetch(..., { keepalive: true })` for non-blocking telemetry delivery. | **Dedicated Web Workers or Worklets**, Background Sync API, and local IndexedDB queuing for 100% main-thread isolation. |

---

## ⚡ Critical Path & Blocking Request Analysis

When diagnosing slow page loads or degraded **Core Web Vitals** (such as **Largest Contentful Paint (LCP)** or **Interaction to Next Paint (INP)**), identifying the **critical path** is vital:

- **⚡ BLOCKING Requests**: Resources that freeze the browser's HTML parser or rendering engine until downloaded and evaluated. Examples include synchronous `<script>` tags, critical CSS stylesheets, initial HTML navigation, and blocking API dependencies. SocketMap labels these routes with a prominent `⚡` icon.
- **Async & Deferred Requests**: Non-blocking traffic (such as images, background analytics, deferred scripts, preloaded fonts, and WebSocket/Firestore listeners) that execute without halting the screen.

### 🎛️ Interactive Visual Density Toggles

Every generated SocketMap diagram includes instant toggles in the top navigation header:

- **`[⚡ Critical Path]`**: Instantly dims all non-blocking background traffic, isolating the exact chain of synchronous requests responsible for page latency.
- **`[✨ Glow FX]`**: Toggles the luminous neon signal-flow aesthetics on or off—ideal for high-contrast presentations, print, or dense enterprise traces.
- **`[⏱️ Latency Badges]`**: Displays or hides microsecond/millisecond latency chips directly on the lifelines for at-a-glance performance audits.
- **`[💡 Insights]`**: Opens the **Trace Health & Architecture Dashboard** drawer, providing overall trace health scores, blocking request ratios, latency percentiles, and actionable optimization playbooks.
- **`[📦 Inventory]`**: Opens the **Trace Inventory & Tech Stack** drawer, displaying KPI counts and detailed breakdowns of all domains, ports, frameworks, libraries, and infrastructure tools.

---

## 📦 Trace Inventory & Tech Stack Fingerprinting

SocketMap automatically discovers, catalogs, and counts every technology and endpoint involved in your trace, allowing you to filter and isolate traffic with a single click:

- 🌐 **Domains & Hosts**: Hostnames, third-party services, CDNs, and internal cluster origins (e.g., `api.stripe.com`, `firestore.googleapis.com`, `edge.cloudflare.com`).
- 🔌 **Service Ports & Protocols**: Maps network ports to traffic protocols (e.g., `443 (HTTPS)`, `80 (HTTP)`, `53 (DNS)`, `5432 (PostgreSQL)`, `6379 (Redis)`).
- ⚛️ **Client Frameworks & Libraries**: Automatically fingerprints client SDKs and UI libraries (e.g., `React`, `Next.js`, `Vue.js`, `Stripe.js`, `Firebase Web SDK`, `Google Analytics / GTM`, `Tailwind CSS`, `Sentry SDK`).
- ☁️ **Cloud, Infrastructure & Server Tools**: Detects proxies, caches, servers, and message brokers (e.g., `Cloudflare WAF / CDN`, `Google Cloud / GWS`, `AWS / CloudFront`, `Nginx Server`, `Redis Cache`, `PostgreSQL`, `Worker Queue`).
- 📊 **Resource & Payload Classification**: Identifies content types across `API / JSON Data`, `CSS Stylesheet`, `JavaScript Code`, `HTML Document`, `Web Font`, `Realtime Channel`, `Database Query`, and `Cache Operation`.

### 🔍 Interactive 1-Click Inventory Filtering

- **Isolate Any Component**: In the `[📦 Inventory]` drawer, click the `[Filter]` button on any domain, port, library, or tool to instantly spotlight those interactions and dim everything else.
- **Active Filter Banner**: Displays the active filter name, matching request count, and an instant `[✕ Clear]` button.
- **Inspector Fingerprint Chips**: Clicking any interaction in the diagram reveals its **Network & Tech Stack Fingerprint** in the drawer with clickable filter chips (`🌐 Domain`, `🔌 Port`, `⚡ Technology`, `📄 Resource Type`) to pivot your analysis on the fly.

---

## 🔬 Deep Diagnostics: Google Lighthouse & Chrome DevTools

SocketMap pairs seamlessly with industry-standard web performance auditing tools:

1. **One-Click Lighthouse Audit**: Click any interaction in the diagram to view its details in the Inspector Drawer. Use the deep-link to run a live audit on **[Google PageSpeed Insights / Lighthouse](https://pagespeed.web.dev/)** to evaluate lab metrics and real-world Core Web Vitals.
2. **Chrome DevTools Cross-Examination**:
   - **Network Tab**: Inspect raw HTTP request headers, compression savings, and protocol negotiation (`h2`, `h3`).
   - **Performance Tab**: Trace Main Thread execution blocks, JavaScript compilation spikes, and layout shifts (CLS) triggered by late-loading assets.
3. **Official Guidance**: Refer directly to [developer.chrome.com/docs/modern-web-guidance](https://developer.chrome.com/docs/modern-web-guidance) for step-by-step code samples and implementation details.

---

## 🌟 What You Get: Interactive Visual Showcase

### 1. Ready-to-View Example Gallery (No Setup Needed!)

You don't need to capture any traces or run any commands to see what SocketMap produces. Three realistic, pre-rendered diagrams are included right in the [`examples/`](examples/) folder. You can **double-click any file** to open and explore it in your web browser:

| Example Diagram | Scenario Demonstrated | Key Highlights |
|---|---|---|
| **[E-Commerce Checkout Flow](examples/ecommerce-checkout.html)** (`examples/ecommerce-checkout.html`) | Customer clicks "Place Order" $\to$ WAF inspection $\to$ Inventory reservation $\to$ Payment gateway $\to$ DB commit $\to$ Async email queue. | Multi-service orchestration, Stripe 3D Secure verification, and background worker jobs. |
| **[User Login & 2FA Flow](examples/user-login-2fa.html)** (`examples/user-login-2fa.html`) | User submits email & password $\to$ SMS OTP code dispatched via Twilio $\to$ Redis challenge validation $\to$ Secure session cookie issued. | Security-accented arrows, one-time code verification, and automatic password/token redaction. |
| **[Slow API & Timeout Recovery](examples/slow-api-troubleshooting.html)** (`examples/slow-api-troubleshooting.html`) | Browser loads page $\to$ Recommendation API hangs for 800ms and returns `504 Gateway Timeout` $\to$ Circuit breaker trips $\to$ Redis cache fallback recovers gracefully. | Pinpointing slow bottlenecks, retry loops, and cache fallback recovery without crashing the page. |
| **Your own NetLog report** (`examples/weekend-game-plan.html`) | Generated only when a real capture is present locally as `examples/Example_Weekend Game Plan_chrome-net-export-log.json`. Real captures are never committed. | The troubleshooting report described above: findings, host ratings, waterfall, sequence diagram. |

> [!TIP]
> **Want to regenerate the examples?** Run `npm run generate:examples` anytime.

---

### 2. Before vs. After: From Machine Jargon to Visual Clarity

#### BEFORE: A Messy 50,000-Line Raw Trace File
Normally, network captures look like thousands of lines of unreadable machine code with cryptic numbers and raw timestamps:
```json
{"params":{"headers":["Host: api.example.com","Authorization: Bearer eyJhbGci..."]},"phase":1,"source":{"id":1842,"type":8},"time":"21849102"}
```

#### AFTER: A Clean, Interactive Signal-Flow Diagram
SocketMap transforms that raw trace into an illuminated, interactive canvas:

```
+---------------------------------------------------------------------------------------------+
|  [🔍 Search / Filter: "api/checkout"]                       [Zoom:  −   +   1:1   Fit]      |
+---------------------------------------------------------------------------------------------+
|   User (Browser)          Cloudflare WAF         Storefront API          Stripe Payment     |
|         │                       │                       │                       │           |
|         ├────── POST /checkout ─▶                       │                       │           |
|         │                       ├────── Inspected ─────▶│                       │           |
|         │                       │                       ├──── Auth Card ($150) ─▶           |
|         │                       │                       │◀─── 200 Approved ─────┤           |
|         │                       │◀───── 201 Created ────┤                       │           |
|         │◀───── Order Placed ───┤                       │                       │           |
+---------------------------------------------------------------------------------------------+
| [Selected Interaction]  POST /v1/payment_intents/confirm  •  92ms  •  Status: 200 OK        |
+---------------------------------------------------------------------------------------------+
```

### 3. What You Can Do With the Diagram

- 🎯 **Hover Isolation**: Move your mouse over any arrow to instantly light up that exact conversation path while dimming unrelated traffic.
- ⚡ **Critical Path Filtering**: Toggle `[⚡ Critical Path]` to instantly dim non-blocking background chatter and spotlight the exact synchronous waterfall slowing down page rendering.
- 🔍 **Click-to-Inspect Drawer**: Click any interaction to open the slide-out inspector drawer showing response times, status codes (`200 OK`, `404 Not Found`, `504 Timeout`), byte transfer size, sanitized headers, and Good/Better/Best optimization tips.
- 💡 **Architecture Insights Dashboard**: Click `[💡 Insights]` to open an interactive health report showing blocking vs. async ratios, median/p95 latency, and actionable Modern Web Guidance.
- 🔬 **Lighthouse Deep-Links**: Run direct audits on [Google PageSpeed Insights / Lighthouse](https://pagespeed.web.dev/) with pre-populated endpoints from your trace.
- 🔎 **Search & Filter**: Search for specific endpoints, keywords, or error codes right in the diagram header.
- 🧭 **Pan & Zoom**: Smoothly navigate large traces using mouse drag and scroll wheel zoom, or use the bottom toolbar (`+`, `−`, `1:1`, `Fit`).
- 🔒 **Safe & Private**: Passwords, cookies, session tokens, and authentication keys are automatically scrubbed and replaced with `[REDACTED]`.
- 📦 **100% Offline & Shareable**: Every diagram is a single, self-contained `.html` file. Attach it to a Jira ticket, Slack message, or email—anyone can open it on any device without installing any software!

---

## 🔰 Non-Technical Guide: 3 Simple Steps

If you want to visualize a new issue or recording yourself, follow these three simple steps:

### Step 1: Check for Node.js (Takes 1 minute)

SocketMap runs using **Node.js**, a free, lightweight runtime that runs on Mac, Windows, and Linux.

1. Open your computer's terminal:
   - **Mac**: Press `Cmd + Space`, type `Terminal`, and press **Enter**.
   - **Windows**: Press the `Windows Key`, type `PowerShell` or `cmd`, and press **Enter**.
2. Type the following command and press **Enter**:
   ```bash
   node -v
   ```
3. If you see a version number (like `v18.20.0` or `v20.x.x`), you are ready!
4. If you see an error like *"command not found"* or *"node is not recognized"*, download the free installer from **[nodejs.org](https://nodejs.org)** (choose the **LTS** version) and run the installer.

---

### Step 2: Record Your Network Activity

Choose whichever method is easiest for you:

#### Option A: Save a HAR File (Easiest — Works in Chrome, Edge, Firefox, and Safari)

1. Open your browser and go to the webpage where the issue occurs.
2. Open the browser's **Developer Tools**:
   - **Windows**: Press `F12` (or right-click anywhere on the page and click **Inspect**).
   - **Mac**: Press `Cmd + Option + I` (or right-click anywhere on the page and click **Inspect**).
3. Click the **Network** tab at the top of the Developer Tools panel.
4. Perform the action on the webpage (for example, refresh the page, log in, or click the button that causes a bug).
5. Export the recording:
   - Look for the small **Export HAR** icon (a downward arrow with "HAR") near the top of the Network panel, or
   - Right-click anywhere in the list of requests and select **Save all as HAR with content**.
6. Save the file to an easy-to-find place, such as your **Downloads** or **Desktop** folder.

#### Option B: Save a Chromium NetLog (Best for slow-page troubleshooting in Chrome or Edge)

Follow [Troubleshoot a slow page with a Chrome NetLog](#troubleshoot-a-slow-page-with-a-chrome-netlog). A NetLog produces the troubleshooting report rather than the diagram described here.

---

### Step 3: Turn Your Recording into a Visual Diagram

1. Open your **Terminal** (Mac) or **PowerShell** (Windows).
2. Type the following command (with a space at the end, but **do not press Enter yet**):
   ```bash
   node bin/traceviz.mjs 
   ```
3. 💡 **Drag & Drop Trick (No typing file paths!)**:
   Find your saved `.har` or `.json` file in Finder (Mac) or File Explorer (Windows). **Drag the file icon and drop it directly into your terminal window!** The full path to your file will fill in automatically.
4. Type ` --open` at the end and press **Enter**. For example:
   ```bash
   node bin/traceviz.mjs /Users/you/Downloads/my-recording.har --open
   ```
5. **That's it!** SocketMap will process the recording and immediately open the interactive diagram in your default web browser.

> [!NOTE]
> **Try a Demo First**: Want to see what a diagram looks like without recording anything? Run:
> ```bash
> node bin/traceviz.mjs --sample --open
> ```

---

### How to Understand the Colors

| Visual Style | Direction | Meaning in Plain English |
|---|---|---|
| **Solid Cyan / Green** | `→` | **Request**: Your browser asking a server for information or submitting data. |
| **Dashed Slate / Gray** | `←` | **Response**: The server sending back data, images, or status codes. |
| **Solid Coral / Red** | `→` | **Security / Auth**: Password checks, token validations, or firewall blocks. |
| **Dashed Purple** | `⇢` | **Async Task**: Background jobs, analytics, or queue dispatches. |
| **Curved Orange Loop** | `↺` | **Retry / Cache**: An operation that was retried or served from local cache. |

---

## Key Features

- **Zero External Dependencies**: Built entirely with Node.js built-ins (`fs`, `stream`, `path`, `readline`, `child_process`). Runs instantly without `npm install`.
- **100% Self-Contained Output**: Generated HTML files embed all SVGs, typography, styles, and interaction logic inline. Works completely offline in air-gapped environments without CDN calls or remote web fonts.
- **Prescriptive Guidance Engine**: Embeds [Chrome Modern Web Guidance](https://developer.chrome.com/docs/modern-web-guidance) playbooks directly into the inspector with Good / Better / Best patterns for DNS, render-blocking assets, APIs, databases, and background workers.
- **Critical Path Detection & Isolation**: Automatically flags synchronous render-blocking calls (`⚡ BLOCKING`) affecting Core Web Vitals (LCP, INP) and provides an instant toggle to isolate the blocking waterfall.
- **Interactive Visual Density Toggles**: Dynamic header controls for `[⚡ Critical Path]` isolation, `[✨ Glow FX]` ambient lighting, `[⏱️ Latency Badges]` inline chips, and `[💡 Insights]` health report drawer.
- **Resilient Streaming Ingestion**: Parses Chromium NetLogs (`chrome://net-export/`) one event at a time as the file streams in, so memory use does not grow with file size. Truncated captures (Chrome closed mid-write) still parse.
- **Trace Format Auto-Detection**: Ingests:
  - **Chromium NetLogs**: Follows Chrome's own links from each request to the stream job, socket or QUIC session, DNS lookup, and certificate check it actually used. Produces the troubleshooting report.
  - **HAR Files**: Ingests HTTP Archives exported from Chrome, Edge, Firefox, or Safari DevTools.
  - **Generic JSON / Spans**: Ingests OpenTelemetry and custom microservice execution spans.
- **Automatic Credential Redaction**: Automatically scrubs `Authorization`, `Cookie`, `Set-Cookie`, and API keys before outputting diagrams.
- **Interactive Signal-Flow Canvas**:
  - **Pan & Zoom**: Mouse drag pan, scroll wheel zoom with cursor pivot, and floating toolbar (`+`, `−`, `1:1`, `Fit`).
  - **Route Hover Isolation**: Hovering over any arrow or activation bar highlights the active route and dims unrelated lifelines.
  - **Floating Tooltips**: Real-time inspection of latency (ms), HTTP method, status code, and byte transfer.
  - **Inspector Drawer**: Click any interaction to inspect request/response headers, connection info, latency ratings (Fast/Moderate/Slow), guidance cards, Lighthouse links, and raw step JSON.
  - **Search & Filter**: Filter input highlights matching interactions across labels, details, and endpoints.

---

## Developer & Power User Quick Start

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
# Chromium NetLog export (troubleshooting report)
node bin/traceviz.mjs ~/Downloads/net-export.json --open

# Analyze a specific site from the same capture
node bin/traceviz.mjs ~/Downloads/net-export.json --page https://contoso.sharepoint.com --open

# HTTP Archive (HAR)
node bin/traceviz.mjs network.har --open

# Filter by URL pattern
node bin/traceviz.mjs netlog.json --filter "api/v1" --open
```

### 3. Generate Example Gallery

```bash
npm run generate:examples
```

---

## CLI Reference

```text
node bin/traceviz.mjs <input-trace.json> [options]
socketmap <input-trace.json> [options]

OPTIONS:
  -o, --output <file>    Target output HTML file path (default: ./trace-diagram.html)
  --filter <regex>       Filter requests by URL or method pattern
  --page <site>          NetLog only: analyze this site (e.g. https://contoso.sharepoint.com)
  --sample               Generate demo diagram using synthetic reference data
  --open                 Automatically open the generated visual in your default browser
  -h, --help             Show help message and exit
  -v, --version          Show version and exit
```

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
