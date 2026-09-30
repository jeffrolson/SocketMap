/**
 * Builds a capture model from a HAR alone (no NetLog), so a HAR opens in the same report.
 *
 * The model has the same shape the NetLog analyzer produces, so every view works. What a HAR does
 * not record is null, never a default: there is no proxy decision, certificate chain, TLS version,
 * DNS server list or browser diagnostics, and the report says "not recorded" for them. What a HAR
 * does record is mapped honestly: its "connect" time includes TLS, so the TLS part is taken out of
 * connect; "blocked" covers queueing, stalled time and proxy negotiation and is kept as queue time.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "./redact.mjs";

const HTTP_VERSION = { "h2": "h2", "h3": "h3", "http/2": "h2", "http/2.0": "h2", "http/3": "h3", "http/1.1": "http/1.1", "http/1.0": "http/1.0" };

function parse(url) {
  try {
    const u = new URL(url);
    return { host: u.hostname, port: u.port ? Number(u.port) : (u.protocol === "https:" ? 443 : u.protocol === "http:" ? 80 : null), scheme: u.protocol.replace(":", ""), origin: u.origin };
  } catch { return { host: null, port: null, scheme: null, origin: null }; }
}

// Same idea as the NetLog page site: the registrable-looking tail of the host, so subdomains group together.
function siteOf(origin) {
  if (!origin) return null;
  try {
    const u = new URL(origin);
    const labels = u.hostname.split(".");
    const twoPart = labels.length >= 3 && labels[labels.length - 2].length <= 3 && labels[labels.length - 1].length === 2;
    const tail = labels.slice(twoPart ? -3 : -2).join(".");
    return `${u.protocol}//${labels.length >= 2 && !/^\d+\.\d+\.\d+\.\d+$/.test(u.hostname) ? tail : u.hostname}`;
  } catch { return null; }
}

const rounded = (value) => (value == null ? null : Math.round(value * 10) / 10);

/** Returns the capture model, or null when the file was not a HAR. */
export function buildCaptureFromHar(har, { name = "capture.har" } = {}) {
  if (!har?.recognized) return null;
  const entries = (Array.isArray(har.entries) ? har.entries : []).filter(e => e && e.url);
  const stamped = entries.filter(e => e.startedMs != null);
  const t0 = stamped.length ? Math.min(...stamped.map(e => e.startedMs)) : null;
  const clock = t0 != null;

  // Pages: each HAR page is a navigation; its site is that of its first document (or first entry).
  // A HAR whose entries name their pages groups them; entries with no page are background traffic. A HAR
  // that lists no pages, or never names them on its entries (some tools omit it), is treated as one page.
  const pageIds = new Map();
  const pagesInfo = new Map((har.pages || []).map(p => [p.id, p]));
  const usesPages = entries.some(e => pagesInfo.has(e.pageref));
  const pageKeyOf = (entry) => usesPages ? (pagesInfo.has(entry.pageref) ? entry.pageref : null) : "";
  for (const entry of entries) {
    const key = pageKeyOf(entry);
    if (key == null || pageIds.has(key)) continue;
    const members = entries.filter(e => pageKeyOf(e) === key);
    const document = members.find(e => e.resourceType === "document") || members[0];
    pageIds.set(key, { site: siteOf(parse(document.url).origin), url: document.url });
  }

  const documentSeen = new Set();
  const requests = entries.map((entry, index) => {
    const u = parse(entry.url);
    const key = pageKeyOf(entry);
    const page = key == null ? null : pageIds.get(key);
    const t = entry.timings || {};
    const connect = t.connect == null ? null : (t.ssl != null && t.ssl > 0 ? Math.max(0, t.connect - t.ssl) : t.connect);
    const start = clock && entry.startedMs != null ? rounded(entry.startedMs - t0) : null;
    const end = start != null && entry.timeMs != null ? rounded(start + entry.timeMs) : null;
    const isDocument = entry.resourceType === "document";
    let requestType = entry.resourceType || null;
    if (isDocument && key != null) { requestType = documentSeen.has(key) ? "sub frame" : "main frame"; documentSeen.add(key); }
    const initiatorUrl = entry.initiator?.url ? parse(entry.initiator.url).origin : null;
    const version = entry.httpVersion ? (HTTP_VERSION[entry.httpVersion.toLowerCase()] || entry.httpVersion.toLowerCase()) : null;
    const local = u.host && (u.host === "localhost" || /^(127\.|10\.|192\.168\.)/.test(u.host));
    return {
      id: index + 1, url: redactUrl(entry.url), host: u.host, port: u.port, scheme: u.scheme, method: entry.method || null,
      requestType, initiator: initiatorUrl, site: page ? page.site : null, isBackground: key == null, priority: entry.priority ? entry.priority.toUpperCase() : null,
      start, end, observedEnd: end, observedDurationMs: entry.timeMs, endRecorded: end != null, durationMs: entry.timeMs,
      timing: { redirect: null, queue: rounded(t.blocked), proxy: null, dns: rounded(t.dns), connect: rounded(connect), tls: rounded(t.ssl), stalled: null, send: rounded(t.send), wait: rounded(t.wait), download: rounded(t.receive) },
      protocol: version, status: entry.status && entry.status > 0 ? entry.status : null, statusText: null, netError: null,
      fromCache: entry.cache ? true : (har.creator?.name === "WebInspector" ? false : null), bytesWire: entry.transferSize, bytesDecoded: entry.contentSize, contentType: entry.mimeType,
      requestHeaders: [], responseHeaders: entry.responseHeaders ? [`HTTP/1.1 ${entry.status ?? ""}`.trim(), ...entry.responseHeaders] : [],
      proxy: null, redirects: [], addressSpace: local ? "local" : null,
      connectionId: entry.connectionId ? `conn-${entry.connectionId}` : null,
      reusedConnection: entry.connectionId ? (t.connect == null && t.dns == null ? true : (t.connect != null ? false : null)) : null,
      serverIp: entry.serverIp || null
    };
  });

  // Connections: one per distinct connection id, described by the first request that used it.
  const connections = [];
  const seen = new Set();
  for (const r of requests) {
    if (!r.connectionId || seen.has(r.connectionId)) continue;
    seen.add(r.connectionId);
    connections.push({ id: r.connectionId, kind: r.protocol === "h3" ? "quic" : "tcp", host: r.host, remoteIp: r.serverIp, remotePort: r.port, localAddress: null, start: r.start, dnsMs: r.timing.dns, dnsCached: null, connectMs: r.timing.connect, tlsMs: r.timing.tls, tlsVersion: null, alpn: r.protocol, resumed: null, cert: null, error: null });
  }
  const dnsLookups = [];
  const dnsHosts = new Set();
  for (const r of requests) {
    if (r.timing.dns == null || r.timing.dns <= 0 || !r.host || dnsHosts.has(r.host)) continue;
    dnsHosts.add(r.host);
    dnsLookups.push({ host: r.host, start: r.start, durationMs: r.timing.dns, addresses: r.serverIp ? [r.serverIp] : [], error: null });
  }

  const pages = [...pageIds.entries()].map(([key, page]) => ({ site: page.site, url: page.url, requestCount: requests.filter(r => pageKeyOf(entries[r.id - 1]) === key).length, isBackground: false }));
  const backgroundCount = requests.filter(r => r.isBackground).length;
  if (backgroundCount) pages.push({ site: "unknown", url: null, requestCount: backgroundCount, isBackground: true });
  const ends = requests.map(r => r.end ?? r.start).filter(v => v != null);
  const creator = har.creator ? `${har.creator.name || "unknown"}${har.creator.version ? ` ${har.creator.version}` : ""}` : null;
  const browser = har.browser?.name ? `${har.browser.name}${har.browser.version ? ` ${har.browser.version}` : ""}` : null;

  return {
    format: "socketmap-capture/1",
    source: { kind: "har", name, creator, entryCount: har.entryCount ?? entries.length, kept: entries.length, omitted: har.omitted ?? 0, pages: (har.pages || []).length, hasHeaders: entries.some(e => Array.isArray(e.responseHeaders)) },
    environment: {
      browser, browserInfo: { name: har.browser?.name || null, version: har.browser?.version || null, channel: null, build: null, official: null },
      os: null, commandLine: null, captureMode: null,
      captureStartedAt: clock ? new Date(t0).toISOString() : null,
      captureDurationMs: ends.length ? Math.round(Math.max(...ends)) : null,
      localAddresses: [],
      proxy: { mode: "unknown", detail: null, pacUrl: null, autoDetect: null, fixedServers: [], badProxies: [] },
      dns: { servers: [], serverAddresses: [], search: [], secureDns: null, dohServers: [], timeoutSeconds: null, attempts: null, rotate: null, hostsPresent: null },
      polledDataPresent: false
    },
    pages, requests, connections, dnsLookups,
    stats: { events: 0, sources: 0 },
    diagnostics: {
      events: 0, firstTime: null, lastTime: null, constantsLate: false, sources: [], eventTypes: [], timeline: [], snapshots: {}, constants: {}, topLevel: {},
      integrity: har.integrity || { complete: null, discardedPartial: false, malformedEntries: 0 },
      warnings: ["This report was built from a HAR. A HAR records what DevTools saw per request; browser-wide network diagnostics need a NetLog."]
    }
  };
}
