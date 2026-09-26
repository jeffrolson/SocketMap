/**
 * Capture analysis: page selection, Good / Better / Best / Poor ratings per host,
 * evidence-based findings, time breakdown, and the AI-ready text summary.
 *
 * Input is the capture model from the NetLog analyzer. Every finding cites values
 * from that model; nothing is inferred beyond the documented thresholds below.
 * No Node APIs: runs in the browser as well.
 */

import { formatDuration, formatBytes } from "./normalizer.mjs";

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
const ms = (v) => (v == null ? "n/a" : formatDuration(v));

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
  const loaded = sites.filter(p => p.url);
  return (loaded[0] || sites[0] || model.pages[0]).site;
}

function rateHost(host, requests, connections, dnsLookups) {
  const conns = [...new Map(requests.map(r => [r.connectionId, connections.get(r.connectionId)])).values()].filter(Boolean);
  const fresh = conns.filter(c => requests.some(r => r.connectionId === c.id && r.reusedConnection === false));
  const ips = [...new Set(conns.map(c => c.remoteIp).filter(Boolean))];

  // Protocol: most common protocol actually used.
  const protoCounts = {};
  for (const r of requests) if (r.protocol) protoCounts[r.protocol] = (protoCounts[r.protocol] || 0) + 1;
  const protoList = Object.entries(protoCounts).sort((a, b) => b[1] - a[1]);
  const quicFailed = conns.some(c => c.kind === "quic" && c.error) && protoCounts["h3"] === undefined;
  let protocol;
  if (quicFailed) protocol = rating("poor", "QUIC failed, fell back to TCP");
  else if (!protoList.length) protocol = rating("unknown", "Not recorded");
  else {
    const dominant = protoList[0][0];
    const value = protoList.map(([p, n]) => (protoList.length > 1 ? `${p} (${n})` : p)).join(", ");
    protocol = rating({ h3: "best", h2: "better", "http/1.1": "good" }[dominant] || "unknown", value);
  }

  // TLS: weakest version negotiated.
  const versions = [...new Set(conns.map(c => c.tlsVersion).filter(Boolean))];
  let tls;
  if (!versions.length) {
    tls = requests.every(r => r.scheme === "http") ? rating("unknown", "Not encrypted (http)") : rating("unknown", "Not recorded (connection opened before capture)");
  } else {
    const levelOf = (v) => (v.includes("1.3") ? "best" : v.includes("1.2") ? "better" : "poor");
    const weakest = versions.sort((a, b) => RANK[levelOf(b)] - RANK[levelOf(a)])[0];
    tls = rating(levelOf(weakest), versions.join(", "));
  }

  // Connection setup: slowest new connection made during the capture.
  let connection;
  const failedConn = conns.find(c => c.error);
  if (failedConn) connection = rating("poor", `Failed: ${failedConn.error}`);
  else if (!fresh.length) connection = rating("best", "Reused existing connection");
  else {
    const setup = Math.max(...fresh.map(c => (c.connectMs || 0) + (c.tlsMs || 0)));
    const t = THRESHOLDS.connection;
    connection = rating(setup < t.better ? "better" : setup <= t.good ? "good" : "poor", `${ms(setup)} to set up`);
  }

  // DNS: slowest lookup for this host during the capture.
  const lookups = dnsLookups.filter(d => d.host === host);
  const dnsTimes = [...lookups.map(d => d.durationMs), ...fresh.map(c => c.dnsMs)].filter(v => v != null);
  const dnsError = lookups.find(d => d.error);
  let dns;
  if (dnsError) dns = rating("poor", `Lookup failed: ${dnsError.error}`);
  else if (!dnsTimes.length || Math.max(...dnsTimes) === 0) dns = rating("best", "Cached (no lookup needed)");
  else {
    const slowest = Math.max(...dnsTimes);
    const t = THRESHOLDS.dns;
    dns = rating(slowest < t.better ? "better" : slowest <= t.good ? "good" : "poor", `${ms(slowest)} lookup`);
  }

  // Path: direct, through a proxy, or re-signed by a private root (inspection).
  const proxies = [...new Set(requests.map(r => r.proxy).filter(Boolean))];
  const viaProxy = proxies.find(p => p !== "DIRECT");
  const inspected = conns.find(c => c.cert?.knownRoot === false);
  let path;
  if (inspected) path = rating("poor", `Certificate from private root: ${inspected.cert.issuer || "unknown issuer"}`);
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
    bytesWire: requests.reduce((s, r) => s + (r.bytesWire || 0), 0),
    totalMs: requests.reduce((s, r) => s + (r.durationMs || 0), 0),
    medianWaitMs: medianWait,
    ratings,
    overall: worst(Object.values(ratings).map(r => r.level))
  };
}

function buildFindings(pageRequests, hosts, connections, dnsLookups) {
  const findings = [];
  const add = (f) => { if (f.evidence.length) findings.push(f); };
  const pageHosts = new Set(pageRequests.map(r => r.host));

  const usedConns = [...new Set(pageRequests.map(r => r.connectionId).filter(Boolean))].map(id => connections.get(id));
  add({
    id: "tls-inspection",
    severity: "high",
    title: "TLS inspection: certificates signed by a private root",
    detail: "The browser was handed certificates that chain to a root it does not recognize as public. That is what TLS inspection (SSL decryption) by a proxy or security agent looks like. Inspection adds processing to every connection and can break or slow protocols.",
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
    evidence: pageRequests.filter(r => (r.timing.wait || 0) > THRESHOLDS.server.good).sort((a, b) => b.timing.wait - a.timing.wait).map(r =>
      `${shortUrl(r.url)}: ${ms(r.timing.wait)} server wait`),
    team: "Application owner or service vendor"
  });

  const freshConns = usedConns.filter(c => pageRequests.some(r => r.connectionId === c.id && r.reusedConnection === false));
  add({
    id: "slow-connection",
    severity: "medium",
    title: "Slow connection setup",
    detail: `New connections that took over ${THRESHOLDS.connection.good} ms to open (TCP plus TLS, or the QUIC handshake). Distance, packet loss, or inspection devices are typical causes.`,
    evidence: freshConns.filter(c => (c.connectMs || 0) + (c.tlsMs || 0) > THRESHOLDS.connection.good).map(c =>
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
    detail: "QUIC runs over UDP port 443. Firewalls or inspection devices that block or interfere with it force a slower fallback to TCP.",
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

  const breakdown = Object.fromEntries(TIMING_KEYS.map(k => [k, pageRequests.reduce((s, r) => s + (r.timing[k] || 0), 0)]));
  const startMs = Math.min(...pageRequests.map(r => r.start));
  const endMs = Math.max(...pageRequests.map(r => r.end));
  const pageInfo = model.pages.find(p => p.site === pageSite);

  return {
    page: {
      site: pageSite,
      url: pageInfo?.url || pageRequests[0].url,
      startMs,
      endMs,
      loadMs: endMs - startMs,
      requestCount: pageRequests.length,
      hostCount: hosts.length,
      bytesWire: pageRequests.reduce((s, r) => s + (r.bytesWire || 0), 0)
    },
    pageRequests,
    hosts,
    breakdown,
    findings: buildFindings(pageRequests, hosts, connections, model.dnsLookups),
    slowest: [...pageRequests].sort((a, b) => b.durationMs - a.durationMs).slice(0, 10),
    background: model.pages.filter(p => p.site !== pageSite)
  };
}

/** Plain-text summary sized to paste into an AI assistant. */
export function buildAiSummary(model, analysis) {
  const env = model.environment;
  const { page } = analysis;
  const lines = [];
  lines.push("SocketMap summary of a Chrome NetLog capture (secrets removed).");
  lines.push("Question: why is this page slow, and which team should look at it?");
  lines.push("");
  lines.push(`Capture: ${env.browser || "unknown browser"} on ${env.os || "unknown OS"}, started ${env.captureStartedAt || "unknown"}, mode ${env.captureMode || "unknown"}.`);
  lines.push(`Client: local IP ${env.localAddresses.join(", ") || "not recorded"}; DNS servers ${env.dns.servers.join(", ") || "not recorded"}${env.dns.search.length ? ` (search: ${env.dns.search.join(", ")})` : ""}; proxy mode ${env.proxy.mode}${env.proxy.detail ? ` (${env.proxy.detail})` : ""}.`);
  lines.push(`Page: ${page.url} : ${page.requestCount} requests to ${page.hostCount} hosts, ${formatDuration(page.loadMs)} from first request to last response, ${formatBytes(page.bytesWire) || "0 B"} transferred.`);
  lines.push("");
  lines.push("Where the time went (summed across requests):");
  for (const [k, v] of Object.entries(analysis.breakdown).filter(([, v]) => v > 0).sort((a, b) => b[1] - a[1])) {
    lines.push(`- ${TIMING_LABELS[k]}: ${formatDuration(v)}`);
  }
  lines.push("");
  lines.push("Findings:");
  if (!analysis.findings.length) lines.push("- None of the built-in checks fired.");
  for (const f of analysis.findings) {
    lines.push(`- [${f.severity.toUpperCase()}] ${f.title}. Team: ${f.team}.`);
    for (const e of f.evidence.slice(0, 8)) lines.push(`  - ${e}`);
    if (f.evidence.length > 8) lines.push(`  - ...and ${f.evidence.length - 8} more`);
  }
  lines.push("");
  lines.push("Hosts (ratings: best / better / good / poor):");
  for (const h of analysis.hosts) {
    const r = h.ratings;
    const cert = h.cert ? `${h.cert.issuer || "unknown issuer"}${h.cert.knownRoot === false ? " (PRIVATE ROOT)" : h.cert.knownRoot ? " (public root)" : ""}` : "not recorded";
    lines.push(`- ${h.host} [${h.overall}] IPs ${h.ips.join(", ") || "n/a"}; ${h.requests} req; protocol ${r.protocol.value} (${r.protocol.level}); ${r.tls.value} (${r.tls.level}); cert ${cert}; connection ${r.connection.value} (${r.connection.level}); DNS ${r.dns.value} (${r.dns.level}); path ${r.path.value} (${r.path.level}); server ${r.server.value} (${r.server.level})`);
  }
  lines.push("");
  lines.push("Slowest requests (total, then non-zero phases):");
  analysis.slowest.forEach((r, i) => {
    const phases = TIMING_KEYS.filter(k => r.timing[k]).map(k => `${TIMING_LABELS[k]} ${formatDuration(r.timing[k])}`).join(", ");
    lines.push(`${i + 1}. ${r.method || ""} ${shortUrl(r.url)} : ${r.netError || r.status || (r.fromCache ? "cache" : "n/a")}, ${r.protocol || "n/a"}, total ${formatDuration(r.durationMs)}${phases ? `: ${phases}` : ""}`);
  });
  if (analysis.background.length) {
    lines.push("");
    lines.push(`Other activity in the capture (not analyzed above): ${analysis.background.map(p => `${p.site} (${p.requestCount})`).join(", ")}`);
  }
  lines.push("");
  lines.push("Limits: NetLog shows network activity only. It does not show page JavaScript/CPU time or security software acting inside the browser.");
  return lines.join("\n");
}
