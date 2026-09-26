# SocketMap user guide

This guide is for anyone troubleshooting a slow web page, whether or not you work in networking. It covers capturing the problem, opening the report, reading every part of it, and what to do next.

- [1. Capture the slow page](#1-capture-the-slow-page)
- [2. Open the report](#2-open-the-report)
- [3. Read the report](#3-read-the-report)
- [4. What each finding means](#4-what-each-finding-means)
- [5. Protocols: HTTP/1.1, HTTP/2, HTTP/3](#5-protocols-http11-http2-http3)
- [6. Share the report](#6-share-the-report)
- [7. Next steps when the network looks fine](#7-next-steps-when-the-network-looks-fine)
- [8. Troubleshooting SocketMap itself](#8-troubleshooting-socketmap-itself)

---

## 1. Capture the slow page

SocketMap reads a **NetLog**: Chrome's and Edge's own detailed record of network activity. Recording one takes about two minutes and needs nothing installed.

1. Close other tabs, so their traffic does not mix into the capture.
2. Open a new tab and type `chrome://net-export` in the address bar (in Microsoft Edge: `edge://net-export`).
3. Leave **Strip private information** selected. SocketMap does not need cookies or passwords.
4. Click **Start Logging to Disk** and choose where to save the file. The default name is `chrome-net-export-log.json`.
5. In another tab, load the slow page, or repeat the slow action (open the document, sign in, click the button).
6. Wait until the page finishes, then go back to the net-export tab and click **Stop Logging**.

**Capture twice when you can.** The same page from two places (office and home, VPN on and off, your machine and a colleague's) gives two reports to compare. Whatever differs usually points at the cause.

## 2. Open the report

**No install: the viewer.** Download `socketmap-viewer.html` from the repository's Releases page (or get it from whoever shared SocketMap with you) and double-click it. It opens in Chrome or Edge. Drop the capture file on the page, or click the drop area to choose it. The report appears in a few seconds, even for large captures, and the file never leaves your computer.

Not sure what to expect? Click **Try the sample capture** on the viewer's start page: it opens a report built from a made-up capture that shows TLS inspection, a proxy, a refused call to a local agent, and a slow server.

**Command line.** If you have Node.js installed:

- Windows (PowerShell): `node bin\traceviz.mjs "$env:USERPROFILE\Downloads\chrome-net-export-log.json" -o report.html --open`
- macOS: `node bin/traceviz.mjs ~/Downloads/chrome-net-export-log.json -o report.html --open`

**The page SocketMap picks.** A capture often contains other tabs and background traffic. SocketMap analyzes the site you loaded (the one with a full page load and the most requests). To analyze another site from the same capture, use the **Page** menu at the top of the viewer, or `--page https://site.example.com` on the command line. Everything else is listed under **Environment > Other activity in this capture**.

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
| Network path | Direct | Through a proxy | | Certificate from a private root (TLS inspection) |
| Server response (median wait) | Under 200 ms | 200 to 500 ms | 500 ms to 1 s | Over 1 s |

"Not recorded" means the capture did not contain that value, for example certificate details for a connection that was already open before the capture started. SocketMap never guesses.

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

Click a row to see its plain-language summary, timing, connection and certificate details, and the request and response headers (with secrets removed). Hover the protocol or status for its meaning.

### Sequence

The page load drawn as a conversation. The left column is your browser; each other column is a server. Time runs top to bottom, and the number on the left is when each step started.

- **Solid arrow:** the browser asks a server for something and gets an answer. The tags under it show the protocol (H2, H3), the result (200 means OK), the server wait, and the size.
- **Dashed arrow:** the browser opens a new connection to that server.
- **Red row:** a failure, or a connection whose certificate points to TLS inspection.
- **Amber row:** slow.

Click any row or server heading: the **Details** panel explains it in four tabs (Explained, Timing, Connection, Headers). Use **Hide details panel** to give the diagram the full width; clicking a row brings the panel back.

### Filter

On the Waterfall and Sequence tabs, the bar under the header narrows both views:

- **Search** by host, address, status code, or protocol (for example `sharepoint`, `404`, `h3`).
- **Problems:** failed requests and TLS inspection.
- **Slow:** server wait over 500 ms, or a request over 1 second in total.
- **TLS inspection:** connections re-signed by a private certificate root.
- **Local calls:** requests to this computer (localhost) or the local network.

### Environment

The browser, operating system, local IP address, DNS servers, DNS search domains, secure DNS setting, and proxy setup at the time of the capture, plus the other sites and background traffic in the capture.

### AI summary

A compact text version of the report. Click **Copy summary** and paste it into your AI assistant with a question such as "What is slowing this page down, and who should look at it?"

### Learn

Next steps, links to deeper tools and guidance, and a glossary of every term the report uses.

## 4. What each finding means

| Finding | What it means | Usual cause | Who to involve |
|---|---|---|---|
| **TLS inspection** (high) | A server's certificate was issued by a private root, not a public certificate authority | A proxy or security agent decrypts and re-encrypts traffic (SSL inspection). Microsoft, for example, recommends excluding Microsoft 365 traffic from it | Network security |
| **Proxy asked for authentication** (high) | The proxy answered with HTTP 407 | Proxy sign-in on every connection | Network (proxy) |
| **Called a service on this computer or local network** | The page talked to `localhost` or a private address | Sign-in agents (such as Okta Verify), sync clients, or security tools listening locally | Endpoint / desktop engineering, identity |
| **Traffic goes through a proxy** | Requests went via a proxy server | Proxy or PAC configuration. Check whether these destinations should bypass it | Network (proxy / PAC) |
| **Deciding whether to use a proxy was slow** | Over 100 ms spent on the proxy decision | A slow or large PAC script, or WPAD discovery | Network (PAC / WPAD) |
| **Requests that failed** | Errors or HTTP 4xx/5xx | Varies; each line names the error | Depends on the host |
| **Servers that were slow to respond** | Over 1 second between request and first byte | Server load, or something in front of the server (CDN, proxy, gateway) | Application owner or vendor |
| **Slow connection setup** | A new connection took over 300 ms | Distance, packet loss, VPN, or an inspection device | Network |
| **Slow or failed DNS** | A lookup took over 100 ms or failed | Slow or distant DNS servers (listed under Environment) | Network (DNS) |
| **QUIC connections failed** | HTTP/3 attempts failed | A firewall blocking UDP port 443, forcing a fallback to HTTP/2 | Network (firewall) |
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
