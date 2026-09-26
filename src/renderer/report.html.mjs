/**
 * SocketMap troubleshooting report: one self-contained HTML file.
 *
 * Sections: environment, findings, where the time went, host ratings, request
 * waterfall, sequence diagram, other activity, and an AI-ready summary. No remote
 * resources; colors live in CSS variables so a DESIGN.md theme can replace them.
 */

import { buildTraceSvg } from "./svg-builder.mjs";
import { normalizeTrace, formatDuration, formatBytes } from "../normalizer.mjs";
import { TIMING_LABELS, buildAiSummary } from "../analysis.mjs";

const VERSION = "0.3.0";
const SEGMENTS = ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled", "send", "wait", "download"];
const MAX_SEQUENCE_HOSTS = 8;
const MAX_SEQUENCE_REQUESTS = 200; // display limit for the diagram only; the waterfall shows every request

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ms = (v) => (v == null ? "n/a" : formatDuration(v));

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url || "";
  }
}

function chip(r) {
  return `<span class="chip lvl-${esc(r.level)}" title="${esc(r.level)}">${esc(r.value)}</span>`;
}

function renderEnvironment(env) {
  const rows = [
    ["Browser", env.browser],
    ["Operating system", env.os],
    ["Capture started", env.captureStartedAt],
    ["Capture length", ms(env.captureDurationMs)],
    ["Capture mode", env.captureMode],
    ["Local IP address", env.localAddresses.join(", ") || "Not recorded"],
    ["DNS servers", env.dns.servers.join(", ") || "Not recorded"],
    ["DNS search domains", env.dns.search.join(", ") || "None"],
    ["Secure DNS (DoH)", [env.dns.secureDns, ...env.dns.dohServers].filter(Boolean).join(", ") || "Not recorded"],
    ["Proxy setup", `${env.proxy.mode}${env.proxy.detail ? `: ${env.proxy.detail}` : ""}`],
    ["Proxies marked bad", env.proxy.badProxies.length ? env.proxy.badProxies.map(p => p.proxy_uri || JSON.stringify(p)).join(", ") : "None"]
  ];
  return `
    <section id="environment" class="card">
      <h2>Environment</h2>
      <dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? "Not recorded")}</dd>`).join("")}</dl>
      ${env.commandLine ? `<details class="more"><summary>Browser command line</summary><pre>${esc(env.commandLine)}</pre></details>` : ""}
      <p class="note">Machine name, public IP, and traceroute are not part of a NetLog capture.</p>
    </section>`;
}

function renderFindings(findings) {
  if (!findings.length) {
    return `<section id="findings" class="card"><h2>Findings</h2><p>None of the built-in checks fired. Look at the waterfall for the longest bars.</p></section>`;
  }
  return `
    <section id="findings" class="card">
      <h2>Findings</h2>
      ${findings.map(f => `
        <article class="finding sev-${esc(f.severity)}">
          <header><span class="sev">${esc(f.severity)}</span><h3>${esc(f.title)}</h3></header>
          <p>${esc(f.detail)}</p>
          <ul>${f.evidence.map(e => `<li><code>${esc(e)}</code></li>`).join("")}</ul>
          <p class="team">Who to involve: <strong>${esc(f.team)}</strong></p>
        </article>`).join("")}
    </section>`;
}

function renderBreakdown(breakdown) {
  const entries = SEGMENTS.map(k => [k, breakdown[k] || 0]).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0) || 1;
  return `
    <section id="breakdown" class="card">
      <h2>Where the time went</h2>
      <p class="note">Summed across all requests for this page. Requests overlap, so the total is larger than the load time.</p>
      <div class="stack">${entries.map(([k, v]) => `<span class="seg seg-${k}" style="width:${(v / total * 100).toFixed(2)}%" title="${esc(TIMING_LABELS[k])}: ${esc(ms(v))}"></span>`).join("")}</div>
      <ul class="legend">${entries.sort((a, b) => b[1] - a[1]).map(([k, v]) =>
        `<li><span class="swatch seg-${k}"></span>${esc(TIMING_LABELS[k])} <strong>${esc(ms(v))}</strong> <span class="muted">(${(v / total * 100).toFixed(0)}%)</span></li>`).join("")}</ul>
    </section>`;
}

function renderHosts(hosts) {
  return `
    <section id="hosts" class="card">
      <h2>Hosts and connection ratings</h2>
      <p class="note">Ratings: <span class="chip lvl-best">Best</span> <span class="chip lvl-better">Better</span> <span class="chip lvl-good">Good</span> <span class="chip lvl-poor">Poor</span> <span class="chip lvl-unknown">Not recorded</span></p>
      <div class="table-wrap">
      <table>
        <thead><tr><th>Host</th><th>Server IP</th><th>Req</th><th>Protocol</th><th>TLS</th><th>Certificate issuer</th><th>Connection</th><th>DNS</th><th>Path</th><th>Server wait</th></tr></thead>
        <tbody>${hosts.map(h => `
          <tr class="host-row overall-${esc(h.overall)}">
            <td><span class="dot lvl-${esc(h.overall)}"></span>${esc(h.host)}</td>
            <td><code>${esc(h.ips.join(", ") || "n/a")}</code></td>
            <td>${h.requests}</td>
            <td>${chip(h.ratings.protocol)}</td>
            <td>${chip(h.ratings.tls)}</td>
            <td>${h.cert ? `${esc(h.cert.issuer || "unknown")}${h.cert.knownRoot === false ? ' <span class="chip lvl-poor">private root</span>' : h.cert.knownRoot ? ' <span class="muted">public root</span>' : ""}` : '<span class="muted">Not recorded</span>'}</td>
            <td>${chip(h.ratings.connection)}</td>
            <td>${chip(h.ratings.dns)}</td>
            <td>${chip(h.ratings.path)}</td>
            <td>${chip(h.ratings.server)}</td>
          </tr>`).join("")}
        </tbody>
      </table>
      </div>
    </section>`;
}

function renderRequestDetail(r, conn) {
  const timing = SEGMENTS.map(k => `<tr><th>${esc(TIMING_LABELS[k])}</th><td>${esc(ms(r.timing[k]))}</td></tr>`).join("");
  const connRows = conn ? [
    ["Connection", `${conn.kind.toUpperCase()} ${r.reusedConnection ? "(reused)" : r.reusedConnection === false ? "(new)" : ""}`],
    ["Server", `${conn.remoteIp ?? "n/a"}${conn.remotePort ? `:${conn.remotePort}` : ""}`],
    ["Local address", conn.localAddress],
    ["TLS", [conn.tlsVersion, conn.alpn].filter(Boolean).join(", ")],
    ["Certificate", conn.cert ? `${conn.cert.subject || "?"} issued by ${conn.cert.issuer || "?"} (root ${conn.cert.root || "?"}; ${conn.cert.knownRoot === false ? "PRIVATE root" : conn.cert.knownRoot ? "public root" : "root status not recorded"})` : null],
    ["Connection error", conn.error]
  ].filter(([, v]) => v) : [["Connection", r.fromCache ? "Served from browser cache" : "Not recorded"]];
  return `
    <div class="detail">
      <div class="detail-grid">
        <table class="mini"><tbody>
          <tr><th>URL</th><td class="wrap">${esc(r.url)}</td></tr>
          <tr><th>Result</th><td>${esc(r.netError || (r.status != null ? `${r.status} ${r.statusText || ""}` : r.fromCache ? "cache" : "n/a"))}</td></tr>
          <tr><th>Protocol</th><td>${esc(r.protocol || "n/a")}</td></tr>
          <tr><th>Proxy</th><td>${esc(r.proxy || "n/a")}</td></tr>
          <tr><th>Size</th><td>${esc(formatBytes(r.bytesWire) || "n/a")} on the wire${r.bytesDecoded ? `, ${esc(formatBytes(r.bytesDecoded))} decoded` : ""}</td></tr>
          ${r.redirects.length ? `<tr><th>Redirected to</th><td class="wrap">${r.redirects.map(esc).join("<br>")}</td></tr>` : ""}
          ${connRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="wrap">${esc(v)}</td></tr>`).join("")}
        </tbody></table>
        <table class="mini"><tbody><tr><th>Total</th><td><strong>${esc(ms(r.durationMs))}</strong></td></tr>${timing}</tbody></table>
      </div>
      ${r.requestHeaders.length ? `<details class="more"><summary>Request headers</summary><pre>${esc(r.requestHeaders.join("\n"))}</pre></details>` : ""}
      ${r.responseHeaders.length ? `<details class="more"><summary>Response headers</summary><pre>${esc(r.responseHeaders.join("\n"))}</pre></details>` : ""}
    </div>`;
}

function renderWaterfall(analysis, connections) {
  const { page, pageRequests } = analysis;
  const span = Math.max(1, page.loadMs);
  const pct = (v) => `${Math.max(0, v / span * 100).toFixed(3)}%`;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => `<span style="left:${f * 100}%">${esc(formatDuration(f * span))}</span>`).join("");
  const rows = pageRequests.map(r => {
    const failed = r.netError && r.netError !== "ERR_ABORTED";
    const status = r.netError || r.status || (r.fromCache ? "cache" : "");
    const segs = SEGMENTS.filter(k => r.timing[k] > 0)
      .map(k => `<span class="seg seg-${k}" style="width:${(r.timing[k] / Math.max(1, r.durationMs) * 100).toFixed(2)}%" title="${esc(TIMING_LABELS[k])}: ${esc(ms(r.timing[k]))}"></span>`).join("");
    return `
      <details class="wf-row${failed || r.status >= 400 ? " is-failed" : ""}">
        <summary>
          <span class="wf-label" title="${esc(r.url)}"><span class="method">${esc(r.method || "")}</span> <span class="wf-host">${esc(r.host)}</span><span class="wf-path">${esc(pathOf(r.url))}</span></span>
          <span class="wf-status">${esc(status)}</span>
          <span class="wf-proto">${esc(r.protocol || "")}</span>
          <span class="wf-track"><span class="wf-bar" style="left:${pct(r.start - page.startMs)};width:${pct(Math.max(r.durationMs, span / 400))}">${segs}</span></span>
          <span class="wf-time">${esc(ms(r.durationMs))}</span>
        </summary>
        ${renderRequestDetail(r, connections.get(r.connectionId))}
      </details>`;
  }).join("");
  return `
    <section id="waterfall" class="card">
      <h2>Request waterfall</h2>
      <p class="note">Every request for this page, in start order. Click a row for its timing, connection, certificate, and headers.</p>
      <ul class="legend">${SEGMENTS.map(k => `<li><span class="swatch seg-${k}"></span>${esc(TIMING_LABELS[k])}</li>`).join("")}</ul>
      <div class="wf">
        <div class="wf-axis"><span class="wf-label"></span><span class="wf-status"></span><span class="wf-proto"></span><span class="wf-track ticks">${ticks}</span><span class="wf-time"></span></div>
        ${rows}
      </div>
    </section>`;
}

/** Sequence diagram of the page load: one lifeline per host, only values from the capture. */
export function buildSequenceTrace(analysis, connections) {
  const { page } = analysis;
  const pageRequests = analysis.pageRequests.slice(0, MAX_SEQUENCE_REQUESTS);
  const order = [...new Set(pageRequests.map(r => r.host))];
  const shown = order.slice(0, MAX_SEQUENCE_HOSTS);
  const hidden = order.length - shown.length;
  const idOf = (host) => (shown.includes(host) ? `h${shown.indexOf(host)}` : "other");
  const participants = [
    { id: "browser", label: "Browser", sublabel: "This computer", role: "client" },
    ...shown.map((h, i) => {
      const ips = [...new Set(pageRequests.filter(r => r.host === h).map(r => connections.get(r.connectionId)?.remoteIp).filter(Boolean))];
      return { id: `h${i}`, label: h.length > 24 ? `${h.slice(0, 21)}...` : h, sublabel: ips[0] || "IP not recorded", role: "gateway" };
    })
  ];
  if (hidden > 0) participants.push({ id: "other", label: `Other hosts (${hidden})`, sublabel: "See waterfall", role: "service" });

  const messages = [];
  for (const r of pageRequests) {
    const to = idOf(r.host);
    const conn = connections.get(r.connectionId);
    if (conn && r.reusedConnection === false) {
      const setup = (conn.connectMs || 0) + (conn.tlsMs || 0);
      messages.push({
        from: "browser", to,
        label: `${conn.kind === "quic" ? "QUIC handshake" : "TCP + TLS"}${conn.cert?.knownRoot === false ? ", private root" : ""}`,
        kind: conn.cert?.knownRoot === false || conn.error ? "security" : "async",
        latencyMs: setup, isBlocking: false
      });
    }
    const path = pathOf(r.url);
    messages.push({
      from: "browser", to,
      label: `${r.method || ""} ${path.length > 34 ? `${path.slice(0, 31)}...` : path}`,
      kind: "request", method: r.method, latencyMs: r.timing.send, isBlocking: false
    });
    messages.push({
      from: to, to: "browser",
      label: `${r.netError || r.status || (r.fromCache ? "cache" : "no response")}`,
      kind: r.netError && r.netError !== "ERR_ABORTED" ? "security" : "return",
      status: r.status ?? undefined, bytes: r.bytesWire ?? undefined, latencyMs: r.timing.wait, isBlocking: false
    });
  }
  return normalizeTrace({
    title: `Page load: ${page.site.replace(/^https?:\/\//, "")}`,
    phases: [`${page.requestCount} requests, ${formatDuration(page.loadMs)}`],
    participants,
    messages
  });
}

export function renderReportHtml(model, analysis) {
  const connections = new Map(model.connections.map(c => [c.id, c]));
  const { page } = analysis;
  const high = analysis.findings.filter(f => f.severity === "high").length;
  const svg = buildTraceSvg(buildSequenceTrace(analysis, connections));
  const summary = buildAiSummary(model, analysis);
  const title = `SocketMap Report: ${page.site.replace(/^https?:\/\//, "")}`;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="SocketMap ${VERSION}">
<title>${esc(title)}</title>
<style>
  :root {
    --bg: #070b12; --surface: #0b1120; --surface-2: #111a2e; --border: #1e293b;
    --text: #f8fafc; --text-muted: #94a3b8; --primary: #06b6d4;
    --best: #10b981; --better: #06b6d4; --good: #f59e0b; --poor: #f43f5e; --unknown: #64748b;
    --sev-high: #f43f5e; --sev-medium: #f59e0b; --sev-info: #64748b;
    --seg-redirect: #a855f7; --seg-queue: #475569; --seg-proxy: #ec4899; --seg-dns: #8b5cf6;
    --seg-connect: #f59e0b; --seg-tls: #f43f5e; --seg-stalled: #64748b; --seg-send: #94a3b8;
    --seg-wait: #10b981; --seg-download: #06b6d4;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
    --font-mono: ui-monospace, "SF Mono", Menlo, Consolas, monospace;
    --radius: 8px;
  }
  * { box-sizing: border-box; }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--font-sans); }
  header.top { position: sticky; top: 0; z-index: 5; background: var(--surface); border-bottom: 1px solid var(--border); padding: 12px 24px; display: flex; flex-wrap: wrap; gap: 8px 24px; align-items: center; }
  header.top h1 { font-size: 18px; margin: 0; }
  header.top nav a { color: var(--text-muted); text-decoration: none; margin-right: 14px; font-size: 13px; }
  header.top nav a:hover { color: var(--primary); }
  main { max-width: 1400px; margin: 0 auto; padding: 20px 24px 60px; display: grid; gap: 18px; }
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 18px 20px; min-width: 0; }
  h2 { font-size: 16px; margin: 0 0 12px; }
  h3 { font-size: 14px; margin: 0; }
  code, pre { font-family: var(--font-mono); font-size: 12px; }
  pre { white-space: pre-wrap; word-break: break-all; background: var(--bg); padding: 10px; border-radius: 6px; border: 1px solid var(--border); }
  .muted, .note { color: var(--text-muted); }
  .note { font-size: 12.5px; margin: 0 0 10px; }
  .banner { border-left: 3px solid var(--primary); background: var(--surface-2); padding: 10px 14px; border-radius: 6px; font-size: 13px; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
  .kpi b { display: block; font-size: 22px; font-family: var(--font-mono); }
  .kpi span { color: var(--text-muted); font-size: 12px; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0; }
  .kv dt { color: var(--text-muted); }
  .kv dd { margin: 0; font-family: var(--font-mono); font-size: 12.5px; word-break: break-word; }
  .finding { border: 1px solid var(--border); border-left: 4px solid var(--sev-info); border-radius: 6px; padding: 12px 14px; margin-bottom: 10px; background: var(--surface-2); }
  .finding.sev-high { border-left-color: var(--sev-high); }
  .finding.sev-medium { border-left-color: var(--sev-medium); }
  .finding header { display: flex; gap: 10px; align-items: center; }
  .finding p { margin: 6px 0; }
  .finding ul { margin: 6px 0; padding-left: 18px; }
  .sev { text-transform: uppercase; font: 700 10.5px var(--font-mono); letter-spacing: .06em; padding: 2px 6px; border-radius: 4px; background: var(--sev-info); color: var(--bg); }
  .sev-high .sev { background: var(--sev-high); }
  .sev-medium .sev { background: var(--sev-medium); }
  .team { font-size: 13px; }
  .stack { display: flex; height: 18px; border-radius: 4px; overflow: hidden; background: var(--bg); }
  .legend { list-style: none; padding: 0; margin: 10px 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  ${SEGMENTS.map(k => `.seg-${k} { background: var(--seg-${k}); }`).join("\n  ")}
  .seg { display: block; height: 100%; min-width: 1px; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  thead th { color: var(--text-muted); font-weight: 600; white-space: nowrap; }
  .chip { display: inline-block; padding: 1px 7px; border-radius: 10px; font-size: 11.5px; border: 1px solid currentColor; white-space: nowrap; }
  .lvl-best { color: var(--best); } .lvl-better { color: var(--better); } .lvl-good { color: var(--good); } .lvl-poor { color: var(--poor); } .lvl-unknown { color: var(--unknown); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: currentColor; }
  .wf { font-size: 12px; }
  .wf-row, .wf-axis { border-bottom: 1px solid var(--border); }
  .wf-row > summary, .wf-axis { display: grid; grid-template-columns: minmax(180px, 34%) 70px 58px 1fr 70px; gap: 8px; align-items: center; padding: 4px 0; cursor: pointer; list-style: none; }
  .wf-row > summary::-webkit-details-marker { display: none; }
  .wf-row > summary:hover { background: var(--surface-2); }
  .wf-row.is-failed .wf-status { color: var(--poor); font-weight: 700; }
  .wf-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--font-mono); }
  .wf-host { color: var(--text); }
  .wf-path { color: var(--text-muted); }
  .method { color: var(--primary); }
  .wf-status, .wf-proto, .wf-time { font-family: var(--font-mono); color: var(--text-muted); }
  .wf-time { text-align: right; }
  .wf-track { position: relative; height: 14px; background: var(--bg); border-radius: 3px; }
  .wf-bar { position: absolute; top: 2px; bottom: 2px; display: flex; background: var(--border); border-radius: 2px; overflow: hidden; }
  .ticks span { position: absolute; top: 0; transform: translateX(-50%); font-size: 10.5px; color: var(--text-muted); white-space: nowrap; }
  .ticks span:first-child { transform: none; } .ticks span:last-child { transform: translateX(-100%); }
  .detail { padding: 10px 0 14px; }
  .detail-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
  .mini th { color: var(--text-muted); font-weight: 500; width: 150px; }
  .wrap { word-break: break-all; }
  details.more summary { cursor: pointer; color: var(--primary); font-size: 12.5px; margin-top: 8px; }
  .seq-tools { display: flex; gap: 8px; margin-bottom: 8px; }
  button { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; cursor: pointer; font: 13px var(--font-sans); }
  button:hover { border-color: var(--primary); }
  .seq-wrap { overflow: auto; max-height: 80vh; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
  .seq-wrap svg { display: block; }
  textarea { width: 100%; min-height: 260px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 10px; font: 12px var(--font-mono); }
  footer { color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px; }
  @media (max-width: 800px) { .detail-grid { grid-template-columns: 1fr; } .wf-row > summary, .wf-axis { grid-template-columns: 1fr 60px 70px; } .wf-proto, .wf-track { display: none; } }
</style>
</head>
<body>
<header class="top">
  <h1>SocketMap Report</h1>
  <nav>
    <a href="#findings">Findings</a><a href="#hosts">Hosts</a><a href="#waterfall">Waterfall</a><a href="#sequence">Sequence</a><a href="#environment">Environment</a><a href="#ai-summary">AI summary</a>
  </nav>
</header>
<main>
  <div class="card">
    <h2>${esc(page.url)}</h2>
    <p class="banner">This report contains IP addresses, full URLs, and request/response headers from the capture. Passwords, cookies, auth headers, and tokens were removed before it was written.</p>
  </div>
  <div class="kpis">
    <div class="kpi"><b>${esc(formatDuration(page.loadMs))}</b><span>First request to last response</span></div>
    <div class="kpi"><b>${page.requestCount}</b><span>Requests</span></div>
    <div class="kpi"><b>${page.hostCount}</b><span>Hosts</span></div>
    <div class="kpi"><b>${esc(formatBytes(page.bytesWire) || "0 B")}</b><span>Transferred</span></div>
    <div class="kpi"><b>${analysis.findings.length}</b><span>Findings (${high} high)</span></div>
  </div>
  ${renderFindings(analysis.findings)}
  ${renderBreakdown(analysis.breakdown)}
  ${renderHosts(analysis.hosts)}
  ${renderWaterfall(analysis, connections)}
  <section id="sequence" class="card">
    <h2>Sequence diagram</h2>
    <p class="note">One lifeline per host (the first ${MAX_SEQUENCE_HOSTS} contacted; the rest are grouped). Connection setup appears only where a new connection was opened.${page.requestCount > MAX_SEQUENCE_REQUESTS ? ` Showing the first ${MAX_SEQUENCE_REQUESTS} of ${page.requestCount} requests; the waterfall lists all of them.` : ""}</p>
    <div class="seq-tools"><button type="button" data-zoom="0.8">Zoom out</button><button type="button" data-zoom="1.25">Zoom in</button><button type="button" data-zoom="reset">Reset</button></div>
    <div class="seq-wrap">${svg}</div>
  </section>
  ${renderEnvironment(model.environment)}
  <section id="other" class="card">
    <h2>Other activity in this capture</h2>
    ${analysis.background.length ? `<p class="note">Traffic from other tabs, extensions, and the browser itself. Not included above. Re-run with <code>--page &lt;site&gt;</code> to analyze one of these.</p>
    <table><thead><tr><th>Site</th><th>Requests</th><th>Type</th></tr></thead><tbody>
      ${analysis.background.map(p => `<tr><td>${esc(p.site)}</td><td>${p.requestCount}</td><td>${p.isBackground ? "Browser / extension" : "Other page"}</td></tr>`).join("")}
    </tbody></table>` : "<p>None.</p>"}
  </section>
  <section id="ai-summary" class="card">
    <h2>AI summary</h2>
    <p class="note">Paste this into your AI assistant and ask what is slowing the page down and who should look at it.</p>
    <div class="seq-tools"><button type="button" id="copy-summary">Copy summary</button><span id="copy-status" class="muted"></span></div>
    <textarea id="summary-text" readonly>${esc(summary)}</textarea>
  </section>
</main>
<footer>Generated by SocketMap ${VERSION} from a Chrome NetLog capture. NetLog shows network activity only; it does not show page JavaScript/CPU time.</footer>
<script>
(function () {
  var svg = document.querySelector(".seq-wrap svg");
  var baseW = svg ? Number(svg.getAttribute("width")) : 0;
  var baseH = svg ? Number(svg.getAttribute("height")) : 0;
  var scale = 1;
  document.querySelectorAll("[data-zoom]").forEach(function (b) {
    b.addEventListener("click", function () {
      var z = b.getAttribute("data-zoom");
      scale = z === "reset" ? 1 : Math.min(3, Math.max(0.2, scale * Number(z)));
      if (svg) { svg.setAttribute("width", baseW * scale); svg.setAttribute("height", baseH * scale); }
    });
  });
  var copy = document.getElementById("copy-summary");
  copy.addEventListener("click", function () {
    var text = document.getElementById("summary-text");
    var status = document.getElementById("copy-status");
    function done() { status.textContent = "Copied"; setTimeout(function () { status.textContent = ""; }, 2000); }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text.value).then(done, function () { text.select(); document.execCommand("copy"); done(); });
    } else { text.select(); document.execCommand("copy"); done(); }
  });
})();
</script>
</body>
</html>
`;
}
