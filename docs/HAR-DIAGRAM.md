# HAR and JSON diagram view

SocketMap's main workflow is the troubleshooting report (see the [README](../README.md) and the [user guide](USER-GUIDE.md)). A HAR on its own now opens in that same report (`node bin/traceviz.mjs file.har`, or drop it in the viewer), with what a HAR does not record shown as not recorded. This page covers the older **diagram view**, which the command line still produces for generic JSON traces and, with `--diagram`, for a HAR.

> The diagram does not follow the report's "only real values" rule: it draws a fixed four-column layout and adds an upstream hop and default values that are not in the file. Prefer the report for troubleshooting. This is listed under Known risks in `ARCHITECTURE.md`.

## Make a diagram

```bash
# From a HAR file saved in browser DevTools (Network panel > Export HAR)
node bin/traceviz.mjs network.har -o diagram.html --open

# Built-in demo diagram
node bin/traceviz.mjs --sample -o sample.html --open
```

To save a HAR file: open DevTools (F12, or Cmd+Option+I on a Mac), select the **Network** tab, reproduce the problem, then right-click the request list and choose **Save all as HAR with content**. HAR files can contain cookies and response bodies; handle them carefully.

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

## What you can do with the diagram

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

## What the colors mean

| Visual Style | Direction | Meaning in Plain English |
|---|---|---|
| **Solid Cyan / Green** | `→` | **Request**: Your browser asking a server for information or submitting data. |
| **Dashed Slate / Gray** | `←` | **Response**: The server sending back data, images, or status codes. |
| **Solid Coral / Red** | `→` | **Security / Auth**: Password checks, token validations, or firewall blocks. |
| **Dashed Purple** | `⇢` | **Async Task**: Background jobs, analytics, or queue dispatches. |
| **Curved Orange Loop** | `↺` | **Retry / Cache**: An operation that was retried or served from local cache. |

---

