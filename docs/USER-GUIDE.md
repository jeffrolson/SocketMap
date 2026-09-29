# SocketMap user guide

This guide is for anyone seeking data-driven insights into a page load, whether or not you work in networking. It covers capturing a page load, opening the report, understanding the recorded activity, and deciding what to investigate next.

- [1. Capture a page load](#1-capture-a-page-load)
- [2. Open the report](#2-open-the-report)
- [3. Read the report](#3-read-the-report)
- [4. What each finding means](#4-what-each-finding-means)
- [5. Protocols: HTTP/1.1, HTTP/2, HTTP/3](#5-protocols-http11-http2-http3)
- [6. Share the report](#6-share-the-report)
- [7. Next steps when the network looks fine](#7-next-steps-when-the-network-looks-fine)
- [8. Troubleshooting SocketMap itself](#8-troubleshooting-socketmap-itself)

---

## 1. Capture a page load

Open the viewer and click **Copy Chrome address** near the top. Paste `chrome://net-export` into Chrome's address bar. The short checklist beside the drop area takes you through starting the log, reproducing the problem in another tab, and stopping the log before dropping the saved file into SocketMap.

SocketMap reads a **NetLog**: Chrome's and Edge's own detailed record of network activity. Recording one takes about two minutes and needs nothing installed.

1. Close other tabs, so their traffic does not mix into the capture.
2. Open a new tab and type `chrome://net-export` in the address bar (in Microsoft Edge: `edge://net-export`).
3. Leave **Strip private information** selected. SocketMap does not need cookies or passwords.
4. Click **Start Logging to Disk** and choose where to save the file. The default name is `chrome-net-export-log.json`.
5. In another tab, load the page, or perform the action you want to understand (open the document, sign in, click the button).
6. Wait until the page finishes, then go back to the net-export tab and click **Stop Logging**.

**Capture twice when you can.** Repeat the same page or action from two places (office and home, VPN on and off, your machine and a colleague's). The comparison shows what changed; a controlled follow-up test helps establish the cause.

## 2. Open the report

**No install: the viewer.** Download `socketmap-viewer.html` from the repository's Releases page (or get it from whoever shared SocketMap with you) and double-click it. It opens in Chrome or Edge. Drop the capture file on the page, or click the drop area to choose it. The report appears in a few seconds, even for large captures, and the file never leaves your computer.

Not sure what to expect? Click **Try the sample capture** on the viewer's start page: it opens a report built from a made-up capture that shows TLS inspection, a proxy, a refused call to a local agent, and a slow server.

**Command line.** If you have Node.js installed:

- Windows (PowerShell): `node bin\traceviz.mjs "$env:USERPROFILE\Downloads\chrome-net-export-log.json" -o report.html --open`
- macOS: `node bin/traceviz.mjs ~/Downloads/chrome-net-export-log.json -o report.html --open`

**The page SocketMap picks.** A capture often contains other tabs and background traffic. SocketMap analyzes the site you loaded (the one with a full page load and the most requests). Use the **Page / site** menu at the top to switch sites. It groups websites separately from browser and extension activity, shows request counts, and displays the selected page URL beside the menu. These are groups of requests by site, not a list of every visited URL. The CLI equivalent is `--page https://site.example.com`. Other activity is also listed under **Environment**.

**Choose an appearance.** Use **Light theme** or **Dark theme** in the viewer or report. The choice is remembered when browser storage is available; the initial appearance follows your system preference. A saved report includes the selected theme and still lets its reader switch.

### Compare two captures

The comparison also shows browser-wide snapshot changes and source-family activity. Source IDs belong to individual captures and are never paired across files. Snapshot differences are evidence of changed recorded state, not proof of a root cause.

Click **Compare two captures** on the start page and select two NetLog JSON files, or drop both files together. The first file is **A (baseline)** and the second is **B (comparison)**. To compare against a report already open, click **Compare with another capture**, or drop the second file onto the report. **Replace B capture** changes the second file while keeping A.

Use the separate **A page / site** and **B page / site** menus to select the same page or action. B starts with A's site when that site exists in both files. If the selected sites or page URLs differ, the comparison says so. **Swap A / B** reverses the baseline and the direction of the changes. **A report** and **B report** open each capture's full waterfall, sequence, environment, and other views.

The comparison shows:

- Recorded activity span, median request duration, server wait, request counts, known failures, and recorded bytes. Changes are **B minus A**, with coverage shown where data is missing. The activity span is network evidence, not a browser rendering or page-ready measurement.
- Paired request bars using the same scale within each row, with filters for changed requests and requests present only in A or B. Expand a row for recorded timing phases and response details.
- Environment settings side by side and a copyable/downloadable summary with evidence for an AI assistant.

Requests pair by method and redacted URL, preserving query parameters and ignoring URL fragments. Repeated requests pair in capture order. Missing methods or URLs remain unpaired; redaction and repeated requests can make matches ambiguous. A missing request is not automatically an improvement or a regression. Incomplete request durations are shown as not recorded.

Click **Save comparison** while the Comparison view is selected to create one self-contained HTML file. It includes both sides of the selected comparison, search, filters, themes, and the text summary, and opens offline without the original files. The viewer can read two capture models in memory, but streams each input separately and does not retain the raw event lists. Saved comparisons are reports, not capture inputs; choose the original NetLog files when starting a new comparison.

## 3. Read the report

The report is one HTML file with six tabs down the left side (across the top on small screens).

### Overview

- **Top numbers:** time from the first request to the last response, number of requests and servers, data transferred, and findings.
- **Findings:** the problems SocketMap detected, most serious first. Each one has the evidence from the capture and **who to involve**. See [section 4](#4-what-each-finding-means).
- **Where the time went:** all requests' time added up by phase. Requests overlap, so the total is larger than the load time. A large green "Server wait" share means time spent waiting on servers; large DNS, connect, or TLS shares point at the network path.
- **Hosts and connection ratings:** every server the page used, with its IP address, certificate issuer, and six ratings. Hover any rating or column heading for its meaning, or open **What do these ratings mean?** under the table.

| Measure | Best | Better | Good | Poor |
|---|---|---|---|---|
| Protocol | HTTP/3 (QUIC) | HTTP/2 | HTTP/1.1 | QUIC failed, fell back to TCP |
| Encryption (TLS) | 1.3 | 1.2 | | Below 1.2 |
| Connection setup | Reused an open connection | New, under 100 ms | 100 to 300 ms | Over 300 ms, or failed |
| DNS lookup | From cache | Under 20 ms | 20 to 100 ms | Over 100 ms, or failed |
| Network path | Direct | Through a proxy | | Certificate from a private root (investigate inspection or private PKI) |
| Server response (median wait) | Under 200 ms | 200 to 500 ms | 500 ms to 1 s | Over 1 s |

"Not recorded" means the capture did not contain that value, for example certificate details for a connection that was already open before the capture started. SocketMap never guesses.

### What the servers said

Some servers describe their own work in response headers. SocketMap reads the ones already in your capture, so there is nothing extra to record. The Overview panel **What the servers said** shows:

- **Reported their own timing:** how many responses carried `Server-Timing`.
- **Cache answers:** how many cache or CDN headers reported a hit, a miss, or both. This is the CDN's own claim.
- **Largest reported phase:** the biggest time a server reported for itself, drawn against how long the browser waited.
- **A ranked list of reported phases:** the solid bar is what the server reported, the faint bar behind it is the browser's wait. Select a row to open that request.
- **Who is in front of the servers:** a hint from header names such as `cf-ray`, not proof.
- **Other timing headers:** shown as sent. Their unit and meaning belong to the site, and SocketMap does not interpret them.
- **IDs to give the server team:** request or correlation IDs with copy buttons, so the server team can search their logs.

Open a request in the waterfall for its own **What the server said** block. A thin line under the wait bar is as wide as the largest reported phase.

Read these as the server's account, not a measurement: phases can overlap (so they are never added together), and a phase longer than the browser's wait is flagged rather than hidden. If no response carries any of this, the panel says so. Ask the platform team to send the `Server-Timing` header and a request ID, capture again, and compare.

### Waterfall

Every request in the order it started. The colored bar shows where each request's time went:

| Phase | In plain words |
|---|---|
| Redirects | Being sent to a different address first, for example during sign-in |
| Browser queue | Waiting inside the browser before starting |
| Proxy lookup | Deciding whether to use a proxy (often a PAC script) |
| DNS | Looking up the server's address |
| TCP / QUIC connect | Opening the connection; mostly reflects distance and network delay |
| TLS handshake | Setting up encryption and checking the certificate |
| Waiting for connection | Waiting for a free connection to this server |
| Sending request | Sending the request |
| Server wait | Waiting for the server to start answering |
| Download | Receiving the answer |

The timing color key stays pinned below the report header while you scroll. Hover or focus a phase for its meaning. Click a row for timing, connection and certificate details, and the redacted headers. Hover an HTTP method such as **GET**, **POST**, or **OPTIONS** to learn what the browser is asking the server to do; protocols and statuses also have explanations.

### Sequence

The page load drawn as a conversation. The left column is your browser; each other column is a server. Time runs top to bottom, and the number on the left is when each step started.

- **Solid arrow:** the browser asks a server for something and gets an answer. The tags under it show the protocol (H2, H3), the result (200 means OK), the server wait, and the size.
- **Dashed arrow:** the browser opens a new connection to that server.
- **Red row:** a failure, or a connection whose certificate points to TLS inspection.
- **Amber row:** slow.

Hover a label above an arrow, such as **TCP + TLS handshake**, for a brief explanation of what the browser is attempting. Click a row or server heading for four detail tabs (Explained, Timing, Connection, Headers). Use **Hide details panel** in the panel itself or beside the Sequence heading to give the diagram the full width. **Show details panel** restores it; selecting a row also brings it back. On narrower screens the panel sits below the diagram.

### Filter

On the Waterfall and Sequence tabs, the bar under the header narrows both views:

- **Search** by host, address, status code, or protocol (for example `sharepoint`, `404`, `h3`).
- **Problems:** failed requests and TLS inspection.
- **Slow:** server wait over 500 ms, or a request over 1 second in total.
- **TLS inspection:** connections re-signed by a private certificate root.
- **Local calls:** requests to this computer (localhost) or the local network.

### Environment

Recorded browser version, channel and build, operating system, local addresses, DNS server addresses and ports, resolver timeout and attempts, DNS rotation and hosts-file presence, secure DNS endpoints, PAC address, automatic proxy discovery, and fixed or unavailable proxies. Fields vary by browser and capture; absent values say **Not recorded**. These describe the captured computer, not the computer currently viewing the report. Credential-bearing command-line and environment values are sanitized.

### Coverage

A map of the request path (page code, browser, network stack, network path, server) that shows what this capture recorded at each stage. Every row has one of four labels, shown as text and an icon:

- **Recorded:** the capture has the data.
- **Partial:** some of it, with the count (for example, 36 of 46 requests).
- **Not in this file:** a NetLog can record it, but this file has none. Recapturing may fix it.
- **Never in a NetLog:** it needs another tool, such as JavaScript time, packet loss, or what the server did.

**Which tool sees what** compares NetLog, HAR export, Performance profile, Lighthouse, packet capture, route trace and server logs across the questions above. The first column is measured from your capture. The other columns describe what each tool can show in general, so you can pick the next tool to collect; SocketMap does not read them yet, and the table says so. Tick **Show only what this capture is missing** to hide the questions your capture already answers. Below the table, **If you see this, add that** maps common symptoms to the tool that answers them.

The counts come from your capture; the "never" rows are facts about the NetLog format. Not recorded does not mean it was fine. **Worth capturing next** lists other data to collect separately (a Chrome Performance profile, a request ID for the server team, a HAR, Lighthouse, a packet capture, a route trace, or a second capture to compare). SocketMap does not read those yet. The same summary is included in the AI summary.

### Diagnostics and Events

**Diagnostics** includes browser-wide activity beyond the selected page. Start with **What to investigate next**: each observation has a next check and, where available, an **Inspect source** button. These are investigation leads, not proven causes.

Use the timeline buttons to view event volume, errors, sent/received bytes, observed active connections/requests/DNS jobs, and disk-cache activity. The range sliders narrow the time window; hover for bucket values. The chart uses bounded time buckets, so inspect Events for precise individual timestamps. Missing measurements stay unavailable.

Browser snapshot tabs expose DNS, proxy, sockets, stream pools, Alt-Svc, HTTP/2, QUIC, reporting, cache, modules and prerender data when the browser recorded it. Expand a field for its recorded table or JSON. A snapshot describes browser state at collection time; it does not prove that state was constant throughout the capture.

Search and sort **All captured sources**, then select a source ID to inspect its events. **Events** supports multiple source IDs, event/source type, text and errors-only filters. It decodes recorded names and streams the original file again for each query, retaining only a page of results. Source dependency buttons follow related work. A saved report retains snapshots and summaries; attach the original NetLog locally for full event inspection. The original capture is not embedded in the HTML.

No requests in the capture? Diagnostics still opens. An incomplete-capture notice means some evidence is missing, not that the absent operations succeeded.

### AI summary

A detailed handoff with the source file, capture scope, environment, timing breakdown, findings, hosts, connection details, request IDs and full redacted URLs, failures, redirects, and missing-data limitations. Long evidence lists state how many items were omitted. Recorded facts and derived findings are labeled separately, with instructions for the assistant to distinguish evidence, hypotheses, and the next test.

Use **Copy summary** to paste it into your approved AI assistant, or **Save summary (.txt)** to keep it for later. The summary retains internal addresses and paths; use the same sharing care as for the report.

### Learn

Next steps, links to deeper tools and guidance, and an expanded glossary. Search for a term such as **TLS**, **preflight**, or **401** to narrow the definitions.

## 4. What each finding means

| Finding | What it means | Usual cause | Who to involve |
|---|---|---|---|
| **Private-root certificates observed** (high) | The recorded chain uses a non-public root | Could be TLS inspection or a privately managed certificate. Check verification results and certificate policy before deciding | Network security |
| **Proxy asked for authentication** (high) | The proxy answered with HTTP 407 | Proxy sign-in on every connection | Network (proxy) |
| **Called a service on this computer or local network** | The page talked to `localhost` or a private address | Sign-in agents (such as Okta Verify), sync clients, or security tools listening locally | Endpoint / desktop engineering, identity |
| **Traffic goes through a proxy** | Requests went via a proxy server | Proxy or PAC configuration. Check whether these destinations should bypass it | Network (proxy / PAC) |
| **Deciding whether to use a proxy was slow** | Over 100 ms spent on the proxy decision | A slow or large PAC script, or WPAD discovery | Network (PAC / WPAD) |
| **Requests that failed** | Errors or HTTP 4xx/5xx | Varies; each line names the error | Depends on the host |
| **Servers that were slow to respond** | Over 1 second between request and first byte | Server load, or something in front of the server (CDN, proxy, gateway) | Application owner or vendor |
| **Slow connection setup** | A new connection took over 300 ms | Distance, packet loss, VPN, or an inspection device | Network |
| **Slow or failed DNS** | A lookup took over 100 ms or failed | Slow or distant DNS servers (listed under Environment) | Network (DNS) |
| **QUIC connections failed** | QUIC attempts failed | Check the recorded error and any subsequent connection. A failed attempt alone does not prove UDP blocking or TCP fallback | Network |
| **Requests waited inside the browser** (info) | Over 100 ms before a connection was available | Too many requests to one server, HTTP/1.1, or a busy proxy | Usually none |
| **Hosts using HTTP/1.1** (info) | A server was reached over HTTP/1.1 | The server or a proxy on the path does not support HTTP/2 | Network (proxy) or application owner |

## 5. Protocols: HTTP/1.1, HTTP/2, HTTP/3

You will see these as `http/1.1`, `h2`, and `h3` (or H2 and H3 in the Sequence view). Hover any of them in the report for a quick explanation, or open **What do H3, H2, and HTTP/1.1 mean?** in the Waterfall or Sequence tab.

| | HTTP/3 (H3) | HTTP/2 (H2) | HTTP/1.1 |
|---|---|---|---|
| In plain words | Newest; connects faster and copes better with packet loss | Many requests over one connection | Oldest; one request at a time per connection |
| Runs over | QUIC over UDP port 443 | TCP | TCP |
| Requests at once | Many; a lost packet only delays its own request | Many over one connection | One per connection, up to 6 connections per server |
| Opening a new connection | 1 round trip (0 when reconnecting) | 2 round trips | 2 round trips |
| Rating | Best | Better | Good |
| Watch for | Firewalls blocking UDP 443 force a fallback to HTTP/2 | One lost packet stalls every request on the connection | Queueing on busy pages; often forced by proxies |

The browser uses the newest version both sides support. Seeing HTTP/1.1 or H2 where H3 is expected usually means something on the network path does not support the newer version.

## 6. Share the report

- The report is one HTML file. Email it, attach it to a ticket, or put it on SharePoint. It opens offline in any modern browser.
- In the viewer, **Save report** downloads it; from the command line it is the file you named with `-o`.
- **Removed:** passwords, cookies, authorization headers, and tokens, including tokens in URLs.
- **Kept:** IP addresses, host names, full URLs (including document names), and certificate details. The network team needs these. Treat the report as internal troubleshooting data.
- Share the report, not the raw capture.

## 7. Next steps when the network looks fine

A network log shows network activity only. If the report shows no network problems but the page still feels slow:

- **The page's own code:** record a Performance profile in Chrome DevTools (F12 > Performance > Record, then reload).
- **Security software inside the browser:** compare a capture with the software paused, if your policy allows.
- **Packet-level problems** such as retransmissions: a packet capture (Wireshark) from the network team.
- **Microsoft 365:** run the Microsoft 365 network connectivity test (connectivity.office.com) from the same computer.

The report's **Learn** tab links to all of these.

## 8. Troubleshooting SocketMap itself

| Problem | Fix |
|---|---|
| The viewer says "This is a HAR file" | The viewer reads NetLog captures from net-export. HAR files work with the command line (`node bin/traceviz.mjs file.har`) and produce the older diagram view. |
| The viewer says the file "does not look like a NetLog capture" | Make sure you saved the file from `chrome://net-export` or `edge://net-export`, not a DevTools export. |
| Double-clicking the viewer opens the wrong program | Right-click it and choose **Open with > Microsoft Edge** or **Google Chrome**. |
| The report analyzes the wrong site | Pick the site in the viewer's **Page** menu, or use `--page` on the command line. |
| Windows: `node` or `git` is not recognized | Close and reopen PowerShell after installing, or restart the computer. |
| Windows: `winget` is not available | Install Node.js LTS from nodejs.org, and use GitHub's **Code > Download ZIP** instead of Git. |
| A value says "Not recorded" | The capture did not contain it, often because the connection was opened before logging started. Capture again from a fresh tab. |
| No machine name, public IP, or traceroute | A NetLog does not contain them. A capture helper for these is on the roadmap. |
