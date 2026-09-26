/**
 * SocketMap troubleshooting report: one self-contained HTML file.
 *
 * Sections: environment, findings, where the time went, host ratings, request
 * waterfall, sequence diagram (click any arrow or bar for a plain-language
 * explanation), other activity, AI-ready summary, and a learn section. No remote
 * resources; colors live in CSS variables so a DESIGN.md theme can replace them.
 */

import { buildTraceSvg } from "./svg-builder.mjs";
import { normalizeTrace, formatDuration, formatBytes } from "../normalizer.mjs";
import { TIMING_LABELS, buildAiSummary } from "../analysis.mjs";
import { explainConnection, explainRequest, explainResponse, explainHost, plainSummary, MEASURE_HELP, RATING_WORDS } from "../explain.mjs";
import { renderLearn } from "./learn.mjs";

const VERSION = "0.4.0";
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
        <thead><tr><th>Host</th><th>Server IP</th><th>Req</th><th title="${esc(MEASURE_HELP.protocol.meaning)}">Protocol</th><th title="${esc(MEASURE_HELP.tls.meaning)}">TLS</th><th>Certificate issuer</th><th title="${esc(MEASURE_HELP.connection.meaning)}">Connection</th><th title="${esc(MEASURE_HELP.dns.meaning)}">DNS</th><th title="${esc(MEASURE_HELP.path.meaning)}">Path</th><th title="${esc(MEASURE_HELP.server.meaning)}">Server wait</th></tr></thead>
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
      <details class="more"><summary>What do these ratings mean?</summary>
        <dl class="glossary">${Object.values(MEASURE_HELP).map(m => `<dt>${esc(m.label)}</dt><dd>${esc(m.meaning)}</dd>`).join("")}
          <dt>Certificate issuer</dt><dd>Who vouched for the server's identity. A "private root" means a device in between (often a security proxy) replaced the real certificate: TLS inspection.</dd>
        </dl>
      </details>
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
      <p class="plain">${esc(plainSummary(r))}</p>
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
      <details class="wf-row${failed || r.status >= 400 ? " is-failed" : ""}" id="req-${r.id}">
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

/**
 * Sequence diagram of the page load: one lifeline per host, only values from the capture.
 * Returns the diagram trace plus a plain-language explanation for every arrow and card.
 */
export function buildSequenceTrace(analysis, connections, environment = null) {
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
      const name = h.replace(/^www\./, "");
      return { id: `h${i}`, label: name.length > 24 ? `${name.slice(0, 21)}...` : name, sublabel: ips[0] || "IP not recorded", role: "gateway" };
    })
  ];
  if (hidden > 0) participants.push({ id: "other", label: `Other hosts (${hidden})`, sublabel: "See waterfall", role: "service" });

  const explanations = {};
  const hostRatings = new Map(analysis.hosts.map(h => [h.host, h]));
  explanations["card-browser"] = {
    title: "Browser (this computer)",
    tone: "info",
    verdict: "Every request starts here.",
    plain: "This column is the web browser on the computer where the capture was taken. Solid arrows leaving it are requests; dashed arrows coming back are answers.",
    steps: [],
    facts: [["Local IP address", environment?.localAddresses?.join(", ") || "not recorded"], ["Browser", environment?.browser || "not recorded"]]
  };
  shown.forEach((h, i) => { if (hostRatings.has(h)) explanations[`card-h${i}`] = explainHost(hostRatings.get(h)); });
  if (hidden > 0) {
    explanations["card-other"] = {
      title: `Other hosts (${hidden})`, tone: "info", verdict: "Grouped to keep the diagram readable.",
      plain: `The page also talked to ${order.slice(MAX_SEQUENCE_HOSTS).join(", ")}. They share this column; the waterfall and the hosts table list each one separately.`,
      steps: [], facts: []
    };
  }

  const messages = [];
  const addMessage = (msg, explanation) => {
    const id = `seq-${messages.length + 1}`;
    messages.push({ id, ...msg });
    explanations[id] = explanation;
  };
  for (const r of pageRequests) {
    const to = idOf(r.host);
    const conn = connections.get(r.connectionId);
    if (conn && r.reusedConnection === false) {
      const setup = (conn.connectMs || 0) + (conn.tlsMs || 0);
      addMessage({
        from: "browser", to,
        label: `${conn.kind === "quic" ? "QUIC handshake" : "TCP + TLS"}${conn.cert?.knownRoot === false ? ", private root" : ""}`,
        kind: conn.cert?.knownRoot === false || conn.error ? "security" : "async",
        latencyMs: setup, isBlocking: false
      }, explainConnection(r, conn));
    }
    const path = pathOf(r.url);
    addMessage({
      from: "browser", to,
      label: `${r.method || ""} ${path.length > 34 ? `${path.slice(0, 31)}...` : path}`,
      kind: "request", method: r.method, latencyMs: r.timing.send, isBlocking: false
    }, explainRequest(r, conn));
    addMessage({
      from: to, to: "browser",
      label: `${r.netError || r.status || (r.fromCache ? "cache" : "no response")}`,
      kind: r.netError && r.netError !== "ERR_ABORTED" ? "security" : "return",
      status: r.status ?? undefined, bytes: r.bytesWire ?? undefined, latencyMs: r.timing.wait, isBlocking: false
    }, explainResponse(r, conn));
  }
  const trace = normalizeTrace({
    title: `Page load: ${page.site.replace(/^https?:\/\//, "")}`,
    phases: [`${page.requestCount} requests, ${formatDuration(page.loadMs)}`],
    participants,
    messages
  });
  return { trace, explanations };
}

function renderHowToRead() {
  const line = (color, dash) => `<svg width="46" height="12" aria-hidden="true"><line x1="2" y1="6" x2="40" y2="6" stroke="${color}" stroke-width="2" ${dash ? `stroke-dasharray="${dash}"` : ""}/><path d="M 38 2 L 45 6 L 38 10 z" fill="${color}"/></svg>`;
  return `
    <div class="how-to">
      <h3 class="sub">How to read this diagram</h3>
      <p>Each column is one participant: your <strong>browser</strong> on the left, and every <strong>server</strong> the page talked to. Time runs from top to bottom. Each arrow is one message between them.</p>
      <ul class="how-legend">
        <li>${line("var(--seg-dns)", "6 4")}<span><strong>Opening a connection.</strong> The browser connects to a server and sets up encryption. Happens once per server.</span></li>
        <li>${line("var(--primary)")}<span><strong>Request.</strong> The browser asks the server for something: the page, a script, an image, data.</span></li>
        <li>${line("var(--text-muted)", "6 4")}<span><strong>Answer.</strong> The server sends back a status (200 means OK) and the content.</span></li>
        <li>${line("var(--poor)")}<span><strong>Problem.</strong> A failed request, or a connection whose certificate points to TLS inspection.</span></li>
      </ul>
      <p>The number in brackets is how long that step took (ms = milliseconds; 1,000 ms is one second). The rounded bars show which two sides are busy with each message. <strong>Click any arrow, bar, or column heading</strong> for a plain-language explanation.</p>
    </div>`;
}

export function renderReportHtml(model, analysis) {
  const connections = new Map(model.connections.map(c => [c.id, c]));
  const { page } = analysis;
  const high = analysis.findings.filter(f => f.severity === "high").length;
  const sequence = buildSequenceTrace(analysis, connections, model.environment);
  const svg = buildTraceSvg(sequence.trace);
  const explanationsJson = JSON.stringify(sequence.explanations).replace(/</g, "\\u003c");
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
  .wrap { overflow-wrap: anywhere; }
  details.more summary { cursor: pointer; color: var(--primary); font-size: 12.5px; margin-top: 8px; }
  .seq-tools { display: flex; gap: 8px; margin-bottom: 8px; }
  button { background: var(--surface-2); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 5px 12px; cursor: pointer; font: 13px var(--font-sans); }
  button:hover { border-color: var(--primary); }
  .seq-wrap { overflow: auto; max-height: 80vh; border: 1px solid var(--border); border-radius: 6px; background: var(--bg); }
  .seq-wrap svg { display: block; }
  .seq-sticky { position: sticky; top: 0; height: 0; z-index: 2; width: max-content; }
  .seq-sticky svg { box-shadow: 0 6px 12px rgba(0, 0, 0, 0.5); }
  .seq-sticky.is-hidden { visibility: hidden; }
  .seq-wrap .trace-legend, .seq-wrap .status-badge { display: none; }
  .seq-wrap .message-route, .seq-wrap .activation-bar, .seq-wrap .participant-card { cursor: pointer; }
  .seq-wrap .message-route:hover .route-line, .seq-wrap .message-route.is-selected .route-line, .seq-wrap .message-route:focus-visible .route-line { stroke-width: 4; }
  .seq-wrap .message-route.is-selected .route-label-text { fill: var(--primary); }
  .seq-wrap .message-route:focus { outline: none; }
  .how-to { background: var(--surface-2); border-radius: 6px; padding: 12px 14px; margin-bottom: 12px; }
  .how-to p { margin: 6px 0; }
  .how-legend { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 6px; }
  .how-legend li { display: flex; gap: 10px; align-items: center; }
  .how-legend svg { flex: none; }
  .sub { font-size: 14px; margin: 16px 0 8px; }
  .plain { background: var(--surface-2); padding: 8px 10px; border-radius: 6px; margin: 0 0 10px; }
  .explain { position: fixed; top: 0; right: 0; bottom: 0; width: min(460px, 100vw); background: var(--surface); border-left: 1px solid var(--border); z-index: 20; overflow-y: auto; padding: 18px 20px 40px; box-shadow: -8px 0 24px rgba(0, 0, 0, 0.5); }
  .explain[hidden] { display: none; }
  .explain:focus { outline: none; }
  .explain .close { float: right; }
  .explain h3 { font-size: 16px; margin: 0 80px 10px 0; }
  .explain p { margin: 8px 0; }
  .verdict { padding: 8px 10px; border-radius: 6px; border-left: 4px solid var(--unknown); background: var(--surface-2); font-weight: 600; }
  .tone-good { border-left-color: var(--best); } .tone-warn { border-left-color: var(--good); } .tone-bad { border-left-color: var(--poor); } .tone-info { border-left-color: var(--primary); }
  .insight { border: 1px dashed var(--border); border-radius: 6px; padding: 8px 10px; }
  .meaning { color: var(--text-muted); font-size: 12px; font-weight: 400; }
  .explain a { color: var(--primary); }
  .steps li { margin: 4px 0; }
  .learn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 4px 28px; }
  .links { list-style: none; padding: 0; margin: 0; }
  .links li { margin: 0 0 10px; }
  .links a { color: var(--primary); font-weight: 600; }
  .links span { display: block; color: var(--text-muted); font-size: 12.5px; }
  .glossary { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 8px 0; }
  .glossary dt { font-weight: 600; }
  .glossary dd { margin: 0; color: var(--text-muted); }
  textarea { width: 100%; min-height: 260px; background: var(--bg); color: var(--text); border: 1px solid var(--border); border-radius: 6px; padding: 10px; font: 12px var(--font-mono); }
  footer { color: var(--text-muted); font-size: 12px; text-align: center; padding: 10px; }
  @media (max-width: 800px) { .glossary { grid-template-columns: 1fr; } .glossary dd { margin-bottom: 6px; } .detail-grid { grid-template-columns: 1fr; } .wf-row > summary, .wf-axis { grid-template-columns: 1fr 60px 70px; } .wf-proto, .wf-track { display: none; } }
</style>
</head>
<body>
<header class="top">
  <h1>SocketMap Report</h1>
  <nav>
    <a href="#findings">Findings</a><a href="#hosts">Hosts</a><a href="#waterfall">Waterfall</a><a href="#sequence">Sequence</a><a href="#environment">Environment</a><a href="#ai-summary">AI summary</a><a href="#learn">Learn</a>
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
    ${renderHowToRead()}
    <div class="seq-tools"><button type="button" data-zoom="0.8">Zoom out</button><button type="button" data-zoom="1.25">Zoom in</button><button type="button" data-zoom="reset">Reset</button></div>
    <div class="seq-wrap">${svg}</div>
    <script type="application/json" id="seq-explain">${explanationsJson}</script>
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
  ${renderLearn()}
</main>
<aside id="explain" class="explain" hidden tabindex="-1" aria-live="polite" aria-label="Explanation">
  <button type="button" class="close" id="explain-close" aria-label="Close explanation">Close</button>
  <div class="explain-body"></div>
</aside>
<footer>Generated by SocketMap ${VERSION} from a Chrome NetLog capture. NetLog shows network activity only; it does not show page JavaScript/CPU time.</footer>
<script>
(function () {
  var wrap = document.querySelector(".seq-wrap");
  var svg = wrap && wrap.querySelector("svg");
  var baseW = svg ? Number(svg.getAttribute("width")) : 0;
  var baseH = svg ? Number(svg.getAttribute("height")) : 0;
  var scale = 1;

  // Floating host header: a copy of the participant cards pinned to the top of the
  // diagram once the real cards scroll out of view, so each lifeline stays labeled.
  var sticky = null, strip = null, bandTop = 0, bandH = 0;
  var cards = svg ? svg.querySelectorAll(".participant-card") : [];
  if (cards.length) {
    var first = cards[0];
    var cardTop = first.transform.baseVal.consolidate().matrix.f;
    bandTop = cardTop - 12;
    bandH = first.getBBox().height + 24;
    var ns = "http://www.w3.org/2000/svg";
    strip = document.createElementNS(ns, "svg");
    strip.setAttribute("viewBox", "0 " + bandTop + " " + baseW + " " + bandH);
    var defs = svg.querySelector("defs");
    if (defs) strip.appendChild(defs.cloneNode(true));
    var bg = document.createElementNS(ns, "rect");
    bg.setAttribute("x", 0); bg.setAttribute("y", bandTop);
    bg.setAttribute("width", baseW); bg.setAttribute("height", bandH);
    bg.setAttribute("fill", getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#070b12");
    strip.appendChild(bg);
    cards.forEach(function (c) { strip.appendChild(c.cloneNode(true)); });
    sticky = document.createElement("div");
    sticky.className = "seq-sticky is-hidden";
    sticky.appendChild(strip);
    wrap.insertBefore(sticky, svg);
  }
  function sizeStrip() {
    if (!strip) return;
    strip.setAttribute("width", baseW * scale);
    strip.setAttribute("height", bandH * scale);
  }
  function updateSticky() {
    if (!sticky) return;
    var headerBottom = (bandTop + bandH - 12) * scale;
    sticky.classList.toggle("is-hidden", wrap.scrollTop < headerBottom);
  }
  sizeStrip();
  if (wrap) wrap.addEventListener("scroll", updateSticky, { passive: true });

  document.querySelectorAll("[data-zoom]").forEach(function (b) {
    b.addEventListener("click", function () {
      var z = b.getAttribute("data-zoom");
      scale = z === "reset" ? 1 : Math.min(3, Math.max(0.2, scale * Number(z)));
      if (svg) { svg.setAttribute("width", baseW * scale); svg.setAttribute("height", baseH * scale); }
      sizeStrip();
      updateSticky();
    });
  });
  // Plain-language explanations: click any arrow, activity bar, or column heading.
  var EXPLAIN = JSON.parse(document.getElementById("seq-explain").textContent || "{}");
  var panel = document.getElementById("explain");
  var panelBody = panel.querySelector(".explain-body");
  var selected = null;
  var routes = null;
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
  function routeIndex() {
    if (routes) return routes;
    routes = Array.prototype.map.call(svg.querySelectorAll(".message-route"), function (g) {
      var b = g.querySelector(".route-line").getBBox();
      return { el: g, y: b.y + b.height / 2, from: g.getAttribute("data-from"), to: g.getAttribute("data-to") };
    });
    return routes;
  }
  function show(key, routeEl) {
    var e = EXPLAIN[key];
    if (!e) return;
    if (selected) selected.classList.remove("is-selected");
    selected = routeEl || null;
    if (selected) selected.classList.add("is-selected");
    var html = "<h3>" + esc(e.title) + "</h3>";
    html += '<p class="verdict tone-' + esc(e.tone) + '">' + esc(e.verdict) + "</p>";
    html += "<p>" + esc(e.plain) + "</p>";
    if (e.insight) html += '<p class="insight">' + esc(e.insight) + "</p>";
    if (e.steps && e.steps.length) {
      html += '<h4 class="sub">' + esc(e.stepsTitle || "Step by step") + '</h4><table class="mini"><tbody>';
      e.steps.forEach(function (s) { html += "<tr><th>" + esc(s.label) + "</th><td><strong>" + esc(s.value) + '</strong><div class="meaning">' + esc(s.meaning) + "</div></td></tr>"; });
      html += "</tbody></table>";
    }
    if (e.facts && e.facts.length) {
      html += '<details class="more" open><summary>Technical details</summary><table class="mini"><tbody>';
      e.facts.forEach(function (f) { html += "<tr><th>" + esc(f[0]) + '</th><td class="wrap">' + esc(f[1]) + "</td></tr>"; });
      html += "</tbody></table></details>";
    }
    if (e.requestId != null) html += '<p><a href="#req-' + esc(e.requestId) + '" data-open-req="' + esc(e.requestId) + '">Show this request in the waterfall</a></p>';
    panelBody.innerHTML = html;
    panel.hidden = false;
    panel.scrollTop = 0;
  }
  function hide() { panel.hidden = true; if (selected) selected.classList.remove("is-selected"); selected = null; }
  function activate(target) {
    var route = target.closest(".message-route");
    if (route) return show(route.id, route);
    var card = target.closest(".participant-card");
    if (card) return show("card-" + card.getAttribute("data-id"), null);
    var bar = target.closest(".activation-bar");
    if (bar) {
      var y = bar.y.baseVal.value + bar.height.baseVal.value / 2;
      var pid = bar.getAttribute("data-participant");
      var best = null;
      routeIndex().forEach(function (r) {
        if (r.from !== pid && r.to !== pid) return;
        if (!best || Math.abs(r.y - y) < Math.abs(best.y - y)) best = r;
      });
      if (best && Math.abs(best.y - y) < 40) show(best.el.id, best.el);
    }
  }
  if (wrap) {
    wrap.addEventListener("click", function (ev) { activate(ev.target); });
    wrap.addEventListener("keydown", function (ev) {
      if ((ev.key === "Enter" || ev.key === " ") && ev.target.closest && ev.target.closest(".message-route, .participant-card")) { ev.preventDefault(); activate(ev.target); }
    });
    Array.prototype.forEach.call(wrap.querySelectorAll(".message-route, .participant-card"), function (el) {
      el.setAttribute("tabindex", "0");
      el.setAttribute("role", "button");
    });
  }
  document.getElementById("explain-close").addEventListener("click", hide);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && !panel.hidden) hide(); });
  panel.addEventListener("click", function (ev) {
    var link = ev.target.closest("[data-open-req]");
    if (!link) return;
    ev.preventDefault();
    var row = document.getElementById("req-" + link.getAttribute("data-open-req"));
    if (row) { row.open = true; row.scrollIntoView({ block: "center" }); }
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
