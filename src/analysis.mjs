/**
 * Capture analysis: page selection, Good / Better / Best / Poor ratings per host,
 * evidence-based findings, time breakdown, and the AI-ready text summary.
 *
 * Input is the capture model from the NetLog analyzer. Every finding cites values
 * from that model; nothing is inferred beyond the documented thresholds below.
 * No Node APIs: runs in the browser as well.
 */

import { formatDuration, formatBytes } from "./normalizer.mjs";
import { redactCapturedText } from "./redact.mjs";
import { buildDiagnosticEvidenceText } from "./diagnostic-insights.mjs";
import { buildCoverage, coverageText } from "./coverage.mjs";
import { buildServerInsights, inspectResponse, serverInsightsText } from "./server-insights.mjs";
import { harEvidenceText } from "./enrichment.mjs";
import { profileEvidenceText } from "./profile.mjs";

const RANK = { best: 0, better: 1, good: 2, poor: 3 };
const TIMING_KEYS = ["redirect", "queue", "proxy", "dns", "connect", "tls", "stalled", "send", "wait", "download"];
export const TIMING_LABELS = {
  redirect: "Redirects",
  queue: "Browser queue",
  proxy: "Proxy lookup",
  dns: "DNS",
  connect: "TCP / QUIC connect",
  tls: "TLS handshake",
  stalled: "Waiting for connection",
  send: "Sending request",
  wait: "Server wait",
  download: "Download"
};

// Thresholds in milliseconds. Starting defaults; tune here.
export const THRESHOLDS = {
  dns: { better: 20, good: 100 },
  connection: { better: 100, good: 300 },
  server: { best: 200, better: 500, good: 1000 },
  proxyLookup: 100,
  queueing: 100
};

const SEVERITY_ORDER = { high: 0, medium: 1, info: 2 };

const rating = (level, value) => ({ level, value });
const worst = (levels) => levels.filter(l => l in RANK).sort((a, b) => RANK[b] - RANK[a])[0] || "unknown";
const ms = (v) => (v == null ? "not recorded" : formatDuration(v));

/** Connection timing is absent unless the capture recorded at least one setup phase. */
function connectionSetupMs(connection) {
  const phases = [connection?.connectMs, connection?.tlsMs].filter(value => typeof value === "number");
  return phases.length ? phases.reduce((total, value) => total + value, 0) : null;
}

function median(values) {
  const v = values.filter(x => x != null).sort((a, b) => a - b);
  if (!v.length) return null;
  const mid = Math.floor(v.length / 2);
  return v.length % 2 ? v[mid] : (v[mid - 1] + v[mid]) / 2;
}

function isLocalHost(host) {
  return host === "localhost" || host === "::1" || /^127\./.test(host || "");
}

function shortUrl(url, max = 120) {
  if (!url) return "";
  return url.length > max ? `${url.slice(0, max - 3)}...` : url;
}

/** Picks the page the user most likely loaded: a real site with a main-frame load and the most requests. */
export function selectPageSite(model) {
  const sites = model.pages.filter(p => !p.isBackground);
  // With a HAR loaded, the page it describes is the page the person cares about.
  if (model.enrichment?.perRequest?.size) {
    const matched = new Map();
    for (const request of model.requests || []) if (model.enrichment.perRequest.has(request.id)) matched.set(request.site, (matched.get(request.site) || 0) + 1);
    const best = sites.filter(p => matched.get(p.site)).sort((a, b) => matched.get(b.site) - matched.get(a.site) || b.requestCount - a.requestCount)[0];
    if (best) return best.site;
  }
  const loaded = sites.filter(p => p.url);
  return (loaded[0] || sites[0] || model.pages[0])?.site ?? null;
}

function rateHost(host, requests, connections, dnsLookups) {
  const conns = [...new Map(requests.map(r => [r.connectionId, connections.get(r.connectionId)])).values()].filter(Boolean);
  const fresh = conns.filter(c => requests.some(r => r.connectionId === c.id && r.reusedConnection === false));
  const ips = [...new Set(conns.map(c => c.remoteIp).filter(Boolean))];

  // Protocol: most common protocol actually used.
  const protoCounts = {};
  for (const r of requests) if (r.protocol) protoCounts[r.protocol] = (protoCounts[r.protocol] || 0) + 1;
  const protoList = Object.entries(protoCounts).sort((a, b) => b[1] - a[1]);
  let protocol;
  if (!protoList.length) {
    const quicError = conns.find(c => c.kind === "quic" && c.error);
    protocol = rating("unknown", quicError ? `Protocol not recorded; QUIC error: ${quicError.error}` : "Not recorded");
  }
  else {
    const dominant = protoList[0][0];
    const value = protoList.map(([p, n]) => (protoList.length > 1 ? `${p} (${n})` : p)).join(", ");
    protocol = rating({ h3: "best", h2: "better", "http/1.1": "good" }[dominant] || "unknown", value);
  }

  // TLS: weakest version negotiated.
  const versions = [...new Set(conns.map(c => c.tlsVersion).filter(Boolean))];
  let tls;
  if (!versions.length) {
    tls = requests.length && requests.every(r => r.scheme === "http")
      ? rating("unknown", "Not encrypted (HTTP)")
      : rating("unknown", "TLS version not recorded");
  } else {
    const levelOf = (v) => (v.includes("1.3") ? "best" : v.includes("1.2") ? "better" : "poor");
    const weakest = versions.sort((a, b) => RANK[levelOf(b)] - RANK[levelOf(a)])[0];
    tls = rating(levelOf(weakest), versions.join(", "));
  }

  // Connection setup: slowest new connection made during the capture.
  let connection;
  const failedConn = conns.find(c => c.error);
  const linkedRequests = requests.filter(r => r.connectionId && connections.has(r.connectionId));
  const allExplicitlyReused = linkedRequests.length > 0 && linkedRequests.every(r => r.reusedConnection === true);
  const setupTimes = fresh.map(connectionSetupMs).filter(value => value != null);
  if (failedConn) connection = rating("poor", `Failed: ${failedConn.error}`);
  else if (allExplicitlyReused) connection = rating("best", "Reused existing connection");
  else if (!setupTimes.length) connection = rating("unknown", "Setup timing not recorded");
  else {
    const setup = Math.max(...setupTimes);
    const t = THRESHOLDS.connection;
    connection = rating(setup < t.better ? "better" : setup <= t.good ? "good" : "poor", `${ms(setup)} to set up`);
  }

  // DNS: slowest lookup for this host during the capture.
  const lookups = dnsLookups.filter(d => d.host === host);
  const dnsTimes = [...lookups.map(d => d.durationMs), ...fresh.map(c => c.dnsMs)].filter(v => v != null);
  const dnsError = lookups.find(d => d.error);
  let dns;
  if (dnsError) dns = rating("poor", `Lookup failed: ${dnsError.error}`);
  else if (!dnsTimes.length) dns = rating("unknown", "Lookup timing not recorded");
  else {
    const slowest = Math.max(...dnsTimes);
    const t = THRESHOLDS.dns;
    dns = rating(slowest < t.better ? "better" : slowest <= t.good ? "good" : "poor", `${ms(slowest)} lookup`);
  }

  // Path: direct, through a proxy, or a private-root certificate that needs review.
  const proxies = [...new Set(requests.map(r => r.proxy).filter(Boolean))];
  const viaProxy = proxies.find(p => p !== "DIRECT");
  const inspected = conns.find(c => c.cert?.knownRoot === false);
  let path;
  if (inspected) path = rating("poor", `Private-root certificate: ${inspected.cert.issuer || "unknown issuer"}`);
  else if (viaProxy) path = rating("better", `Via ${viaProxy}`);
  else if (proxies.includes("DIRECT") || conns.some(c => c.kind === "quic")) path = rating("best", "Direct");
  else path = rating("unknown", "Not recorded");

  // Server response: median time from request sent to first response byte.
  const medianWait = median(requests.map(r => r.timing.wait));
  let server;
  if (medianWait == null) server = rating("unknown", "No responses");
  else {
    const t = THRESHOLDS.server;
    server = rating(medianWait < t.best ? "best" : medianWait <= t.better ? "better" : medianWait <= t.good ? "good" : "poor", `${ms(medianWait)} median`);
  }

  const ratings = { protocol, tls, connection, dns, path, server };
  const cert = conns.find(c => c.cert)?.cert || null;
  return {
    host,
    requests: requests.length,
    ips,
    proxy: viaProxy || (proxies.includes("DIRECT") ? "DIRECT" : null),
    cert: cert ? { issuer: cert.issuer, issuerOrg: cert.issuerOrg, root: cert.root, knownRoot: cert.knownRoot } : null,
    bytesWire: requests.some(r => r.bytesWire != null) ? requests.reduce((s, r) => s + (r.bytesWire || 0), 0) : null,
    totalMs: requests.reduce((s, r) => s + (r.durationMs || 0), 0),
    medianWaitMs: medianWait,
    ratings,
    overall: worst(Object.values(ratings).map(r => r.level))
  };
}

function buildFindings(pageRequests, hosts, connections, dnsLookups, profile = null) {
  const findings = [];
  const add = (f) => { if (f.evidence.length) findings.push(f); };
  const pageHosts = new Set(pageRequests.map(r => r.host));

  const usedConns = [...new Set(pageRequests.map(r => r.connectionId).filter(Boolean))].map(id => connections.get(id));
  add({
    id: "tls-inspection",
    severity: "high",
    title: "Private-root certificates observed",
    detail: "The capture records certificates that chain to a non-public root. This can be TLS inspection or a privately managed certificate; the capture alone does not prove which. Check the certificate verification result and your organization’s certificate policy before treating it as inspection.",
    evidence: usedConns.filter(c => c.cert?.knownRoot === false).map(c =>
      `${c.host} (${c.remoteIp}): issued by ${c.cert.issuer || "unknown"}${c.cert.issuerOrg ? ` (${c.cert.issuerOrg})` : ""}, root ${c.cert.root || "unknown"}`),
    team: "Network security (proxy / SSL inspection policy)"
  });

  add({
    id: "proxy-auth",
    severity: "high",
    title: "Proxy asked for authentication (HTTP 407)",
    detail: "Each proxy authentication challenge adds round trips before the request can proceed.",
    evidence: pageRequests.filter(r => r.status === 407).map(r => `${shortUrl(r.url)} via ${r.proxy}`),
    team: "Network (proxy)"
  });

  add({
    id: "local-service",
    severity: "medium",
    title: "The page called a service on this computer or local network",
    detail: "Web pages sometimes talk to agents running on the machine (sign-in agents such as Okta Verify, sync clients, security tools). Slow or refused local calls can hold up sign-in or page scripts.",
    evidence: pageRequests.filter(r => isLocalHost(r.host) || ["loopback", "local", "private"].includes(r.addressSpace)).map(r =>
      `${r.method || ""} ${shortUrl(r.url)}: ${r.netError || r.status || "no response"} after ${ms(r.durationMs)}${r.addressSpace ? ` (address space: ${r.addressSpace})` : ""}`),
    team: "Endpoint / desktop engineering, identity team"
  });

  const byProxy = new Map();
  for (const r of pageRequests) {
    if (!r.proxy || r.proxy === "DIRECT") continue;
    const e = byProxy.get(r.proxy) || { count: 0, hosts: new Set(), lookup: 0 };
    e.count++;
    e.hosts.add(r.host);
    e.lookup = Math.max(e.lookup, r.timing.proxy || 0);
    byProxy.set(r.proxy, e);
  }
  add({
    id: "proxy",
    severity: "medium",
    title: "Traffic goes through a proxy",
    detail: "Proxied requests pay for the extra hop and any filtering the proxy does. Check whether these destinations should bypass the proxy.",
    evidence: [...byProxy].map(([p, e]) => `${p}: ${e.count} request(s) to ${[...e.hosts].join(", ")}; proxy lookup up to ${ms(e.lookup)}`),
    team: "Network (proxy / PAC file)"
  });

  add({
    id: "slow-proxy-lookup",
    severity: "medium",
    title: "Deciding whether to use a proxy was slow",
    detail: `Chrome spent over ${THRESHOLDS.proxyLookup} ms evaluating proxy settings (often a PAC script) before connecting.`,
    evidence: pageRequests.filter(r => (r.timing.proxy || 0) > THRESHOLDS.proxyLookup).map(r => `${shortUrl(r.url)}: ${ms(r.timing.proxy)}`),
    team: "Network (PAC file / WPAD)"
  });

  add({
    id: "failed-requests",
    severity: "medium",
    title: "Requests that failed",
    detail: "Failed requests can trigger retries or leave parts of the page waiting.",
    evidence: pageRequests.filter(r => (r.netError && r.netError !== "ERR_ABORTED") || (r.status >= 400 && r.status !== 407)).map(r =>
      `${r.method || ""} ${shortUrl(r.url)}: ${r.netError || `HTTP ${r.status}`}`),
    team: "Depends on the host: see each request"
  });

  add({
    id: "slow-server",
    severity: "medium",
    title: "Servers that were slow to respond",
    detail: `These requests waited over ${formatDuration(THRESHOLDS.server.good)} between sending the request and the first byte of the response. That time is spent at the server or anything in front of it.`,
    evidence: pageRequests.filter(r => (r.timing.wait || 0) > THRESHOLDS.server.good).sort((a, b) => b.timing.wait - a.timing.wait).map(r => {
      const reported = inspectResponse(r)?.largest;
      return `${shortUrl(r.url)}: ${ms(r.timing.wait)} server wait${reported ? `; the server reported ${reported.name} at ${ms(reported.dur)} of it` : ""}`;
    }),
    team: "Application owner or service vendor"
  });

  const freshConns = usedConns.filter(c => pageRequests.some(r => r.connectionId === c.id && r.reusedConnection === false));
  add({
    id: "slow-connection",
    severity: "medium",
    title: "Slow connection setup",
    detail: `New connections with recorded setup time over ${THRESHOLDS.connection.good} ms (TCP plus TLS, or the QUIC handshake). Distance, packet loss, or an intermediary are possibilities; compare another capture to narrow the cause.`,
    evidence: freshConns.filter(c => connectionSetupMs(c) > THRESHOLDS.connection.good).map(c =>
      `${c.host} (${c.remoteIp}): connect ${ms(c.connectMs)}${c.tlsMs != null ? ` + TLS ${ms(c.tlsMs)}` : ""}`),
    team: "Network"
  });

  add({
    id: "slow-dns",
    severity: "medium",
    title: "Slow or failed DNS lookups",
    detail: `Lookups that took over ${THRESHOLDS.dns.good} ms or failed.`,
    evidence: dnsLookups.filter(d => pageHosts.has(d.host) && (d.error || (d.durationMs || 0) > THRESHOLDS.dns.good)).map(d =>
      `${d.host}: ${d.error || ms(d.durationMs)}`),
    team: "Network (DNS)"
  });

  add({
    id: "quic-failed",
    severity: "medium",
    title: "QUIC (HTTP/3) connections failed",
    detail: "The capture records QUIC connection errors. A firewall, UDP path, server behavior, or a transient network condition could contribute. This alone does not prove a block or a TCP fallback; compare a successful capture or inspect the matching request protocol.",
    evidence: usedConns.filter(c => c.kind === "quic" && c.error).map(c => `${c.host} (${c.remoteIp || "no address"}): ${c.error}`),
    team: "Network (firewall / UDP 443)"
  });

  add({
    id: "queueing",
    severity: "info",
    title: "Requests waited inside the browser",
    detail: `Requests that waited over ${THRESHOLDS.queueing} ms before or while getting a connection, typically because of the browser's per-host connection limit or a busy proxy.`,
    evidence: pageRequests.filter(r => (r.timing.queue || 0) + (r.timing.stalled || 0) > THRESHOLDS.queueing).map(r =>
      `${shortUrl(r.url)}: ${ms((r.timing.queue || 0) + (r.timing.stalled || 0))}`),
    team: "Usually none: note it if it coincides with a proxy or HTTP/1.1"
  });

  add({
    id: "http1",
    severity: "info",
    title: "Hosts using HTTP/1.1",
    detail: "HTTP/1.1 allows only six parallel connections per host, so busy pages queue. Proxies that do not support HTTP/2 force this.",
    evidence: hosts.filter(h => h.ratings.protocol.value.startsWith("http/1.1") && h.requests > 1).map(h => `${h.host}: ${h.requests} requests`),
    team: "Network (proxy) or application owner"
  });

  const thread = profile?.mainThread;
  if (thread && thread.blockingMs >= 200) {
    const file = (url) => (String(url || "").split("?")[0].split("/").filter(Boolean).slice(-1)[0]) || url || "inline script";
    add({
      id: "main-thread-busy",
      severity: thread.blockingMs >= 500 ? "high" : "medium",
      title: "The page's own code kept the main thread busy",
      detail: `The Performance profile shows ${thread.longTaskCount} long task${thread.longTaskCount === 1 ? "" : "s"} (over 50 ms) on the page's main thread, ${formatDuration(thread.blockingMs)} beyond that threshold in total. While the main thread is busy the page cannot respond or paint. This is consistent with the delay being work on the computer rather than the network; it does not prove which script is at fault, because scripts started by other scripts can be attributed to the wrong file.`,
      evidence: (thread.longTasks || []).slice(0, 8).map(task => `+${formatDuration(task.startMs)}: ${formatDuration(task.durMs)}${task.top.length ? ` (${task.top.map(s => `${file(s.url)} ${formatDuration(s.ms)}`).join(", ")})` : ""}`),
      team: "Application owner or front-end developers"
    });
  }

  return findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);
}

/**
 * Analyzes one page of a capture.
 * @param {object} model  capture model from the NetLog analyzer
 * @param {{ site?: string }} options  site: page to analyze (defaults to the loaded page)
 */
export function analyzeCapture(model, { site } = {}) {
  const pageSite = site || selectPageSite(model);
  const pageRequests = model.requests.filter(r => r.site === pageSite);
  if (!model.requests.length && !site) {
    return {
      page: { site: "capture", url: "No page-level HTTP requests recorded", startMs: null, endMs: null, loadMs: null, requestCount: 0, hostCount: 0, bytesWire: null },
      pageRequests: [], hosts: [], breakdown: Object.fromEntries(TIMING_KEYS.map(key => [key, null])), findings: [], slowest: [], background: []
    };
  }
  if (!pageRequests.length) {
    throw new Error(`No requests for page "${pageSite}". Pages in this capture: ${model.pages.map(p => p.site).join(", ")}`);
  }
  const connections = new Map(model.connections.map(c => [c.id, c]));

  const byHost = new Map();
  for (const r of pageRequests) {
    if (!byHost.has(r.host)) byHost.set(r.host, []);
    byHost.get(r.host).push(r);
  }
  const hosts = [...byHost].map(([h, reqs]) => rateHost(h, reqs, connections, model.dnsLookups))
    .sort((a, b) => RANK[b.overall] - RANK[a.overall] || b.totalMs - a.totalMs);

  const breakdown = Object.fromEntries(TIMING_KEYS.map(k => {
    const values = pageRequests.map(r => r.timing[k]).filter(value => value != null);
    return [k, values.length ? values.reduce((sum, value) => sum + value, 0) : null];
  }));
  const startMs = Math.min(...pageRequests.map(r => r.start));
  const complete = pageRequests.every(r => r.end != null && r.endRecorded !== false);
  const endMs = complete ? Math.max(...pageRequests.map(r => r.end)) : null;
  const observedEndMs = Math.max(...pageRequests.map(r => r.observedEnd ?? r.end ?? r.start));
  const pageInfo = model.pages.find(p => p.site === pageSite);

  return {
    page: {
      site: pageSite,
      url: pageInfo?.url || pageRequests[0].url,
      startMs,
      endMs,
      loadMs: endMs == null ? null : endMs - startMs,
      observedSpanMs: observedEndMs - startMs,
      requestCount: pageRequests.length,
      hostCount: hosts.length,
      bytesWire: pageRequests.some(r => r.bytesWire != null) ? pageRequests.reduce((s, r) => s + (r.bytesWire || 0), 0) : null
    },
    pageRequests,
    hosts,
    breakdown,
    findings: buildFindings(pageRequests, hosts, connections, model.dnsLookups, model.profile || null),
    slowest: [...pageRequests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
    background: model.pages.filter(p => p.site !== pageSite)
  };
}

const SUMMARY_FINDING_EVIDENCE_LIMIT = 6;
const SUMMARY_HOST_LIMIT = 12;
const SUMMARY_REQUEST_LIMIT = 15;
const SUMMARY_CONNECTION_LIMIT = 12;

function bounded(items, limit) {
  return { shown: items.slice(0, limit), omitted: Math.max(0, items.length - limit) };
}

function listOrRecorded(values) {
  if (!Array.isArray(values) || !values.length) return "not recorded";
  return values.map(value => {
    if (typeof value === "string") return value;
    if (value && typeof value === "object") {
      return `${value.proxyUri || "proxy URI not recorded"}${value.badUntil != null ? ` (bad until ${value.badUntil})` : ""}`;
    }
    return String(value);
  }).join(", ");
}

function requestSummary(r) {
  const phases = TIMING_KEYS.filter(k => r.timing[k] != null)
    .map(k => `${TIMING_LABELS[k]}=${formatDuration(r.timing[k])}`).join(", ");
  const outcome = r.netError || (r.status != null ? `HTTP ${r.status}${r.statusText ? ` ${r.statusText}` : ""}` : r.fromCache ? "cache" : "not recorded");
  return `#${r.id}: ${r.method || "method not recorded"} ${r.url || "URL not recorded"}; ${outcome}; protocol ${r.protocol || "not recorded"}; total ${r.endRecorded === false ? "not recorded (request end absent)" : formatDuration(r.durationMs)}; connection ${r.connectionId || "not recorded"}${r.reusedConnection == null ? " (reuse not recorded)" : r.reusedConnection ? " (reused)" : " (new)"}${r.proxy ? `; proxy ${r.proxy}` : ""}${r.redirects?.length ? `; redirects ${r.redirects.join(" -> ")}` : ""}${phases ? `; ${phases}` : ""}`;
}

function connectionSummary(c) {
  const cert = c.cert
    ? `${c.cert.subject || "subject not recorded"}, issuer ${c.cert.issuer || "not recorded"}, root ${c.cert.root || "not recorded"}, public root ${c.cert.knownRoot == null ? "not recorded" : c.cert.knownRoot ? "yes" : "no"}`
    : "not recorded";
  return `${c.id}: ${c.kind || "kind not recorded"}; host ${c.host || "not recorded"}; remote ${c.remoteIp || "not recorded"}${c.remotePort != null ? `:${c.remotePort}` : ""}; DNS ${ms(c.dnsMs)}, connect ${ms(c.connectMs)}, TLS ${ms(c.tlsMs)}; ${c.tlsVersion || "TLS not recorded"}${c.alpn ? ` / ${c.alpn}` : ""}; certificate ${cert}${c.error ? `; error ${c.error}` : ""}`;
}

function missingCaptureData(model, analysis) {
  const env = model.environment || {};
  const missing = [];
  if (!env.polledDataPresent) missing.push("polledData was absent, so browser DNS and proxy configuration was not recorded");
  if (!env.browser) missing.push("browser identity");
  if (!env.os) missing.push("operating system");
  if (!env.captureStartedAt || env.captureDurationMs == null) missing.push("capture wall-clock timing");
  if (!env.localAddresses?.length) missing.push("local address");
  if (!env.dns?.servers?.length) missing.push("DNS servers");
  if (!env.proxy?.mode || env.proxy.mode === "unknown") missing.push("proxy configuration");
  const noConnection = analysis.pageRequests.filter(r => !r.connectionId).length;
  if (noConnection) missing.push(`${noConnection} analyzed request(s) without a linked connection`);
  const noOutcome = analysis.pageRequests.filter(r => r.status == null && !r.netError && !r.fromCache).length;
  if (noOutcome) missing.push(`${noOutcome} analyzed request(s) without a recorded outcome`);
  const unfinished = analysis.pageRequests.filter(r => r.endRecorded === false).length;
  if (unfinished) missing.push(`${unfinished} analyzed request(s) without a recorded end; completion duration is unavailable`);
  return missing;
}

/** Plain-text summary sized to paste into an AI assistant. */
export function buildAiSummary(model, analysis, { source } = {}) {
  const env = model.environment;
  const { page } = analysis;
  const lines = [];
  const sourceName = typeof source?.name === "string" ? redactCapturedText(source.name) : null;
  lines.push("SocketMap NetLog evidence packet (secrets removed).");
  lines.push("Purpose: provide data-driven insights into a page load using recorded browser network data.");
  lines.push("");
  lines.push("CAPTURE PROVENANCE AND SCOPE");
  lines.push(`Source: ${sourceName || "not recorded"}${source?.bytes != null ? ` (${formatBytes(source.bytes)})` : ""}.`);
  lines.push(`Capture: ${env.browser || "unknown browser"}${env.browserInfo?.channel ? `, channel ${env.browserInfo.channel}` : ""}${env.browserInfo?.build ? `, build ${env.browserInfo.build}` : ""}; OS ${env.os || "unknown OS"}; started ${env.captureStartedAt || "not recorded"}; duration ${ms(env.captureDurationMs)}; mode ${env.captureMode || "not recorded"}.`);
  lines.push(`Capture totals: ${model.requests.length} request(s), ${model.connections.length} linked connection(s), ${model.dnsLookups.length} DNS lookup(s), ${model.stats?.events ?? "not recorded"} NetLog event(s), ${model.stats?.sources ?? "not recorded"} source(s).`);
  lines.push(`Analyzed page: site ${page.site || "not recorded"}; URL ${page.url || "not recorded"}; ${page.requestCount} request(s) to ${page.hostCount} host(s); ${ms(page.loadMs)} from first request to last response; ${formatBytes(page.bytesWire) || "not recorded"} transferred.`);
  lines.push(`Excluded scope: ${analysis.background.length ? `${analysis.background.reduce((sum, item) => sum + item.requestCount, 0)} request(s) across ${analysis.background.length} other site(s): ${analysis.background.map(item => `${item.site} (${item.requestCount})`).join(", ")}` : "none recorded"}.`);
  lines.push(`Client and resolver: local address ${listOrRecorded(env.localAddresses)}; DNS servers ${listOrRecorded(env.dns?.servers)}${env.dns?.serverAddresses?.length ? ` (recorded addresses ${env.dns.serverAddresses.join(", ")})` : ""}${env.dns?.search?.length ? `; search ${env.dns.search.join(", ")}` : ""}; secure DNS ${env.dns?.secureDns || "not recorded"}; DoH ${listOrRecorded(env.dns?.dohServers)}.`);
  lines.push(`DNS configuration: timeout ${env.dns?.timeoutSeconds == null ? "not recorded" : `${env.dns.timeoutSeconds} seconds`}; attempts ${env.dns?.attempts ?? "not recorded"}; rotate ${env.dns?.rotate == null ? "not recorded" : env.dns.rotate}; hosts entries ${env.dns?.hostsPresent == null ? "not recorded" : env.dns.hostsPresent ? "present" : "none recorded"}.`);
  lines.push(`Proxy configuration: ${env.proxy?.mode || "not recorded"}${env.proxy?.detail ? ` (${env.proxy.detail})` : ""}; PAC ${env.proxy?.pacUrl || "not recorded"}; auto-detect ${env.proxy?.autoDetect == null ? "not recorded" : env.proxy.autoDetect}; fixed servers ${listOrRecorded(env.proxy?.fixedServers)}; bad proxies ${listOrRecorded(env.proxy?.badProxies)}.`);
  lines.push("");
  lines.push("DERIVED FROM RECORDED REQUEST TIMINGS: TOTALS (summed across overlapping requests)");
  for (const [k, v] of Object.entries(analysis.breakdown).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${TIMING_LABELS[k]}: ${formatDuration(v)}`);
  }
  lines.push("");
  lines.push("DERIVED FROM RECORDED DATA: BUILT-IN FINDINGS");
  if (!analysis.findings.length) lines.push("- None of the built-in checks fired.");
  for (const f of analysis.findings) {
    lines.push(`- [${f.severity.toUpperCase()}] ${f.title}. Team: ${f.team}.`);
    const evidence = bounded(f.evidence, SUMMARY_FINDING_EVIDENCE_LIMIT);
    for (const e of evidence.shown) lines.push(`  - ${e}`);
    if (evidence.omitted) lines.push(`  - ...${evidence.omitted} more matching observation(s) omitted`);
  }
  lines.push("");
  lines.push("DERIVED FROM RECORDED DATA: HOST RATINGS (best / better / good / poor)");
  const hosts = bounded(analysis.hosts, SUMMARY_HOST_LIMIT);
  for (const h of hosts.shown) {
    const r = h.ratings;
    const cert = h.cert ? `${h.cert.issuer || "unknown issuer"}${h.cert.knownRoot === false ? " (PRIVATE ROOT)" : h.cert.knownRoot ? " (public root)" : ""}` : "not recorded";
    lines.push(`- ${h.host} [${h.overall}] IPs ${h.ips.join(", ") || "not recorded"}; ${h.requests} req; protocol ${r.protocol.value} (${r.protocol.level}); ${r.tls.value} (${r.tls.level}); cert ${cert}; connection ${r.connection.value} (${r.connection.level}); DNS ${r.dns.value} (${r.dns.level}); path ${r.path.value} (${r.path.level}); server ${r.server.value} (${r.server.level})`);
  }
  if (hosts.omitted) lines.push(`- ...${hosts.omitted} more host(s) omitted`);
  lines.push("");
  lines.push("RECORDED CONNECTION DETAILS");
  const pageConnectionIds = new Set(analysis.pageRequests.map(r => r.connectionId).filter(Boolean));
  const connections = bounded(model.connections.filter(c => pageConnectionIds.has(c.id)), SUMMARY_CONNECTION_LIMIT);
  for (const c of connections.shown) lines.push(`- ${connectionSummary(c)}`);
  if (connections.omitted) lines.push(`- ...${connections.omitted} more connection(s) omitted`);
  lines.push("");
  lines.push("RECORDED REQUEST DETAILS: SLOWEST ANALYZED REQUESTS (full redacted URLs)");
  const requests = bounded([...analysis.pageRequests].sort((a, b) => b.durationMs - a.durationMs), SUMMARY_REQUEST_LIMIT);
  for (const r of requests.shown) lines.push(`- ${requestSummary(r)}`);
  if (requests.omitted) lines.push(`- ...${requests.omitted} more request(s) omitted`);
  lines.push("");
  const exceptional = analysis.pageRequests.filter(r => r.netError || (r.status != null && r.status >= 400) || r.redirects?.length);
  if (exceptional.length) {
    lines.push("RECORDED REQUEST DETAILS: FAILURES AND REDIRECTS");
    const exceptions = bounded(exceptional, SUMMARY_REQUEST_LIMIT);
    for (const r of exceptions.shown) lines.push(`- ${requestSummary(r)}`);
    if (exceptions.omitted) lines.push(`- ...${exceptions.omitted} more failure or redirect observation(s) omitted`);
    lines.push("");
  }
  const missing = missingCaptureData(model, analysis);
  lines.push(buildDiagnosticEvidenceText(model));
  lines.push("");
  lines.push(serverInsightsText(buildServerInsights(analysis.pageRequests)));
  lines.push("");
  if (model.enrichment) {
    lines.push(harEvidenceText(model.enrichment));
    lines.push("");
  }
  if (model.profile) {
    lines.push(profileEvidenceText(model.profile));
    lines.push("");
  }
  lines.push(coverageText(buildCoverage(model)));
  lines.push("");
  lines.push(`MISSING OR LIMITED DATA: ${missing.length ? missing.join("; ") : "No additional capture-model gaps identified by SocketMap"}. NetLog shows network activity only, not page JavaScript/CPU time, packet retransmissions, server internals, or security software acting inside the browser.`);
  lines.push("");
  lines.push("AI ANALYSIS INSTRUCTIONS");
  lines.push("1. Treat RECORDED sections as capture evidence. Treat DERIVED sections as SocketMap calculations or rule-based classifications, not independent observations. Do not turn missing values into defaults or facts.");
  lines.push("2. Label any causal explanation as a hypothesis, tie it to recorded evidence or a named derived rule, and state confidence.");
  lines.push("3. Recommend the smallest next test that could distinguish competing hypotheses, including the owner or team to involve.");
  return lines.join("\n");
}
