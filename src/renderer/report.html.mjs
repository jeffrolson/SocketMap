/**
 * SocketMap troubleshooting report: one self-contained HTML file.
 *
 * Layout: sidebar views (Overview, Waterfall, Sequence, Environment, AI summary,
 * Learn), a top bar with the capture and a shared filter, and a status bar. The
 * sequence view has a sticky host header and a docked inspector that explains
 * any row or column in plain language. No remote
 * resources; colors live in CSS variables so a DESIGN.md theme can replace them.
 */

import { formatDuration, formatBytes } from "../normalizer.mjs";
import { TIMING_LABELS, THRESHOLDS, buildAiSummary } from "../analysis.mjs";
import { explainConnection, explainHost, explainTransaction, plainSummary, MEASURE_HELP, PROTOCOL_INFO, protocolTip, resultTip, methodTip, sequenceTip, TIMING_MEANINGS, TAG_TIPS, RATING_WORDS } from "../explain.mjs";
import { renderLearn } from "./learn.mjs";
import { themeCss, themeModeCss, themePreferenceScript } from "../theme.mjs";
import { DEFAULT_THEME } from "./theme.generated.mjs";
import { renderDiagnostics, diagnosticsCss, diagnosticsScript } from "./diagnostics.mjs";
import { buildCoverage } from "../coverage.mjs";
import { renderCoverage, coverageCss } from "./coverage.mjs";
import { buildServerInsights } from "../server-insights.mjs";
import { renderEnrichmentPanel, renderRequestSource, renderMilestones, enrichmentCss, typeClass } from "./enrichment.mjs";
import { renderProfilePanel, renderMainThreadBand, renderProfileSource, profileCss } from "./profile.mjs";
import { renderPolicyView, policyScript, policyCss } from "./policy.mjs";
import { buildPolicyEvidence } from "../policy/engine.mjs";
import { renderServerInsights, renderServerDetail, renderServerMark, serverInsightsCss } from "./server-insights.mjs";
import { eventReplayMarkup, eventReplayScript } from "../viewer/event-replay.mjs";

const VERSION = "0.11.0";
const SEGMENTS = ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled", "send", "wait", "download"];
const MAX_SEQUENCE_HOSTS = 8;
const MAX_SEQUENCE_REQUESTS = 1000; // display limit for the sequence view only; the waterfall shows every request

function esc(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

const ms = (v) => (v == null ? "not recorded" : formatDuration(v));

function pathOf(url) {
  try {
    const u = new URL(url);
    return u.pathname + u.search;
  } catch {
    return url || "";
  }
}

function chip(r, tip) {
  return `<span class="chip lvl-${esc(r.level)}" data-tip="${esc(tip || `Rating: ${RATING_WORDS[r.level] || r.level}`)}">${esc(r.value)}</span>`;
}

function protocolsTip(value) {
  const found = Object.keys(PROTOCOL_INFO).filter(k => new RegExp(`(^|[\\s,])${k.replace(/[./]/g, "\\$&")}(\\s|,|$)`).test(value));
  return found.map(protocolTip).join(" ");
}

/** Collapsible comparison of HTTP/1.1, HTTP/2, and HTTP/3, with counts for this page. */
function renderProtocolGuide(pageRequests) {
  const counts = {};
  for (const r of pageRequests) if (r.protocol) counts[r.protocol] = (counts[r.protocol] || 0) + 1;
  const used = Object.entries(counts).sort((a, b) => b[1] - a[1])
    .map(([p, n]) => `${PROTOCOL_INFO[p]?.label || p} for ${n} request${n === 1 ? "" : "s"}`).join(", ");
  const rows = ["h3", "h2", "http/1.1"].map(k => PROTOCOL_INFO[k]).map(p => `
          <tr><th><span class="tag tone-proto">${esc(p.label)}</span> ${esc(p.name)}</th>
            <td>${esc(p.short)}</td><td>${esc(p.transport)}</td><td>${esc(p.parallel)}</td><td>${esc(p.setup)}</td>
            <td><span class="chip lvl-${p.rating}">${esc(RATING_WORDS[p.rating])}</span></td><td>${esc(p.watch)}</td></tr>`).join("");
  return `
    <details class="proto-guide">
      <summary>What do H3, H2, and HTTP/1.1 mean?</summary>
      <p class="note">They are versions of the web protocol the browser and server agreed on. Newer versions can handle busy pages more efficiently; the capture shows which version was used. ${used ? `This page used ${esc(used)}.` : ""}</p>
      <div class="table-wrap"><table>
        <thead><tr><th>Protocol</th><th>In plain words</th><th>Runs over</th><th>Requests at once</th><th>Opening a new connection</th><th>Rating</th><th>Watch for</th></tr></thead>
        <tbody>${rows}</tbody>
      </table></div>
      <p class="note">The chosen version depends on browser and server support, configuration, and the network path. Seeing H2 or HTTP/1.1 alone does not prove that QUIC was blocked; look for a recorded failed QUIC attempt before investigating fallback.</p>
    </details>`;
}

function renderEnvironment(env) {
  const list = values => values?.length ? values.join(", ") : null;
  const yesNo = value => value == null ? null : value ? "Yes" : "No";
  const groups = [
    ["Browser and capture", [
      ["Browser", env.browser],
      ["Version", env.browserInfo?.version],
      ["Release channel", env.browserInfo?.channel],
      ["Build / revision", env.browserInfo?.build],
      ["Build type", typeof env.browserInfo?.official === "boolean" ? (env.browserInfo.official ? "Official" : "Unofficial") : env.browserInfo?.official],
      ["Operating system", env.os],
      ["Capture started", env.captureStartedAt],
      ["Capture length", env.captureDurationMs == null ? null : ms(env.captureDurationMs)],
      ["Capture mode", env.captureMode],
      ["Environment snapshot included", yesNo(env.polledDataPresent)],
      ["Local IP addresses", list(env.localAddresses)]
    ]],
    ["DNS: how names become addresses", [
      ["DNS servers", list(env.dns.serverAddresses?.length ? env.dns.serverAddresses : env.dns.servers)],
      ["DNS search domains", list(env.dns.search)],
      ["Secure DNS mode", env.dns.secureDns],
      ["DNS-over-HTTPS endpoints", list(env.dns.dohServers)],
      ["Resolver timeout", env.dns.timeoutSeconds == null ? null : `${env.dns.timeoutSeconds} seconds`],
      ["Resolver attempts", env.dns.attempts],
      ["Rotate DNS servers", yesNo(env.dns.rotate)],
      ["Hosts-file entries recorded", yesNo(env.dns.hostsPresent)]
    ]],
    ["Proxy: how traffic is routed", [
      ["Proxy setup", env.proxy.mode === "unknown" ? null : `${env.proxy.mode}${env.proxy.detail ? `: ${env.proxy.detail}` : ""}`],
      ["PAC script address", env.proxy.pacUrl],
      ["Automatic proxy discovery (WPAD)", yesNo(env.proxy.autoDetect)],
      ["Fixed proxy servers", list(env.proxy.fixedServers)],
      ["Proxies marked bad", list(env.proxy.badProxies.map(p => typeof p === "string" ? p : p.proxyUri).filter(Boolean))]
    ]]
  ];
  return `
    <section id="environment" class="card">
      <h2>Environment</h2>
      <p class="note">Settings recorded by the browser when this capture was made. Available fields vary by browser version and capture; missing values are shown as not recorded.</p>
      ${groups.map(([title, rows]) => `<h3 class="sub">${esc(title)}</h3><dl class="kv">${rows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${esc(v ?? "Not recorded")}</dd>`).join("")}</dl>`).join("")}
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
            <td><code>${esc(h.ips.join(", ") || "not recorded")}</code></td>
            <td>${h.requests}</td>
            <td>${chip(h.ratings.protocol, protocolsTip(h.ratings.protocol.value))}</td>
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
          <dt>Certificate issuer</dt><dd>Who vouched for the server's identity. A private root can come from company-managed certificates or TLS inspection. The root alone does not prove interception or explain a delay.</dd>
        </dl>
      </details>
    </section>`;
}

function renderRequestDetail(r, conn, serverInfo = null, harEntry = null, profileEntry = null) {
  const timing = SEGMENTS.map(k => `<tr><th>${esc(TIMING_LABELS[k])}</th><td>${esc(ms(r.timing[k]))}</td></tr>`).join("");
  const connRows = conn ? [
    ["Connection", `${conn.kind.toUpperCase()} ${r.reusedConnection ? "(reused)" : r.reusedConnection === false ? "(new)" : ""}`],
    ["Server", `${conn.remoteIp ?? "not recorded"}${conn.remotePort ? `:${conn.remotePort}` : ""}`],
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
          <tr><th>Result</th><td>${esc(r.netError || (r.status != null ? `${r.status} ${r.statusText || ""}` : r.fromCache ? "cache" : "not recorded"))}</td></tr>
          <tr><th>Protocol</th><td>${esc(r.protocol || "not recorded")}</td></tr>
          <tr><th>Proxy</th><td>${esc(r.proxy || "not recorded")}</td></tr>
          <tr><th>Size</th><td>${esc(formatBytes(r.bytesWire) || "not recorded")} on the wire${r.bytesDecoded ? `, ${esc(formatBytes(r.bytesDecoded))} decoded` : ""}</td></tr>
          ${r.redirects.length ? `<tr><th>Redirected to</th><td class="wrap">${r.redirects.map(esc).join("<br>")}</td></tr>` : ""}
          ${connRows.map(([k, v]) => `<tr><th>${esc(k)}</th><td class="wrap">${esc(v)}</td></tr>`).join("")}
        </tbody></table>
        <table class="mini"><tbody><tr><th>Total</th><td><strong>${esc(ms(r.durationMs))}</strong></td></tr>${timing}</tbody></table>
      </div>
      ${renderRequestSource(harEntry)}
      ${renderProfileSource(profileEntry)}
      ${renderServerDetail(serverInfo, r.timing.wait ?? null)}
      ${r.requestHeaders.length ? `<details class="more"><summary>Request headers</summary><pre>${esc(r.requestHeaders.join("\n"))}</pre></details>` : ""}
      ${r.responseHeaders.length ? `<details class="more"><summary>Response headers</summary><pre>${esc(r.responseHeaders.join("\n"))}</pre></details>` : ""}
    </div>`;
}

function renderWaterfall(analysis, connections, serverInsights, enrichment = null, profile = null) {
  const { page, pageRequests } = analysis;
  const span = Math.max(1, page.observedSpanMs ?? page.loadMs ?? 1);
  const pct = (v) => `${Math.max(0, v / span * 100).toFixed(3)}%`;
  const milestones = renderMilestones(enrichment, page, span, profile);
  const mainBand = renderMainThreadBand(profile, page, span);
  const ticks = [0, 0.25, 0.5, 0.75, 1].map(f => `<span style="left:${f * 100}%">${esc(formatDuration(f * span))}</span>`).join("");
  const rows = pageRequests.map(r => {
    const status = r.netError || r.status || (r.fromCache ? "cache" : "");
    const segs = SEGMENTS.filter(k => r.timing[k] > 0)
      .map(k => `<span class="seg seg-${k}" style="width:${(r.timing[k] / Math.max(1, r.observedDurationMs ?? r.durationMs ?? 1) * 100).toFixed(2)}%" title="${esc(TIMING_LABELS[k])}: ${esc(ms(r.timing[k]))}"></span>`).join("");
    const flags = requestFlags(r, connections.get(r.connectionId));
    return `
      <details class="wf-row${flags.map(f => ` flag-${f}`).join("")}" id="req-${r.id}" data-flags="${flags.join(" ")}" data-search="${esc(searchText(r))}">
        <summary>
          <span class="wf-label"><span class="method" tabindex="0" data-tip="${esc(methodTip(r.method))}">${esc(r.method || "Not recorded")}</span> ${enrichment?.perRequest.get(r.id)?.resourceType ? `<span class="wf-type ${typeClass(enrichment.perRequest.get(r.id).resourceType)}">${esc(enrichment.perRequest.get(r.id).resourceType)}</span>` : ""}<span class="wf-host" title="${esc(r.url)}">${esc(r.host)}</span><span class="wf-path" title="${esc(r.url)}">${esc(pathOf(r.url))}</span></span>
          <span class="wf-status" data-tip="${esc(resultTip(r))}">${esc(status)}</span>
          <span class="wf-proto"${r.protocol ? ` data-tip="${esc(protocolTip(r.protocol))}"` : ""}>${esc(r.protocol || "")}</span>
          <span class="wf-track" title="${r.endRecorded === false ? "End not recorded. Bar extends only to the last observed capture event." : "Recorded request duration"}"><span class="wf-bar" style="left:${pct(r.start - page.startMs)};width:${pct(Math.max(r.observedDurationMs ?? r.durationMs ?? 0, span / 400))}">${segs}${renderServerMark(serverInsights.perRequest.get(r.id), r, SEGMENTS)}</span>${milestones.marks}</span>
          <span class="wf-time">${r.endRecorded === false ? "Unfinished" : esc(ms(r.durationMs))}</span>
        </summary>
        ${renderRequestDetail(r, connections.get(r.connectionId), serverInsights.perRequest.get(r.id), enrichment?.perRequest.get(r.id) ?? null, profile?.perRequest.get(r.id) ?? null)}
      </details>`;
  }).join("");
  return `
    <section id="waterfall" class="card">
      <h2>Request waterfall</h2>
      <p class="note">Every request for this page, in start order. Click a row for its timing, connection, certificate, and headers.</p>
      <div class="wf-key" aria-label="Timing color key">
        <span class="key-heading">Timing color key <span class="muted">· Hover or focus a phase to learn more</span></span>
        <ul class="legend">${SEGMENTS.map(k => `<li tabindex="0" data-tip="${esc(TIMING_MEANINGS[k])}"><span class="swatch seg-${k}" aria-hidden="true"></span>${esc(TIMING_LABELS[k])}</li>`).join("")}${milestones.drawn ? `<li tabindex="0" data-tip="Dashed vertical lines mark page milestones (${milestones.source === "profile" ? "first and largest contentful paint, DOMContentLoaded and load, from the Performance profile" : "DOMContentLoaded and load, from the HAR"}). They are the page's own events, not network events."><span class="swatch ms-swatch" aria-hidden="true"></span>Page milestones (${milestones.source === "profile" ? "profile" : "HAR"})</li>` : ""}${serverInsights.hasAnything ? `<li tabindex="0" data-tip="A thin line under the wait bar, as wide as the largest phase the server reported for itself (Server-Timing). It is the server's own figure and may overlap other phases."><span class="swatch srv-swatch" aria-hidden="true"></span>Server-reported time</li>` : ""}</ul>
      </div>
      ${renderProtocolGuide(pageRequests)}
      <div class="wf">
        <div class="wf-axis"><span class="wf-label"></span><span class="wf-status"></span><span class="wf-proto"></span><span class="wf-track ticks">${ticks}${milestones.labels}</span><span class="wf-time"></span></div>
        ${mainBand}${rows}
      </div>
    </section>`;
}

const ICONS = {
  logo: '<path d="M3 16l4-5 4 3 5-7 5 6"/>',
  overview: '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  waterfall: '<path d="M4 6h8M7 11h9M10 16h10"/>',
  sequence: '<path d="M5 4v16M19 4v16M5 8h12M13 5l3 3-3 3M19 15H7M10 12l-3 3 3 3"/>',
  policy: '<path d="M12 3l8 3v6c0 4.5-3.2 7.7-8 9-4.8-1.3-8-4.5-8-9V6z"/><path d="M9 12l2 2 4-4"/>',
  coverage: '<path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>',
  environment: '<rect x="3" y="4" width="18" height="12" rx="2"/><path d="M8 20h8M12 16v4"/>',
  ai: '<path d="M12 3l1.8 4.7 4.7 1.8-4.7 1.8L12 16l-1.8-4.7-4.7-1.8 4.7-1.8z"/><path d="M19 15l.8 2 2 .8-2 .8-.8 2-.8-2-2-.8 2-.8z"/>',
  learn: '<path d="M4 19V5a2 2 0 012-2h13v16H6a2 2 0 00-2 2z"/>',
  browser: '<rect x="4" y="5" width="16" height="10" rx="1.5"/><path d="M2 19h20"/>',
  server: '<rect x="4" y="4" width="16" height="6" rx="1.5"/><rect x="4" y="14" width="16" height="6" rx="1.5"/><path d="M8 7h.01M8 17h.01"/>',
  other: '<circle cx="6" cy="12" r="1.5"/><circle cx="12" cy="12" r="1.5"/><circle cx="18" cy="12" r="1.5"/>',
  search: '<circle cx="11" cy="11" r="6"/><path d="M20 20l-4.5-4.5"/>'
};

function icon(name, size = 16) {
  return `<svg class="icon" width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${ICONS[name]}</svg>`;
}

const PROTOCOL_LABELS = { h3: "H3", h2: "H2", "http/1.1": "HTTP/1.1" };

function isLocalRequest(r) {
  return r.host === "localhost" || r.host === "::1" || /^127\./.test(r.host || "") || ["loopback", "local", "private"].includes(r.addressSpace);
}

/** Problem flags shared by the waterfall and the sequence view: error, slow, inspected, local. */
export function requestFlags(r, conn) {
  const flags = [];
  if ((r.netError && r.netError !== "ERR_ABORTED") || r.status >= 400) flags.push("error");
  if ((r.timing.wait || 0) > THRESHOLDS.server.better || r.durationMs > THRESHOLDS.server.good) flags.push("slow");
  if (conn?.cert?.knownRoot === false) flags.push("inspected");
  if (isLocalRequest(r)) flags.push("local");
  return flags;
}

function searchText(r) {
  return [r.method, r.url, r.host, r.status, r.netError, r.protocol, PROTOCOL_LABELS[r.protocol]].filter(Boolean).join(" ").toLowerCase();
}

function offsetLabel(offset) {
  if (Math.abs(offset) < 1) return "+0ms";
  return offset < 0 ? `-${formatDuration(-offset)}` : `+${formatDuration(offset)}`;
}

/**
 * Sequence view of the page load: one column per host, one row per new connection
 * and per request. Every value comes from the capture; every row and column carries
 * a plain-language explanation for the inspector.
 */
export function buildSequenceView(analysis, connections, environment = null) {
  const { page } = analysis;
  const requests = analysis.pageRequests.slice(0, MAX_SEQUENCE_REQUESTS);
  const order = [...new Set(requests.map(r => r.host))];
  const shown = order.slice(0, MAX_SEQUENCE_HOSTS);
  const hidden = order.slice(MAX_SEQUENCE_HOSTS);
  const hostRatings = new Map(analysis.hosts.map(h => [h.host, h]));
  const explanations = {};

  const actors = [{ key: "card-browser", kind: "browser", label: "Browser", sub: environment?.localAddresses?.[0] || "This computer", title: "Browser (this computer)" }];
  explanations["card-browser"] = {
    title: "Browser (this computer)",
    tone: "info",
    verdict: "Every request starts here.",
    plain: "This column is the web browser on the computer where the capture was taken. Each row is one step: the browser opening a connection to a server, or asking a server for something and getting the answer.",
    steps: [],
    facts: [["Local IP address", environment?.localAddresses?.join(", ") || "not recorded"], ["Browser", environment?.browser || "not recorded"], ["Operating system", environment?.os || "not recorded"]]
  };
  shown.forEach((h, i) => {
    const rating = hostRatings.get(h);
    actors.push({ key: `card-h${i}`, kind: "host", label: h, sub: rating?.ips?.[0] || "IP not recorded", level: rating?.overall || "unknown", title: `${h}${rating?.ips?.length ? ` (${rating.ips.join(", ")})` : ""}` });
    if (rating) explanations[`card-h${i}`] = explainHost(rating);
  });
  if (hidden.length) {
    actors.push({ key: "card-other", kind: "other", label: `Other hosts (${hidden.length})`, sub: "See waterfall", title: hidden.join(", ") });
    explanations["card-other"] = {
      title: `Other hosts (${hidden.length})`, tone: "info", verdict: "Grouped to keep the view readable.",
      plain: `The page also talked to ${hidden.join(", ")}. They share this column; the waterfall and the hosts table list each one separately.`,
      steps: [], facts: []
    };
  }
  const column = (host) => (shown.includes(host) ? shown.indexOf(host) + 1 : actors.length - 1);

  const rows = [];
  const add = (row, explanation) => {
    const key = `seq-${rows.length + 1}`;
    rows.push({ key, ...row });
    explanations[key] = explanation;
  };
  for (const r of requests) {
    const conn = connections.get(r.connectionId);
    const to = column(r.host);
    if (conn && r.reusedConnection === false) {
      const setup = conn.connectMs == null && conn.tlsMs == null ? null : (conn.connectMs || 0) + (conn.tlsMs || 0);
      const t = THRESHOLDS.connection;
      const flags = [];
      if (conn.error) flags.push("error");
      if (conn.cert?.knownRoot === false) flags.push("inspected");
      if (setup > t.good) flags.push("slow");
      add({
        kind: "connect", to,
        offset: (conn.start ?? r.start) - page.startMs,
        label: conn.error ? "Connection failed" : conn.kind === "quic" ? "QUIC handshake" : conn.tlsVersion || conn.tlsMs != null ? "TCP + TLS handshake" : "TCP connection",
        tip: sequenceTip("connect", r, conn),
        chips: [
          { text: setup == null ? "Timing not recorded" : formatDuration(setup), tone: setup == null ? "plain" : setup > t.good ? "bad" : setup >= t.better ? "warn" : "good", tip: TAG_TIPS.setup },
          conn.tlsVersion ? { text: conn.tlsVersion, tone: "tls", tip: TAG_TIPS.tls } : null,
          conn.cert?.knownRoot === false ? { text: "Private root", tone: "bad", tip: TAG_TIPS.privateRoot } : null,
          conn.error ? { text: conn.error, tone: "bad", tip: resultTip({ netError: conn.error, timing: {} }) } : null
        ].filter(Boolean),
        flags,
        search: [r.host, conn.remoteIp, "connection handshake tls", conn.tlsVersion, conn.error].filter(Boolean).join(" ").toLowerCase()
      }, explainConnection(r, conn));
    }
    const flags = requestFlags(r, conn);
    const wait = r.timing.wait;
    const path = pathOf(r.url);
    add({
      kind: "request", to,
      offset: r.start - page.startMs,
      label: `${r.method || ""} ${path.length > 44 ? `${path.slice(0, 41)}...` : path}`.trim(),
      tip: sequenceTip("request", r, conn),
      chips: [
        r.protocol ? { text: PROTOCOL_LABELS[r.protocol] || r.protocol, tone: "proto", tip: protocolTip(r.protocol) } : null,
        { text: String(r.netError || r.status || (r.fromCache ? "cache" : "no answer")), tone: flags.includes("error") ? "bad" : r.status >= 300 && r.status < 400 ? "info" : "good", tip: resultTip(r) },
        wait != null ? { text: `wait ${formatDuration(wait)}`, tone: wait > THRESHOLDS.server.good ? "bad" : wait > THRESHOLDS.server.better ? "warn" : "plain", tip: TAG_TIPS.wait } : null,
        r.bytesWire ? { text: formatBytes(r.bytesWire), tone: "plain", tip: TAG_TIPS.size } : null
      ].filter(Boolean),
      flags,
      search: searchText(r)
    }, explainTransaction(r, conn));
  }
  // Time runs top to bottom: a handshake can start after its request was queued.
  rows.sort((a, b) => a.offset - b.offset || (a.kind === "connect" ? -1 : 1));
  return { actors, rows, explanations, truncated: analysis.pageRequests.length > requests.length };
}

function renderHowToRead() {
  const sample = (cls) => `<span class="how-sample ${cls}"><span class="seq-line"></span></span>`;
  return `
    <details class="how-to" open>
      <summary class="sub">How to read this view</summary>
      <p>Each column is one participant: your <strong>browser</strong> on the left, then every <strong>server</strong> the page talked to. Time runs from top to bottom; the number at the left of each row is when that step started, counted from the first request.</p>
      <ul class="how-legend">
        <li>${sample("kind-request")}<span><strong>Request and answer.</strong> The browser asks the server for something (the page, a script, an image, data) and gets an answer.</span></li>
        <li>${sample("kind-connect")}<span><strong>Opening a connection.</strong> The browser attempts to connect to a server and, when needed, set up encryption. A server can use several connections; an existing connection can also be reused.</span></li>
        <li><span class="how-band flag-error"></span><span><strong>Red row:</strong> a failure or a private-root certificate worth checking. A private root alone does not prove TLS inspection.</span></li>
        <li><span class="how-band flag-slow"></span><span><strong>Amber row:</strong> slow. The server took over ${formatDuration(THRESHOLDS.server.better)} to answer, or the step took over ${formatDuration(THRESHOLDS.server.good)}.</span></li>
      </ul>
      <p>The labels under each line show the protocol (H2, H3), the result (200 means OK), how long the server took to answer (wait), and the size.</p>
      <p><strong>Click any row or column heading</strong> to see what it means here. Hover over any small label (H2, 200, wait) for a quick explanation.</p>
    </details>`;
}

function renderChip(c) {
  return `<span class="tag tone-${esc(c.tone)}"${c.tip ? ` data-tip="${esc(c.tip)}"` : ""}>${esc(c.text)}</span>`;
}

function renderSequence(view, page, analysis) {
  const n = view.actors.length;
  const center = (i) => ((i + 0.5) / n).toFixed(5);
  const head = view.actors.map(a => `
        <button type="button" class="seq-actor kind-${a.kind}${a.level ? ` lvl-${esc(a.level)}` : ""}" data-key="${esc(a.key)}" title="${esc(a.title)}">
          ${icon(a.kind === "browser" ? "browser" : a.kind === "other" ? "other" : "server")}
          <span class="actor-text"><span class="actor-name">${esc(a.label)}</span><span class="actor-sub">${esc(a.sub)}</span></span>
        </button>`).join("");
  const lanes = view.actors.map((a, i) => `<span class="lane" style="left:calc(var(--tcol) + (100% - var(--tcol)) * ${center(i)})"></span>`).join("");
  const rows = view.rows.map(row => `
        <div class="seq-row kind-${row.kind}${row.flags.map(f => ` flag-${f}`).join("")}" data-key="${row.key}" data-kind="${row.kind}" data-flags="${row.flags.join(" ")}" data-search="${esc(row.search)}" tabindex="0" role="button" aria-label="${esc(row.label)}" data-tip="${esc(row.tip)}">
          <span class="seq-t">${esc(offsetLabel(row.offset))}</span>
          <span class="seq-span" style="--a:${center(0)};--w:${(row.to / n).toFixed(5)}">
            <span class="seq-label" data-tip="${esc(row.tip)}">${esc(row.label)}</span>
            <span class="seq-line"></span>
            <span class="seq-chips">${row.chips.map(renderChip).join("")}</span>
          </span>
        </div>`).join("");
  return `
    <section id="sequence" class="seq-layout">
      <div class="seq-main card">
        <div class="seq-title">
          <div class="seq-title-row"><h2>Sequence</h2><button type="button" id="toggle-details" aria-controls="explain" aria-expanded="true">Hide details panel</button></div>
          <p class="note">One column per server (the first ${MAX_SEQUENCE_HOSTS} contacted; the rest share the last column). A handshake row appears only where a new connection was opened.${view.truncated ? ` Showing the first ${MAX_SEQUENCE_REQUESTS} of ${page.requestCount} requests; the waterfall lists all of them.` : ""}</p>
          ${renderProtocolGuide(analysis.pageRequests)}
        </div>
        <div class="seq-scroll" style="--n:${n}">
          <div class="seq-grid">
            <div class="seq-head"><span class="seq-t head">Time</span>${head}</div>
            <div class="seq-body">${lanes}${rows}</div>
          </div>
        </div>
      </div>
      <aside class="inspector" id="explain" aria-label="Details" aria-live="polite">
        <div class="insp-bar"><span class="kicker">Details</span><button type="button" id="explain-close" aria-controls="explain" aria-expanded="true">Hide details panel</button></div>
        <div id="insp-empty">${renderHowToRead()}</div>
        <div id="insp-body" hidden>
          <h3 id="insp-title"></h3>
          <p class="verdict" id="insp-verdict"></p>
          <div class="insp-tabs" role="tablist">
            <button type="button" role="tab" data-tab="explained" aria-selected="true">Explained</button>
            <button type="button" role="tab" data-tab="timing" aria-selected="false">Timing</button>
            <button type="button" role="tab" data-tab="connection" aria-selected="false">Connection</button>
            <button type="button" role="tab" data-tab="headers" aria-selected="false">Headers</button>
          </div>
          <div class="insp-pane" data-pane="explained"></div>
          <div class="insp-pane" data-pane="timing" hidden></div>
          <div class="insp-pane" data-pane="connection" hidden></div>
          <div class="insp-pane" data-pane="headers" hidden></div>
          <p class="insp-link" id="insp-link" hidden></p>
        </div>
      </aside>
      <script type="application/json" id="seq-explain">${JSON.stringify(view.explanations).replace(/</g, "\\u003c")}</script>
    </section>`;
}

function renderFilterBar(pageRequests, connections) {
  const counts = { problems: 0, slow: 0, inspected: 0, local: 0 };
  for (const r of pageRequests) {
    const flags = requestFlags(r, connections.get(r.connectionId));
    if (flags.includes("error") || flags.includes("inspected")) counts.problems++;
    for (const f of ["slow", "inspected", "local"]) if (flags.includes(f)) counts[f]++;
  }
  const button = (key, label, count) => `<button type="button" data-filter="${key}"${key === "all" ? ' class="is-on" aria-pressed="true"' : ' aria-pressed="false"'}>${esc(label)}${count != null ? ` <span class="count">${count}</span>` : ""}</button>`;
  return `
    <div class="filterbar" id="filterbar">
      <label class="search">${icon("search", 14)}<input id="filter-text" type="search" placeholder="Filter by host, address, status or protocol" aria-label="Filter requests"></label>
      <div class="filter-chips" role="group" aria-label="Show only">
        ${button("all", "All")}${button("problems", "Problems", counts.problems)}${button("slow", "Slow", counts.slow)}${button("inspected", "TLS inspection", counts.inspected)}${button("local", "Local calls", counts.local)}
      </div>
      <span class="filter-count" id="filter-count"></span>
    </div>`;
}

const NAV = [
  ["overview", "overview", "Overview"],
  ["waterfall", "waterfall", "Waterfall"],
  ["sequence", "sequence", "Sequence"],
  ["environment", "environment", "Environment"],
  ["policy", "policy", "Policy"],
  ["coverage", "coverage", "Coverage"],
  ["diagnostics", "overview", "Diagnostics"],
  ["event-replay", "search", "Events"],
  ["ai-summary", "ai", "AI summary"],
  ["learn", "learn", "Learn"]
];

/**
 * @param {object} model     capture model
 * @param {object} analysis  result of analyzeCapture
 * @param {{ theme?: object, source?: { name?: string, bytes?: number } }} options
 *   theme: design tokens (defaults to DESIGN.md); source: the capture file, for the header
 */
export function renderReportHtml(model, analysis, { theme = DEFAULT_THEME, source = null } = {}) {
  const serverInsights = buildServerInsights(analysis.pageRequests);
  const enrichment = model.enrichment || null;
  const profile = model.profile || null;
  const connections = new Map(model.connections.map(c => [c.id, c]));
  const { page } = analysis;
  const high = analysis.findings.filter(f => f.severity === "high").length;
  const view = buildSequenceView(analysis, connections, model.environment);
  const summary = buildAiSummary(model, analysis, { source });
  const siteName = page.site.replace(/^https?:\/\//, "");
  const title = `SocketMap Report: ${siteName}`;
  const env = model.environment;

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<meta name="generator" content="SocketMap ${VERSION}">
<title>${esc(title)}</title>
<style>
  :root {
    ${themeCss(theme)}
    --sidebar-w: 216px;
    --topbar-h: 96px;
    --tcol: 76px;
  }
  ${themeModeCss(theme, DEFAULT_THEME)}
  ${diagnosticsCss()}
  ${coverageCss()}
  ${serverInsightsCss()}
  ${policyCss()}
  ${enrichmentCss()}
  ${profileCss()}
  .ms-swatch { background: transparent; border-left: 1px dashed var(--secondary); height: 12px; width: 0; }
  .srv-swatch { background: var(--text); height: 3px; align-self: center; }
  .event-replay { padding: 20px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); }
  .event-replay-tools { display: flex; flex-wrap: wrap; align-items: end; gap: 12px; margin: 16px 0; }
  .event-replay-tools label { display: grid; gap: 4px; font-size: 12px; }
  .event-replay-tools input { max-width: 240px; padding: 7px; border: 1px solid var(--border); border-radius: var(--radius-sm); color: var(--text); background: var(--canvas); }
  .event-replay-row { border-bottom: 1px solid var(--border); padding: 12px 0; overflow-wrap: anywhere; }
  .event-replay-row summary { cursor: pointer; }
  .event-replay-pages { display: flex; gap: 12px; margin-top: 16px; }
  .sidebar { overflow-y: auto; }
  * { box-sizing: border-box; }
  html { scroll-padding-top: calc(var(--topbar-h) + 12px); }
  body { margin: 0; background: var(--bg); color: var(--text); font: 14px/1.5 var(--font-sans); }
  code, pre, .mono { font-family: var(--font-mono); font-size: 12.5px; }
  pre { white-space: pre-wrap; overflow-wrap: anywhere; background: var(--canvas); padding: 10px; border-radius: var(--radius-sm); border: 1px solid var(--border); }
  h2 { font-size: 16px; font-weight: 600; letter-spacing: -0.01em; margin: 0 0 12px; }
  h3 { font-size: 14px; margin: 0; }
  a { color: var(--primary); }
  .icon { flex: none; }
  .muted, .note { color: var(--text-muted); }
  .note { font-size: 12.5px; margin: 0 0 10px; }
  .sub { font-size: 12px; font-family: var(--font-mono); font-weight: 600; text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); margin: 16px 0 8px; }
  button { font: 13px var(--font-sans); color: var(--text); background: var(--surface-2); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 5px 11px; cursor: pointer; }
  button:hover { border-color: var(--secondary); }
  button:focus-visible, [tabindex]:focus-visible, a:focus-visible { outline: 2px solid var(--secondary); outline-offset: 3px; }

  /* Shell: sidebar, top bar, status bar */
  .sidebar { position: fixed; inset: 0 auto 0 0; width: var(--sidebar-w); background: var(--surface); border-right: 1px solid var(--border); display: flex; flex-direction: column; gap: 4px; padding: 14px 10px; z-index: 30; }
  .brand { display: flex; align-items: center; gap: 8px; font-weight: 700; font-size: 17px; padding: 4px 8px 14px; color: var(--text); }
  .brand .icon { color: var(--secondary); }
  .sidebar a { display: flex; align-items: center; gap: 10px; padding: 8px 10px; border-radius: var(--radius); color: var(--text-muted); text-decoration: none; }
  .sidebar a:hover { background: var(--surface-mid); color: var(--text); }
  .sidebar a.is-active { background: var(--accent); color: var(--on-accent); font-weight: 600; }
  .side-box { margin-top: auto; background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius); padding: 10px 12px; font-family: var(--font-mono); font-size: 12px; color: var(--text-muted); }
  .side-box .sub { margin: 0 0 6px; }
  .side-box div { display: flex; justify-content: space-between; gap: 8px; }
  .app { margin-left: var(--sidebar-w); min-height: 100vh; display: flex; flex-direction: column; }
  .topbar { position: sticky; top: 0; z-index: 20; background: color-mix(in srgb, var(--surface) 88%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--secondary) 20%, transparent); padding: 10px 20px; display: flex; flex-direction: column; gap: 8px; }
  .top-row { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 14px; }
  .crumbs { display: flex; align-items: center; gap: 8px; font-family: var(--font-mono); font-size: 13px; min-width: 0; }
  .crumbs .brand-mini { color: var(--secondary); font-weight: 600; letter-spacing: 0.05em; }
  .crumbs .sep { color: var(--text-faint); }
  .crumbs .file { background: var(--surface-mid); padding: 2px 8px; border-radius: var(--radius-sm); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; max-width: 360px; }
  .badge { font-family: var(--font-mono); font-size: 11px; font-weight: 600; padding: 1px 6px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--primary) 18%, transparent); color: var(--primary); }
  .page-url { font-family: var(--font-mono); font-size: 12.5px; color: var(--text-muted); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; flex: 1; min-width: 160px; }
  .pill { font-family: var(--font-mono); font-size: 11.5px; font-weight: 600; padding: 2px 8px; border-radius: var(--radius-sm); background: color-mix(in srgb, var(--success) 16%, transparent); color: var(--success); white-space: nowrap; }
  .pill.is-bad { background: color-mix(in srgb, var(--danger) 18%, transparent); color: var(--danger); }
  .pill.is-plain { background: var(--surface-2); color: var(--text-muted); }
  main { padding: 18px 20px 28px; flex: 1; min-width: 0; }
  .view { display: grid; gap: 16px; }
  .js .view:not(.is-active) { display: none; }
  .js .filterbar:not(.is-shown) { display: none; }
  .statusbar { display: flex; flex-wrap: wrap; gap: 6px 14px; align-items: center; padding: 8px 20px; background: var(--canvas); border-top: 1px solid var(--border); font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); }
  .statusbar strong { color: var(--text); font-weight: 600; }
  .done-dot { width: 8px; height: 8px; border-radius: 50%; background: var(--success); display: inline-block; }

  /* Filter bar */
  .filterbar { display: flex; flex-wrap: wrap; align-items: center; gap: 8px 12px; }
  .search { display: flex; align-items: center; gap: 6px; background: var(--canvas); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 4px 8px; color: var(--text-faint); flex: 1; min-width: 220px; max-width: 520px; }
  .search:focus-within { border-color: var(--secondary); }
  .search input { flex: 1; background: transparent; border: 0; outline: none; color: var(--text); font: 12.5px var(--font-mono); }
  .filter-chips { display: flex; flex-wrap: wrap; gap: 6px; }
  .filter-chips button { font: 600 11.5px var(--font-mono); padding: 3px 9px; color: var(--text-muted); }
  .filter-chips button.is-on { background: var(--accent); color: var(--on-accent); border-color: var(--accent); }
  .filter-chips .count { opacity: 0.8; margin-left: 3px; }
  .filter-count { font-family: var(--font-mono); font-size: 11.5px; color: var(--text-faint); }
  .is-filtered-out { display: none !important; }

  /* Cards and overview */
  .card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 18px; min-width: 0; }
  .banner { border-left: 3px solid var(--secondary); background: var(--surface-mid); padding: 10px 14px; border-radius: var(--radius-sm); font-size: 13px; margin: 0; }
  .page-card h2 { font-family: var(--font-mono); font-size: 14px; overflow-wrap: anywhere; }
  .kpis { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
  .kpi { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 14px; }
  .kpi b { display: block; font-size: 22px; font-family: var(--font-mono); font-weight: 600; }
  .kpi span { color: var(--text-muted); font-size: 12px; }
  .kv { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 0; }
  .kv dt { color: var(--text-muted); }
  .kv dd { margin: 0; font-family: var(--font-mono); font-size: 12.5px; overflow-wrap: anywhere; }
  .finding { border: 1px solid var(--border); border-left: 4px solid var(--sev-info); border-radius: var(--radius-sm); padding: 12px 14px; margin-bottom: 10px; background: var(--surface-mid); }
  .finding.sev-high { border-left-color: var(--sev-high); }
  .finding.sev-medium { border-left-color: var(--sev-medium); }
  .finding header { display: flex; gap: 10px; align-items: center; }
  .finding p { margin: 6px 0; }
  .finding ul { margin: 6px 0; padding-left: 18px; }
  .sev { text-transform: uppercase; font: 700 10.5px var(--font-mono); letter-spacing: .06em; padding: 2px 6px; border-radius: var(--radius-sm); background: var(--sev-info); color: var(--bg); }
  .sev-high .sev { background: var(--sev-high); }
  .sev-medium .sev { background: var(--sev-medium); }
  .team { font-size: 13px; }
  .stack { display: flex; height: 16px; border-radius: var(--radius-sm); overflow: hidden; background: var(--canvas); }
  .legend { list-style: none; padding: 0; margin: 10px 0; display: flex; flex-wrap: wrap; gap: 6px 16px; font-size: 12.5px; }
  .swatch { display: inline-block; width: 10px; height: 10px; border-radius: 2px; margin-right: 6px; vertical-align: middle; }
  ${SEGMENTS.map(k => `.seg-${k} { background: var(--seg-${k}); }`).join("\n  ")}
  .seg { display: block; height: 100%; min-width: 1px; }
  .table-wrap { overflow-x: auto; }
  table { border-collapse: collapse; width: 100%; font-size: 12.5px; }
  th, td { text-align: left; padding: 6px 8px; border-bottom: 1px solid var(--border); vertical-align: top; }
  thead th { color: var(--text-faint); font: 600 11px var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; white-space: nowrap; }
  .chip { display: inline-block; padding: 1px 7px; border-radius: var(--radius-sm); font: 11.5px var(--font-mono); border: 1px solid currentColor; white-space: nowrap; }
  .lvl-best { color: var(--best); } .lvl-better { color: var(--better); } .lvl-good { color: var(--good); } .lvl-poor { color: var(--poor); } .lvl-unknown { color: var(--unknown); }
  .dot { display: inline-block; width: 8px; height: 8px; border-radius: 50%; margin-right: 8px; background: currentColor; }
  .glossary { display: grid; grid-template-columns: max-content 1fr; gap: 6px 18px; margin: 8px 0; }
  .glossary dt { font-weight: 600; }
  .glossary dd { margin: 0; color: var(--text-muted); }
  .glossary-entry { display: contents; }
  .glossary-entry[hidden] { display: none; }
  .glossary-search { display: block; margin: 12px 0; }
  #glossary-search { display: block; width: min(100%, 480px); margin-top: 5px; padding: 8px 10px; font: inherit; background: var(--canvas); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); }
  details.more summary { cursor: pointer; color: var(--primary); font-size: 12.5px; margin-top: 8px; }

  /* Waterfall */
  .wf-key { position: sticky; top: var(--topbar-h); z-index: 15; background: var(--surface); padding: 10px 0; border-bottom: 1px solid var(--border); }
  .key-heading { font-size: 12px; font-weight: 600; }
  .key-heading .muted { font-weight: 400; }
  .wf-key .legend { margin: 6px 0 0; }
  .wf-key [data-tip], .method[data-tip] { cursor: help; }
  .wf { font-size: 12px; }
  .wf-row, .wf-axis { border-bottom: 1px solid var(--border); }
  .wf-row > summary, .wf-axis { display: grid; grid-template-columns: minmax(180px, 34%) 70px 64px 1fr 70px; gap: 8px; align-items: center; padding: 4px 0; cursor: pointer; list-style: none; }
  .wf-row > summary::-webkit-details-marker { display: none; }
  .wf-row > summary:hover { background: var(--surface-mid); }
  .wf-row.flag-error > summary { background: color-mix(in srgb, var(--danger-container) 28%, transparent); }
  .wf-row.flag-slow:not(.flag-error) > summary { background: color-mix(in srgb, var(--warning) 9%, transparent); }
  .wf-row.flag-error .wf-status { color: var(--danger); font-weight: 700; }
  .wf-label { overflow: hidden; white-space: nowrap; text-overflow: ellipsis; font-family: var(--font-mono); }
  .wf-path { color: var(--text-muted); }
  .method { color: var(--primary); }
  .wf-status, .wf-proto, .wf-time { font-family: var(--font-mono); color: var(--text-muted); }
  .wf-time { text-align: right; }
  .wf-track { position: relative; height: 14px; background: var(--canvas); border-radius: 3px; }
  .wf-bar { position: absolute; top: 2px; bottom: 2px; display: flex; background: var(--border); border-radius: 2px; overflow: hidden; }
  .ticks span { position: absolute; top: 0; transform: translateX(-50%); font-size: 10.5px; color: var(--text-faint); white-space: nowrap; font-family: var(--font-mono); }
  .ticks span:first-child { transform: none; } .ticks span:last-child { transform: translateX(-100%); }
  .detail { padding: 10px 0 14px; }
  .detail-grid { display: grid; grid-template-columns: 2fr 1fr; gap: 14px; }
  .mini th { color: var(--text-muted); font-weight: 500; width: 150px; }
  .wrap { overflow-wrap: anywhere; }
  .plain { background: var(--surface-mid); padding: 8px 10px; border-radius: var(--radius-sm); margin: 0 0 10px; }

  /* Sequence view */
  .seq-layout { display: grid; grid-template-columns: minmax(0, 1fr) 380px; gap: 16px; align-items: start; }
  .seq-main { padding: 0; overflow: hidden; }
  .seq-title { padding: 14px 18px 4px; }
  .seq-scroll { overflow: auto; max-height: calc(100vh - var(--topbar-h) - 150px); background: var(--canvas); border-top: 1px solid var(--border); }
  .seq-grid { min-width: calc(var(--tcol) + var(--n) * 128px); }
  .seq-head { position: sticky; top: 0; z-index: 3; display: grid; grid-template-columns: var(--tcol) repeat(var(--n), minmax(0, 1fr)); gap: 6px; padding: 8px 8px 8px 0; background: color-mix(in srgb, var(--surface) 92%, transparent); backdrop-filter: blur(8px); border-bottom: 1px solid color-mix(in srgb, var(--secondary) 20%, transparent); }
  .seq-actor { display: flex; align-items: center; gap: 6px; min-width: 0; text-align: left; background: var(--surface-mid); padding: 6px 8px; }
  .seq-actor .icon { color: var(--secondary); }
  .seq-actor.kind-browser .icon { color: var(--primary); }
  .seq-actor.lvl-poor { border-color: var(--danger); } .seq-actor.lvl-poor .icon { color: var(--danger); }
  .seq-actor.lvl-good .icon { color: var(--warning); }
  .seq-actor.is-selected { border-color: var(--secondary); box-shadow: 0 0 12px color-mix(in srgb, var(--secondary) 25%, transparent); }
  .actor-text { display: flex; flex-direction: column; min-width: 0; }
  .actor-name { font: 600 12px var(--font-mono); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .actor-sub { font: 10.5px var(--font-mono); color: var(--text-faint); overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
  .seq-body { position: relative; padding: 6px 0 16px; }
  .lane { position: absolute; top: 0; bottom: 0; border-left: 1px dashed var(--border); }
  .seq-t { position: absolute; left: 0; width: calc(var(--tcol) - 10px); top: 21px; text-align: right; font: 10.5px var(--font-mono); color: var(--text-faint); }
  .seq-t.head { position: static; align-self: center; width: auto; padding-right: 10px; text-transform: uppercase; letter-spacing: 0.05em; }
  .seq-row { position: relative; height: 60px; cursor: pointer; border-radius: var(--radius-sm); outline: none; }
  .seq-row:hover { background: color-mix(in srgb, var(--secondary) 6%, transparent); }
  .seq-row:focus-visible, .seq-row.is-selected { background: color-mix(in srgb, var(--secondary) 12%, transparent); box-shadow: inset 0 0 0 1px var(--secondary); }
  .seq-row.flag-slow { background: color-mix(in srgb, var(--warning) 9%, transparent); }
  .seq-row.flag-error, .seq-row.flag-inspected { background: color-mix(in srgb, var(--danger-container) 30%, transparent); }
  .seq-row.flag-error .seq-t, .seq-row.flag-inspected .seq-t { color: var(--danger); font-weight: 600; }
  .seq-span { position: absolute; top: 0; bottom: 0; left: calc(var(--tcol) + (100% - var(--tcol)) * var(--a)); width: calc((100% - var(--tcol)) * var(--w)); }
  .seq-label { position: absolute; top: 4px; left: 50%; transform: translateX(-50%); max-width: 340px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; font: 600 11px var(--font-mono); padding: 1px 7px; border-radius: var(--radius-sm); background: var(--surface-2); color: var(--text); }
  .seq-line { position: absolute; top: 27px; left: 4px; right: 4px; height: 2px; background: var(--primary); }
  .seq-line::before { content: ""; position: absolute; left: -4px; top: -7px; width: 7px; height: 16px; border-radius: 4px; background: color-mix(in srgb, currentColor 30%, transparent); border: 1.5px solid; color: var(--primary); }
  .seq-line::after { content: ""; position: absolute; right: -2px; top: -5px; border: 6px solid transparent; border-left: 9px solid var(--primary); border-right: 0; }
  .kind-connect .seq-line { background: none; border-top: 2px dashed var(--seg-tls); height: 0; }
  .kind-connect .seq-line::before { color: var(--seg-tls); }
  .kind-connect .seq-line::after { border-left-color: var(--seg-tls); top: -7px; }
  .flag-error .seq-line, .flag-inspected .seq-line { background: var(--danger); }
  .flag-error .seq-line::after, .flag-inspected .seq-line::after { border-left-color: var(--danger); }
  .kind-connect.flag-inspected .seq-line, .kind-connect.flag-error .seq-line { background: none; border-top-color: var(--danger); }
  .seq-chips { position: absolute; top: 35px; left: 50%; transform: translateX(-50%); display: flex; gap: 4px; white-space: nowrap; }
  .tag { font: 600 10.5px var(--font-mono); padding: 0 6px; line-height: 18px; border-radius: var(--radius-sm); border: 1px solid currentColor; background: color-mix(in srgb, currentColor 12%, transparent); text-transform: uppercase; letter-spacing: 0.03em; }
  .tone-proto { color: var(--secondary); } .tone-tls { color: var(--seg-tls); } .tone-good { color: var(--success); } .tone-warn { color: var(--warning); } .tone-bad { color: var(--danger); } .tone-info { color: var(--primary); } .tone-plain { color: var(--text-muted); }

  .seq-title-row { display: flex; justify-content: space-between; align-items: center; gap: 12px; }
  .seq-title-row h2 { margin: 0; }
  .seq-layout.details-hidden { grid-template-columns: minmax(0, 1fr); }
  .seq-layout.details-hidden .inspector { display: none; }
  .proto-guide { margin: 6px 0 10px; }
  .proto-guide > summary { cursor: pointer; color: var(--primary); font-size: 12.5px; }
  .proto-guide table { margin-top: 6px; }
  .proto-guide th { white-space: nowrap; }
  [data-tip] { cursor: help; }
  .wf-proto[data-tip], .wf-status[data-tip] { text-decoration: underline dotted; text-underline-offset: 3px; }
  .tip-box { position: fixed; z-index: 60; max-width: 340px; padding: 8px 10px; background: var(--surface-3); color: var(--text); border: 1px solid var(--border-strong); border-radius: var(--radius-sm); font: 12.5px/1.45 var(--font-sans); box-shadow: 0 6px 18px rgba(0, 0, 0, 0.45); pointer-events: none; }
  .tip-box[hidden] { display: none; }
  details.how-to > summary { cursor: pointer; margin-top: 0; }

  /* Inspector */
  .inspector { position: sticky; top: calc(var(--topbar-h) + 12px); max-height: calc(100vh - var(--topbar-h) - 40px); overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 12px 16px 18px; }
  .insp-bar { display: flex; justify-content: space-between; align-items: center; margin-bottom: 6px; }
  .kicker { font: 600 11px var(--font-mono); text-transform: uppercase; letter-spacing: 0.05em; color: var(--text-faint); }
  .insp-close { display: none; }
  .inspector h3 { font-size: 16px; margin: 4px 0 10px; }
  .verdict { padding: 8px 10px; border-radius: var(--radius-sm); border-left: 4px solid var(--unknown); background: var(--surface-mid); font-weight: 600; margin: 0 0 10px; }
  .verdict.tone-good { border-left-color: var(--success); color: var(--text); } .verdict.tone-warn { border-left-color: var(--warning); color: var(--text); } .verdict.tone-bad { border-left-color: var(--danger); color: var(--text); } .verdict.tone-info { border-left-color: var(--primary); color: var(--text); }
  .insp-tabs { display: flex; gap: 2px; border-bottom: 1px solid var(--border); margin-bottom: 10px; }
  .insp-tabs button { background: none; border: 0; border-bottom: 2px solid transparent; border-radius: 0; padding: 6px 10px; font: 600 12px var(--font-mono); color: var(--text-faint); }
  .insp-tabs button[aria-selected="true"] { color: var(--secondary); border-bottom-color: var(--secondary); }
  .insp-pane p { margin: 8px 0; }
  .insight { border: 1px dashed var(--border); border-radius: var(--radius-sm); padding: 8px 10px; }
  .meaning { color: var(--text-muted); font-size: 12px; font-weight: 400; }
  .bars { display: grid; gap: 8px; }
  .bar-row .bar-top { display: flex; justify-content: space-between; font: 12px var(--font-mono); }
  .bar-row .bar-top span:first-child { color: var(--text-muted); }
  .bar-track { height: 5px; background: var(--canvas); border-radius: 3px; overflow: hidden; margin-top: 3px; }
  .bar-fill { height: 100%; }
  .how-to p { margin: 6px 0; }
  .how-legend { list-style: none; padding: 0; margin: 8px 0; display: grid; gap: 8px; }
  .how-legend li { display: flex; gap: 10px; align-items: center; }
  .how-sample { position: relative; flex: none; width: 46px; height: 16px; }
  .how-sample .seq-line { top: 7px; }
  .how-band { flex: none; width: 46px; height: 16px; border-radius: var(--radius-sm); }
  .how-band.flag-error { background: color-mix(in srgb, var(--danger-container) 60%, transparent); border: 1px solid var(--danger); }
  .how-band.flag-slow { background: color-mix(in srgb, var(--warning) 20%, transparent); border: 1px solid var(--warning); }

  /* Learn, AI summary */
  .steps li { margin: 4px 0; }
  .learn-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(300px, 1fr)); gap: 4px 28px; }
  .links { list-style: none; padding: 0; margin: 0; }
  .links li { margin: 0 0 10px; }
  .links a { font-weight: 600; }
  .links span { display: block; color: var(--text-muted); font-size: 12.5px; }
  textarea { width: 100%; min-height: 320px; background: var(--canvas); color: var(--text); border: 1px solid var(--border); border-radius: var(--radius-sm); padding: 10px; font: 12px var(--font-mono); }
  .tools { display: flex; gap: 8px; align-items: center; margin-bottom: 8px; }
  button.primary { background: var(--accent); color: var(--on-accent); border-color: var(--accent); font-weight: 600; }

  @media (max-width: 1200px) {
    .seq-layout { grid-template-columns: 1fr; }
    .inspector { position: static; width: auto; max-height: none; }
  }
  @media (max-width: 900px) {
    .sidebar { position: static; width: auto; flex-direction: row; flex-wrap: wrap; align-items: center; border-right: 0; border-bottom: 1px solid var(--border); padding: 8px 10px; }
    .brand { padding: 4px 8px; }
    .side-box { display: none; }
    .app { margin-left: 0; }
    .detail-grid, .glossary { grid-template-columns: 1fr; }
    .wf-row > summary, .wf-axis { grid-template-columns: 1fr 60px 70px; }
    .wf-proto, .wf-track { display: none; }
  }
</style>
${themePreferenceScript()}
</head>
<body>
<nav class="sidebar" aria-label="Report sections">
  <div class="brand">${icon("logo", 20)}SocketMap</div>
  ${NAV.map(([target, iconName, label]) => `<a href="#${target}" data-nav="${target}">${icon(iconName)}${esc(label)}</a>`).join("\n  ")}
  <div class="side-box">
    <p class="sub">This capture</p>
    <div><span>Page requests</span><strong>${page.requestCount}</strong></div>
    <div><span>All requests</span><strong>${model.requests.length}</strong></div>
    <div><span>Hosts</span><strong>${page.hostCount}</strong></div>
    <div><span>Length</span><strong>${esc(ms(env.captureDurationMs))}</strong></div>
  </div>
</nav>
<div class="app">
  <header class="topbar">
    <div class="top-row">
      <div class="crumbs">${icon("logo")}<span class="brand-mini">SOCKETMAP</span><span class="sep">/</span><span class="file" title="${esc(source?.name || "")}">${esc(source?.name || "NetLog capture")}</span>${source?.bytes ? `<span class="badge">${esc(formatBytes(source.bytes))}</span>` : ""}</div>
      <span class="page-url" title="${esc(page.url)}">${esc(page.url)}</span>
      <span class="pill is-plain">Load ${esc(ms(page.loadMs))}</span>
      <span class="pill is-plain">${page.requestCount} requests</span>
      <span class="pill${high ? " is-bad" : ""}">${analysis.findings.length} finding${analysis.findings.length === 1 ? "" : "s"}${high ? ` (${high} high)` : ""}</span>
      <button type="button" data-theme-toggle aria-label="Switch color theme">Light theme</button>
    </div>
    ${renderFilterBar(analysis.pageRequests, connections)}
  </header>
  <main>
    <div class="view" id="overview" data-view="overview">
      <div class="card page-card">
        <h2>${esc(page.url)}</h2>
        <p class="banner">This report contains IP addresses, full URLs, and request/response headers from the capture. Passwords, cookies, auth headers, and tokens were removed before it was written.</p>
      </div>
      <div class="kpis">
        <div class="kpi"><b>${esc(ms(page.loadMs))}</b><span>First request to last response</span></div>
        <div class="kpi"><b>${page.requestCount}</b><span>Requests</span></div>
        <div class="kpi"><b>${page.hostCount}</b><span>Hosts</span></div>
        <div class="kpi"><b>${esc(formatBytes(page.bytesWire) || "Not recorded")}</b><span>Transferred</span></div>
        <div class="kpi"><b>${analysis.findings.length}</b><span>Findings (${high} high)</span></div>
      </div>
      ${renderFindings(analysis.findings)}
      ${renderBreakdown(analysis.breakdown)}
      ${renderServerInsights(serverInsights)}
      ${renderEnrichmentPanel(enrichment, analysis.pageRequests)}
      ${renderProfilePanel(profile, analysis.pageRequests)}
      ${renderHosts(analysis.hosts)}
    </div>
    <div class="view" id="view-waterfall" data-view="waterfall">
      ${renderWaterfall(analysis, connections, serverInsights, enrichment, profile)}
    </div>
    <div class="view" id="view-sequence" data-view="sequence">
      ${renderSequence(view, page, analysis)}
    </div>
    <div class="view" id="view-environment" data-view="environment">
      ${renderEnvironment(env)}
      <section id="other" class="card">
        <h2>Other activity in this capture</h2>
        ${analysis.background.length ? `<p class="note">Traffic from other tabs, extensions, and the browser itself. Not included in this report's analysis. Pick one of these as the page to analyze it.</p>
        <table><thead><tr><th>Site</th><th>Requests</th><th>Type</th></tr></thead><tbody>
          ${analysis.background.map(p => `<tr><td>${esc(p.site)}</td><td>${p.requestCount}</td><td>${p.isBackground ? "Browser / extension" : "Other page"}</td></tr>`).join("")}
        </tbody></table>` : "<p>None.</p>"}
      </section>
    </div>
    <div class="view" id="view-policy" data-view="policy">${renderPolicyView()}</div>
    <div class="view" id="view-coverage" data-view="coverage">${renderCoverage(buildCoverage(model))}</div>
    <div class="view" id="view-diagnostics" data-view="diagnostics">${renderDiagnostics(model)}</div>
    <div class="view" id="view-events" data-view="event-replay">${eventReplayMarkup()}</div>
    <div class="view" id="view-ai" data-view="ai-summary">
      <section id="ai-summary" class="card">
        <h2>AI summary</h2>
        <p class="note">A detailed handoff with capture context, environment, findings, request evidence, and questions to investigate. Copy it into your AI assistant or save it for later. It retains internal addresses and URLs, so share it only with an assistant approved for that data.</p>
        <div class="tools"><button type="button" id="copy-summary" class="primary">Copy summary</button><button type="button" id="save-summary">Save summary (.txt)</button><span id="copy-status" class="muted" role="status"></span></div>
        <textarea id="summary-text" aria-label="Detailed AI evidence summary" readonly>${esc(summary)}</textarea>
      </section>
    </div>
    <div class="view" id="view-learn" data-view="learn">
      ${renderLearn()}
    </div>
  </main>
  <footer class="statusbar">
    <span class="done-dot" aria-hidden="true"></span><strong>${model.stats.events.toLocaleString("en-US")} events read</strong>
    <span>${model.requests.length} requests in capture</span>
    <span>${page.requestCount} on this page</span>
    <span>${page.hostCount} hosts</span>
    <span>Secrets removed</span>
    <span>Works offline</span>
    <span>SocketMap ${VERSION}</span>
  </footer>
</div>
<div class="tip-box" id="tip-box" role="tooltip" hidden></div>
<script>
(function () {
  document.documentElement.classList.add("js");
  var topbar = document.querySelector(".topbar");
  function setTopbarHeight() { document.documentElement.style.setProperty("--topbar-h", topbar.offsetHeight + "px"); }
  if (typeof ResizeObserver !== "undefined") new ResizeObserver(setTopbarHeight).observe(topbar);

  // Views: the hash names a view or an element inside one.
  var views = Array.prototype.slice.call(document.querySelectorAll(".view"));
  var filterbar = document.getElementById("filterbar");
  function route(requested) {
    var hash = requested || decodeURIComponent(location.hash.slice(1)) || ${JSON.stringify(model.requests.length ? "overview" : "view-diagnostics")};
    var target = document.getElementById(hash);
    var view = target ? (target.classList.contains("view") ? target : target.closest(".view")) : null;
    if (!view) { view = document.getElementById("overview"); target = null; }
    views.forEach(function (v) { v.classList.toggle("is-active", v === view); });
    var name = view.getAttribute("data-view");
    document.querySelectorAll("[data-nav]").forEach(function (a) { a.classList.toggle("is-active", a.getAttribute("data-nav") === name); });
    filterbar.classList.toggle("is-shown", name === "waterfall" || name === "sequence");
    setTopbarHeight();
    if (target && target !== view && !/^(waterfall|sequence|ai-summary|learn|environment|coverage|policy)$/.test(hash)) {
      if (target.tagName === "DETAILS") target.open = true;
      target.scrollIntoView({ block: "center" });
    } else {
      window.scrollTo(0, 0);
    }
  }
  window.addEventListener("hashchange", function () { route(); });
  window.addEventListener("socketmap:open-events", function () { route("view-events"); });
  // In-page links switch views directly. Inside the viewer the report is an embedded
  // document whose "#" links would otherwise resolve against the viewer's address.
  document.addEventListener("click", function (ev) {
    var a = ev.target.closest && ev.target.closest('a[href^="#"]');
    if (!a) return;
    ev.preventDefault();
    var hash = a.getAttribute("href").slice(1);
    route(hash);
    if (hash === "event-replay") window.dispatchEvent(new CustomEvent("socketmap:open-events"));
    if (window === window.top) { try { history.replaceState(null, "", "#" + hash); } catch (e) { /* file:// may refuse; the view still changes */ } }
  });
  window.addEventListener("resize", setTopbarHeight);

  // Filter: the same search and chips apply to the waterfall and the sequence.
  var mode = "all";
  var input = document.getElementById("filter-text");
  var count = document.getElementById("filter-count");
  function applyFilter() {
    var text = input.value.trim().toLowerCase();
    var shown = 0, total = 0;
    document.querySelectorAll(".wf-row, .seq-row").forEach(function (row) {
      var flags = " " + (row.getAttribute("data-flags") || "") + " ";
      var byMode = mode === "all" || (mode === "problems" ? /\\s(error|inspected)\\s/.test(flags) : flags.indexOf(" " + mode + " ") >= 0);
      var byText = !text || (row.getAttribute("data-search") || "").indexOf(text) >= 0;
      var visible = byMode && byText;
      row.classList.toggle("is-filtered-out", !visible);
      if (row.classList.contains("wf-row")) { total++; if (visible) shown++; }
    });
    count.textContent = (mode === "all" && !text) ? "" : "Showing " + shown + " of " + total + " requests";
  }
  input.addEventListener("input", applyFilter);
  document.querySelectorAll("[data-filter]").forEach(function (b) {
    b.addEventListener("click", function () {
      mode = b.getAttribute("data-filter");
      document.querySelectorAll("[data-filter]").forEach(function (x) {
        var on = x === b;
        x.classList.toggle("is-on", on);
        x.setAttribute("aria-pressed", on ? "true" : "false");
      });
      applyFilter();
    });
  });

  // Inspector: plain-language explanation of the selected row or column.
  var EXPLAIN = JSON.parse(document.getElementById("seq-explain").textContent || "{}");
  var inspector = document.getElementById("explain");
  var empty = document.getElementById("insp-empty");
  var body = document.getElementById("insp-body");
  var selected = null;
  function esc(t) { var d = document.createElement("div"); d.textContent = t == null ? "" : String(t); return d.innerHTML; }
  function table(rows) {
    return '<table class="mini"><tbody>' + rows.map(function (r) { return "<tr><th>" + esc(r[0]) + '</th><td class="wrap">' + r[1] + "</td></tr>"; }).join("") + "</tbody></table>";
  }
  function fill(e) {
    var explained = "<p>" + esc(e.plain) + "</p>";
    if (e.insight) explained += '<p class="insight">' + esc(e.insight) + "</p>";
    if (e.steps && e.steps.length) {
      explained += '<h4 class="sub">' + esc(e.stepsTitle || "Step by step") + "</h4>" + table(e.steps.map(function (s) {
        return [s.label, "<strong>" + esc(s.value) + '</strong><div class="meaning">' + esc(s.meaning) + "</div>"];
      }));
    }
    var timing = '<p class="muted">No timing for this item.</p>';
    if (e.timing && e.timing.length) {
      var total = e.totalMs || e.timing.reduce(function (s, t) { return s + t.ms; }, 0) || 1;
      timing = '<p class="muted">Total ' + esc(e.timing.length ? formatTotal(total) : "") + '. Each bar is that step\\'s share of the total.</p><div class="bars">' + e.timing.map(function (t) {
        return '<div class="bar-row"><div class="bar-top"><span>' + esc(t.label) + "</span><span>" + esc(t.value) + '</span></div><div class="bar-track"><div class="bar-fill seg-' + esc(t.key) + '" style="width:' + Math.max(1, Math.round(t.ms / total * 100)) + '%"></div></div><div class="meaning">' + esc(t.meaning) + "</div></div>";
      }).join("") + "</div>";
    }
    var connection = e.facts && e.facts.length ? table(e.facts.map(function (f) { return [f[0], esc(f[1])]; })) : '<p class="muted">Nothing recorded.</p>';
    var headers = '<p class="muted">No headers recorded for this item.</p>';
    if (e.headers && ((e.headers.request || []).length || (e.headers.response || []).length)) {
      headers = '<h4 class="sub">Request</h4><pre>' + esc((e.headers.request || []).join("\\n") || "None recorded") + '</pre><h4 class="sub">Response</h4><pre>' + esc((e.headers.response || []).join("\\n") || "None recorded") + "</pre>";
    }
    body.querySelector('[data-pane="explained"]').innerHTML = explained;
    body.querySelector('[data-pane="timing"]').innerHTML = timing;
    body.querySelector('[data-pane="connection"]').innerHTML = connection;
    body.querySelector('[data-pane="headers"]').innerHTML = headers;
  }
  function formatTotal(msValue) { return msValue >= 1000 ? (msValue / 1000).toFixed(2) + "s" : Math.round(msValue * 10) / 10 + "ms"; }
  function selectTab(name) {
    body.querySelectorAll("[data-tab]").forEach(function (b) { b.setAttribute("aria-selected", b.getAttribute("data-tab") === name ? "true" : "false"); });
    body.querySelectorAll("[data-pane]").forEach(function (p) { p.hidden = p.getAttribute("data-pane") !== name; });
  }
  function show(key, el) {
    var e = EXPLAIN[key];
    if (!e) return;
    if (selected) selected.classList.remove("is-selected");
    selected = el;
    if (selected) selected.classList.add("is-selected");
    document.getElementById("insp-title").textContent = e.title;
    var verdict = document.getElementById("insp-verdict");
    verdict.textContent = e.verdict;
    verdict.className = "verdict tone-" + e.tone;
    fill(e);
    selectTab("explained");
    var link = document.getElementById("insp-link");
    if (e.requestId != null) {
      link.innerHTML = '<a href="#req-' + esc(e.requestId) + '">Show this request in the waterfall</a>';
      link.hidden = false;
    } else {
      link.hidden = true;
    }
    empty.hidden = true;
    body.hidden = false;
    if (layout.classList.contains("details-hidden")) setDetailsHidden(false);
    inspector.classList.add("is-open");
    inspector.scrollTop = 0;
  }
  function closeInspector() {
    setDetailsHidden(true);
    toggle.focus();
  }
  var seq = document.getElementById("sequence");
  seq.addEventListener("click", function (ev) {
    var el = ev.target.closest("[data-key]");
    if (el) show(el.getAttribute("data-key"), el);
  });
  seq.addEventListener("keydown", function (ev) {
    if ((ev.key === "Enter" || ev.key === " ") && ev.target.classList && ev.target.classList.contains("seq-row")) {
      ev.preventDefault();
      show(ev.target.getAttribute("data-key"), ev.target);
    }
  });
  body.querySelector(".insp-tabs").addEventListener("click", function (ev) {
    var tab = ev.target.closest("[data-tab]");
    if (tab) selectTab(tab.getAttribute("data-tab"));
  });
  document.getElementById("explain-close").addEventListener("click", closeInspector);
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape" && inspector.classList.contains("is-open")) closeInspector(); });

  // Hover (or keyboard focus) on any [data-tip] label shows its explanation.
  var tipBox = document.getElementById("tip-box");
  var tipTarget = null;
  function showTip(el) {
    if (tipTarget && tipTarget !== el) tipTarget.removeAttribute("aria-describedby");
    tipTarget = el;
    el.setAttribute("aria-describedby", "tip-box");
    tipBox.textContent = el.getAttribute("data-tip");
    tipBox.hidden = false;
    var r = el.getBoundingClientRect();
    var w = tipBox.offsetWidth, h = tipBox.offsetHeight;
    var left = Math.min(Math.max(8, r.left + r.width / 2 - w / 2), window.innerWidth - w - 8);
    var top = r.top - h - 8 < 8 ? r.bottom + 8 : r.top - h - 8;
    tipBox.style.left = left + "px";
    tipBox.style.top = Math.max(8, Math.min(top, window.innerHeight - h - 8)) + "px";
  }
  function hideTip() {
    tipBox.hidden = true;
    if (tipTarget) tipTarget.removeAttribute("aria-describedby");
    tipTarget = null;
  }
  document.addEventListener("mouseover", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) showTip(el); else hideTip();
  });
  document.addEventListener("focusin", function (ev) {
    var el = ev.target.closest && ev.target.closest("[data-tip]");
    if (el) showTip(el); else hideTip();
  });
  window.addEventListener("scroll", hideTip, true);
  document.addEventListener("mouseout", function (ev) { if (!ev.relatedTarget) hideTip(); });
  document.addEventListener("keydown", function (ev) { if (ev.key === "Escape") hideTip(); });

  // Details panel can be hidden to give the sequence the full width.
  var layout = document.getElementById("sequence");
  var toggle = document.getElementById("toggle-details");
  function setDetailsHidden(hidden) {
    layout.classList.toggle("details-hidden", hidden);
    inspector.hidden = hidden;
    inspector.classList.toggle("is-open", !hidden);
    toggle.textContent = hidden ? "Show details panel" : "Hide details panel";
    toggle.setAttribute("aria-expanded", hidden ? "false" : "true");
    document.getElementById("explain-close").setAttribute("aria-expanded", hidden ? "false" : "true");
    try { localStorage.setItem("socketmap-details-hidden", hidden ? "1" : "0"); } catch (e) { /* storage may be blocked */ }
  }
  toggle.addEventListener("click", function () { setDetailsHidden(!layout.classList.contains("details-hidden")); });
  try { if (localStorage.getItem("socketmap-details-hidden") === "1") setDetailsHidden(true); } catch (e) { /* storage may be blocked */ }

  // Copy buttons for request IDs. Falls back to selecting the ID when the clipboard is blocked.
  document.addEventListener("click", function (ev) {
    var button = ev.target.closest && ev.target.closest("[data-copy]");
    if (!button) return;
    var label = button.textContent;
    function done(text) { button.textContent = text; setTimeout(function () { button.textContent = label; }, 1800); }
    function select() {
      var code = button.previousElementSibling;
      if (code && window.getSelection) { var range = document.createRange(); range.selectNodeContents(code); var sel = window.getSelection(); sel.removeAllRanges(); sel.addRange(range); }
      done("Press Ctrl+C");
    }
    if (navigator.clipboard && navigator.clipboard.writeText) navigator.clipboard.writeText(button.getAttribute("data-copy")).then(function () { done("Copied"); }, select);
    else select();
  });

  document.getElementById("copy-summary").addEventListener("click", function () {
    var text = document.getElementById("summary-text");
    var status = document.getElementById("copy-status");
    function done() { status.textContent = "Copied"; setTimeout(function () { status.textContent = ""; }, 2000); }
    function fallback() {
      text.focus();
      text.select();
      var copied = false;
      try { copied = document.execCommand("copy"); } catch (e) { /* manual selection remains available */ }
      if (copied) done(); else status.textContent = "Summary selected. Press Ctrl+C or Command+C to copy.";
    }
    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(text.value).then(done, fallback);
    } else { fallback(); }
  });
  document.getElementById("save-summary").addEventListener("click", function () {
    var link = document.createElement("a");
    var url = URL.createObjectURL(new Blob([document.getElementById("summary-text").value], { type: "text/plain;charset=utf-8" }));
    link.href = url;
    link.download = "socketmap-ai-summary.txt";
    document.body.appendChild(link);
    link.click();
    setTimeout(function () { URL.revokeObjectURL(url); link.remove(); }, 1000);
  });
  var glossarySearch = document.getElementById("glossary-search");
  if (glossarySearch) glossarySearch.addEventListener("input", function () {
    var query = glossarySearch.value.trim().toLowerCase();
    var shown = 0;
    document.querySelectorAll("[data-glossary]").forEach(function (entry) {
      entry.hidden = entry.textContent.toLowerCase().indexOf(query) < 0;
      if (!entry.hidden) shown++;
    });
    document.getElementById("glossary-status").textContent = shown ? shown + " terms shown" : "No matching terms. Try a broader search.";
  });

  applyFilter();
  route();
})();
</script>
${diagnosticsScript()}
${policyScript(buildPolicyEvidence(model, analysis))}
${eventReplayScript()}
</body>
</html>
`;
}
