/**
 * NetLog analyzer: turns a stream of Chromium NetLog events into a capture model.
 *
 * Chrome logs each moving part as its own "source" (URL request, stream job,
 * socket, QUIC session, DNS job, certificate check) and links them with
 * `source_dependency`. This keeps a small summary per relevant source as events
 * arrive (never the events themselves), then follows the links in `finish()` to
 * say which connection, DNS lookup, and certificate each request really used.
 *
 * Rule: every value in the model comes from the capture. Anything Chrome did not
 * record is null, never a default.
 *
 * No Node APIs: the same analyzer runs in the browser.
 */

import { redactUrl, redactHeaderLines } from "../redact.mjs";
import { summarizeCertificateChain } from "../cert.mjs";

const CONNECT_JOB_TYPES = new Set([
  "CONNECT_JOB", "SSL_CONNECT_JOB", "TRANSPORT_CONNECT_JOB", "HTTP_PROXY_CONNECT_JOB", "SOCKS_CONNECT_JOB"
]);
const QUIC_POOL_TYPES = new Set(["QUIC_SESSION_POOL_DIRECT_JOB", "QUIC_SESSION_POOL_JOB"]);
const SEND_HEADER_EVENTS = {
  HTTP_TRANSACTION_SEND_REQUEST_HEADERS: "http/1.1",
  HTTP_TRANSACTION_HTTP2_SEND_REQUEST_HEADERS: "h2",
  HTTP_TRANSACTION_QUIC_SEND_REQUEST_HEADERS: "h3"
};

function invert(map) {
  const out = {};
  for (const [name, id] of Object.entries(map || {})) out[id] = name;
  return out;
}

function depId(params) {
  return params?.source_dependency?.id ?? null;
}

/** Splits "198.51.100.20:443" or "[2001:db8::1]:443" into ip and port. */
export function splitAddress(address) {
  if (typeof address !== "string") return { ip: null, port: null };
  const v6 = address.match(/^\[([^\]]+)\]:(\d+)$/);
  if (v6) return { ip: v6[1], port: Number(v6[2]) };
  const v4 = address.match(/^([^:]+):(\d+)$/);
  if (v4) return { ip: v4[1], port: Number(v4[2]) };
  return { ip: address, port: null };
}

function isLoopback(ip) {
  return ip === "::1" || /^127\./.test(ip || "");
}

function hostFromResolverParam(value) {
  if (!value) return null;
  try {
    return new URL(value.includes("://") ? value : `https://${value}`).hostname.replace(/^\[|\]$/g, "");
  } catch {
    return value;
  }
}

function diff(a, b) {
  return a != null && b != null ? b - a : null;
}

export function createNetLogAnalyzer({ filter = null } = {}) {
  const filterRegex = filter ? new RegExp(filter, "i") : null;
  let constants = null;
  let polledData = null;
  let eventNames = null;
  let sourceNames = null;
  let netErrors = {};
  let phaseBegin = 1;
  let phaseEnd = 2;
  let pending = [];
  let eventCount = 0;
  let firstTime = Infinity;
  let lastTime = -Infinity;

  const sources = new Map();
  const get = (id, kind) => {
    let r = sources.get(id);
    if (!r) {
      r = { id, kind };
      sources.set(id, r);
    }
    return r;
  };
  const errorName = (code) => (code == null || code === 0 ? null : netErrors[code] || `NET_ERROR ${code}`);

  function setTopLevel(key, value) {
    if (key === "constants") {
      constants = value || {};
      eventNames = invert(constants.logEventTypes);
      sourceNames = invert(constants.logSourceType);
      netErrors = invert(constants.netError);
      phaseBegin = constants.logEventPhase?.PHASE_BEGIN ?? 1;
      phaseEnd = constants.logEventPhase?.PHASE_END ?? 2;
      const queued = pending;
      pending = [];
      for (const ev of queued) addEvent(ev);
    } else if (key === "polledData") {
      polledData = value || {};
    }
  }

  function addEvent(ev) {
    if (!eventNames) {
      pending.push(ev);
      return;
    }
    eventCount++;
    const name = eventNames[ev.type] ?? String(ev.type);
    const sourceType = sourceNames[ev.source?.type] ?? String(ev.source?.type);
    const id = ev.source?.id;
    const t = Number(ev.time);
    if (t < firstTime) firstTime = t;
    if (t > lastTime) lastTime = t;
    const p = ev.params || {};
    const begin = ev.phase === phaseBegin;
    const end = ev.phase === phaseEnd;

    if (sourceType === "URL_REQUEST") onUrlRequest(get(id, "request"), name, t, p, begin, end);
    else if (sourceType === "HTTP_STREAM_JOB_CONTROLLER") onController(get(id, "controller"), name, t, p, begin, end);
    else if (sourceType === "HTTP_STREAM_JOB") onStreamJob(get(id, "job"), name, t, p, begin, end);
    else if (CONNECT_JOB_TYPES.has(sourceType)) onConnectJob(get(id, "connectJob"), name, t, p, begin, end);
    else if (sourceType === "SOCKET") onSocket(get(id, "socket"), name, t, p, begin, end);
    else if (sourceType === "HTTP2_SESSION") onHttp2Session(get(id, "h2"), name, t, p, begin);
    else if (QUIC_POOL_TYPES.has(sourceType)) onQuicPoolJob(get(id, "quicPool"), name, t, p, begin, end);
    else if (sourceType === "QUIC_SESSION") onQuicSession(get(id, "quic"), name, t, p, begin, end);
    else if (sourceType === "CERT_VERIFIER_JOB") onCertJob(get(id, "certJob"), name, t, p, begin, end);
    else if (sourceType === "HOST_RESOLVER_IMPL_JOB") onDnsJob(get(id, "dns"), name, t, p, begin, end);
  }

  function onUrlRequest(r, name, t, p, begin, end) {
    switch (name) {
      case "REQUEST_ALIVE":
        if (begin) { r.start = t; r.url ??= p.url; r.priority = p.priority; }
        if (end) { r.end = t; if (p.net_error) r.netError = p.net_error; }
        break;
      case "URL_REQUEST_START_JOB":
        if (begin) {
          r.urls ??= [];
          r.urls.push(p.url);
          r.legStart = t;
          r.method = p.method ?? r.method;
          r.requestType ??= p.request_type;
          r.initiator ??= p.initiator;
          r.nik ??= p.network_isolation_key;
        }
        break;
      case "URL_REQUEST_REDIRECTED":
        (r.redirects ??= []).push(p.location);
        break;
      case "HTTP_STREAM_REQUEST":
        if (begin) r.streamStart = t;
        if (end) r.streamEnd = t;
        break;
      case "HTTP_STREAM_JOB_CONTROLLER_BOUND": r.controller = depId(p); break;
      case "HTTP_STREAM_REQUEST_BOUND_TO_JOB": r.job = depId(p); r.quicSession = null; break;
      case "HTTP_STREAM_REQUEST_BOUND_TO_QUIC_SESSION": r.quicSession = depId(p); r.job = null; break;
      case "HTTP_TRANSACTION_SEND_REQUEST":
        if (begin) r.sendStart = t;
        if (end) r.sendEnd = t;
        break;
      case "HTTP_TRANSACTION_READ_HEADERS":
        if (end) r.headersEnd = t;
        break;
      case "HTTP_TRANSACTION_READ_RESPONSE_HEADERS":
        r.responseHeaders = p.headers;
        break;
      case "URL_REQUEST_JOB_BYTES_READ": r.bytesWire = (r.bytesWire || 0) + (p.byte_count || 0); break;
      case "URL_REQUEST_JOB_FILTERED_BYTES_READ": r.bytesDecoded = (r.bytesDecoded || 0) + (p.byte_count || 0); break;
      case "LOCAL_NETWORK_ACCESS_CHECK": r.addressSpace = p.resource_address_space; break;
      default:
        if (SEND_HEADER_EVENTS[name]) {
          r.protocol = SEND_HEADER_EVENTS[name];
          r.requestHeaders = p.headers;
        }
    }
  }

  function onController(c, name, t, p, begin, end) {
    if (name === "PROXY_RESOLUTION_SERVICE") {
      if (begin) c.proxyStart = t;
      if (end) c.proxyEnd = t;
    } else if (name === "PROXY_RESOLUTION_SERVICE_RESOLVED_PROXY_LIST") {
      c.proxyInfo = p.proxy_info;
    }
  }

  function onStreamJob(j, name, t, p, begin, end) {
    switch (name) {
      case "SOCKET_POOL_BOUND_TO_SOCKET": j.socket = depId(p); break;
      case "SOCKET_POOL_BOUND_TO_CONNECT_JOB": j.connectJob = depId(p); break;
      case "HTTP2_SESSION_POOL_FOUND_EXISTING_SESSION":
      case "HTTP2_SESSION_POOL_IMPORTED_SESSION_FROM_SOCKET":
      case "HTTP_STREAM_JOB_HTTP2_SESSION_AVAILABLE":
        j.h2Session = depId(p); break;
      case "QUIC_SESSION_POOL_USE_EXISTING_SESSION": j.quicSession = depId(p); break;
      case "BOUND_TO_QUIC_SESSION_POOL_JOB": j.quicPoolJob = depId(p); break;
      case "HTTP_STREAM_JOB":
        if (end && p.net_error) j.netError = p.net_error;
        break;
    }
  }

  function onConnectJob(c, name, t, p, begin, end) {
    switch (name) {
      case "SOCKET_POOL_CONNECT_JOB_CREATED":
        c.host = hostFromResolverParam(String(p.group_id || "").split(" ")[0]);
        break;
      case "HOST_RESOLVER_MANAGER_REQUEST":
        if (begin) c.dnsStart = t;
        if (end) c.dnsEnd = t;
        break;
      case "HOST_RESOLVER_MANAGER_CACHE_HIT": c.dnsCached = true; break;
      case "CONNECT_JOB_SET_SOCKET": c.socket = depId(p); break;
    }
  }

  function onSocket(s, name, t, p, begin, end) {
    switch (name) {
      case "SOCKET_ALIVE":
        if (begin && depId(p) != null) s.connectJob = depId(p);
        break;
      case "TCP_CONNECT":
        if (begin) s.tcpStart = t;
        if (end) {
          s.tcpEnd = t;
          if (p.net_error) s.error = p.net_error;
          s.local = p.local_address;
          s.remote = p.remote_address;
        }
        if (begin && !s.remote && Array.isArray(p.address_list)) s.remoteAttempt = p.address_list[0];
        break;
      case "SSL_CONNECT":
        if (begin) s.tlsStart = t;
        if (end) {
          s.tlsEnd = t;
          if (p.net_error) s.error = p.net_error;
          s.tlsVersion = p.version;
          s.alpn = p.next_proto;
          s.resumed = p.is_resumed;
        }
        break;
      case "SSL_CERTIFICATES_RECEIVED":
        s.certSummary ??= summarizeCertificateChain(p.certificates);
        break;
      case "CERT_VERIFIER_REQUEST_BOUND_TO_JOB": s.certJob = depId(p); break;
    }
  }

  function onHttp2Session(h, name, t, p, begin) {
    if (name === "HTTP2_SESSION" && begin) h.host = hostFromResolverParam(p.host);
    if (name === "HTTP2_SESSION_INITIALIZED") h.socket = depId(p);
  }

  function onQuicPoolJob(q, name, t, p, begin, end) {
    switch (name) {
      case "QUIC_SESSION_POOL_JOB": if (begin) q.host = p.host; break;
      case "HOST_RESOLVER_MANAGER_REQUEST":
        if (begin) q.dnsStart = t;
        if (end) q.dnsEnd = t;
        break;
      case "HOST_RESOLVER_MANAGER_CACHE_HIT": q.dnsCached = true; break;
      case "QUIC_SESSION_CREATED":
      case "QUIC_SESSION_POOL_JOB_RESULT":
        if (depId(p) != null) get(depId(p), "quic").poolJob = q.id;
        break;
    }
  }

  function onQuicSession(q, name, t, p, begin, end) {
    switch (name) {
      case "QUIC_SESSION":
        if (begin) { q.start = t; q.host = p.host; }
        if (end) q.end = t;
        break;
      case "QUIC_SESSION_PACKET_RECEIVED":
        if (!q.peer && p.peer_address) { q.peer = p.peer_address; q.self = p.self_address; }
        break;
      case "QUIC_SESSION_CRYPTO_HANDSHAKE_COMPLETE": q.handshakeAt ??= t; break;
      case "CERT_VERIFIER_REQUEST_BOUND_TO_JOB": q.certJob = depId(p); break;
      case "QUIC_SESSION_CLOSED":
        if (q.handshakeAt == null) q.failure = p.details || (p.quic_error != null ? `QUIC error ${p.quic_error}` : "closed before handshake");
        if (p.net_error) q.error = p.net_error;
        break;
    }
  }

  function onCertJob(c, name, t, p, begin, end) {
    if (name !== "CERT_VERIFIER_JOB") return;
    if (begin) {
      c.start = t;
      c.host = p.host;
      c.summary = summarizeCertificateChain(p.certificates);
    }
    if (end) {
      c.end = t;
      c.knownRoot = p.is_issued_by_known_root ?? null;
      c.certStatus = p.cert_status ?? null;
      if (p.net_error) c.error = p.net_error;
    }
  }

  function onDnsJob(d, name, t, p, begin, end) {
    if (name === "HOST_RESOLVER_MANAGER_JOB") {
      if (begin) { d.start = t; d.host = hostFromResolverParam(p.host); }
      if (end) { d.end = t; if (p.net_error) d.error = p.net_error; }
    } else if (name === "HOST_RESOLVER_DNS_TASK_EXTRACTION_RESULTS" || (name === "HOST_RESOLVER_DNS_TASK" && end)) {
      for (const result of p.results || []) {
        for (const e of result.endpoints || []) (d.addresses ??= new Set()).add(e.address);
      }
    } else if (name === "HOST_RESOLVER_SYSTEM_TASK" && end) {
      for (const a of p.address_list || []) (d.addresses ??= new Set()).add(splitAddress(a).ip);
    }
  }

  function finish() {
    if (!constants) throw new Error("Not a Chromium NetLog: no constants block found.");
    const t0 = Number.isFinite(firstTime) ? firstTime : 0;
    const rel = (t) => (t == null ? null : t - t0);
    const src = (id, kind) => {
      const r = id == null ? null : sources.get(id);
      return r && (!kind || r.kind === kind) ? r : null;
    };

    // Connect jobs point at their socket; make sure sockets point back.
    // QUIC pool jobs point at the session they created; index that too.
    const sessionByPoolJob = new Map();
    for (const r of sources.values()) {
      if (r.kind === "connectJob" && r.socket != null) {
        const s = src(r.socket, "socket");
        if (s && s.connectJob == null) s.connectJob = r.id;
      }
      if (r.kind === "quic" && r.poolJob != null) sessionByPoolJob.set(r.poolJob, r.id);
    }

    const connections = new Map();
    const localAddresses = new Set();

    function certFrom(certJobId, fallbackSummary) {
      const job = src(certJobId, "certJob");
      const summary = job?.summary || fallbackSummary;
      if (!summary && !job) return null;
      return {
        subject: summary?.subject ?? null,
        issuer: summary?.issuer ?? null,
        issuerOrg: summary?.issuerOrg ?? null,
        root: summary?.root ?? null,
        notAfter: summary?.notAfter ?? null,
        knownRoot: job?.knownRoot ?? null,
        verifyMs: diff(job?.start, job?.end),
        error: errorName(job?.error)
      };
    }

    function tcpConnection(socketId) {
      const key = `tcp-${socketId}`;
      if (connections.has(key)) return connections.get(key);
      const s = src(socketId, "socket");
      if (!s) return null;
      const cj = src(s.connectJob, "connectJob");
      const remote = splitAddress(s.remote || s.remoteAttempt);
      const local = splitAddress(s.local);
      if (local.ip && !isLoopback(local.ip)) localAddresses.add(local.ip);
      const conn = {
        id: key,
        kind: "tcp",
        host: cj?.host ?? src(s.certJob, "certJob")?.host ?? null,
        remoteIp: remote.ip,
        remotePort: remote.port,
        localAddress: s.local ?? null,
        start: rel(cj?.dnsStart ?? s.tcpStart),
        ready: s.tlsEnd ?? s.tcpEnd ?? null,
        dnsMs: diff(cj?.dnsStart, cj?.dnsEnd) ?? (cj?.dnsCached ? 0 : null),
        connectMs: diff(s.tcpStart, s.tcpEnd),
        tlsMs: diff(s.tlsStart, s.tlsEnd),
        tlsVersion: s.tlsVersion ?? null,
        alpn: s.alpn ?? null,
        resumed: s.resumed ?? null,
        cert: certFrom(s.certJob, s.certSummary),
        error: errorName(s.error)
      };
      connections.set(key, conn);
      return conn;
    }

    function quicConnection(sessionId) {
      const key = `quic-${sessionId}`;
      if (connections.has(key)) return connections.get(key);
      const q = src(sessionId, "quic");
      if (!q) return null;
      const pool = src(q.poolJob, "quicPool");
      const remote = splitAddress(q.peer);
      const local = splitAddress(q.self);
      if (local.ip && !isLoopback(local.ip)) localAddresses.add(local.ip);
      const conn = {
        id: key,
        kind: "quic",
        host: q.host ?? pool?.host ?? null,
        remoteIp: remote.ip,
        remotePort: remote.port,
        localAddress: q.self ?? null,
        start: rel(pool?.dnsStart ?? q.start),
        ready: q.handshakeAt ?? null,
        dnsMs: diff(pool?.dnsStart, pool?.dnsEnd) ?? (pool?.dnsCached ? 0 : null),
        connectMs: diff(q.start, q.handshakeAt),
        tlsMs: null,
        tlsVersion: q.handshakeAt != null ? "TLS 1.3" : null,
        alpn: "h3",
        resumed: null,
        cert: certFrom(q.certJob, null),
        error: errorName(q.error) ?? q.failure ?? null
      };
      connections.set(key, conn);
      return conn;
    }

    function connectionFor(r) {
      if (r.quicSession != null) return quicConnection(r.quicSession);
      const j = src(r.job, "job");
      if (!j) return null;
      if (j.quicSession != null) return quicConnection(j.quicSession);
      if (sessionByPoolJob.has(j.quicPoolJob)) return quicConnection(sessionByPoolJob.get(j.quicPoolJob));
      const h2 = src(j.h2Session, "h2");
      if (h2?.socket != null) return tcpConnection(h2.socket);
      if (j.socket != null) return tcpConnection(j.socket);
      const cj = src(j.connectJob, "connectJob");
      if (cj?.socket != null) return tcpConnection(cj.socket);
      return null;
    }

    const requests = [];
    for (const r of sources.values()) {
      if (r.kind !== "request" || !r.urls?.length || r.start == null) continue;
      const rawUrl = r.urls[r.urls.length - 1];
      if (filterRegex && !filterRegex.test(rawUrl) && !filterRegex.test(r.method || "")) continue;

      let parsed = null;
      try { parsed = new URL(rawUrl); } catch { /* keep nulls */ }
      const conn = connectionFor(r);
      const ctrl = src(r.controller, "controller");
      const reused = conn && conn.ready != null && r.streamStart != null ? conn.ready < r.streamStart : null;
      if (conn && !conn.host && parsed) conn.host = parsed.hostname;

      const legStart = r.legStart ?? r.start;
      const proxy = diff(ctrl?.proxyStart, ctrl?.proxyEnd);
      const fresh = reused === false;
      const dns = fresh ? conn.dnsMs : null;
      const connect = fresh ? conn.connectMs : null;
      const tls = fresh ? conn.tlsMs : null;
      const streamMs = diff(r.streamStart, r.streamEnd);
      const stalled = streamMs == null ? null
        : Math.max(0, streamMs - (proxy || 0) - (dns || 0) - (connect || 0) - (tls || 0));

      const status = /^HTTP\/[\d.]+\s+(\d{3})\s*(.*)$/i.exec(r.responseHeaders?.[0] || "");
      const site = String(r.nik || "").split(" ")[0];
      const pageSite = site && site !== "null" ? site : (r.initiator && r.initiator !== "not an origin" ? r.initiator : "unknown");
      const end = r.end ?? lastTime;

      requests.push({
        id: r.id,
        url: redactUrl(rawUrl),
        host: parsed ? parsed.hostname.replace(/^\[|\]$/g, "") : null,
        port: parsed ? Number(parsed.port || (parsed.protocol === "http:" ? 80 : 443)) : null,
        scheme: parsed ? parsed.protocol.replace(":", "") : null,
        method: r.method ?? null,
        requestType: r.requestType ?? null,
        initiator: r.initiator ?? null,
        site: pageSite,
        isBackground: !/^https?:\/\//.test(pageSite),
        priority: r.priority ?? null,
        start: rel(r.start),
        end: rel(end),
        durationMs: end - r.start,
        timing: {
          redirect: r.redirects?.length ? legStart - r.start : null,
          queue: diff(legStart, r.streamStart),
          proxy,
          dns,
          connect,
          tls,
          stalled,
          send: diff(r.sendStart, r.sendEnd),
          wait: diff(r.sendEnd, r.headersEnd),
          download: r.headersEnd != null ? end - r.headersEnd : null
        },
        protocol: r.protocol ?? null,
        status: status ? Number(status[1]) : null,
        statusText: status ? status[2] || null : null,
        netError: errorName(r.netError),
        fromCache: r.sendStart == null && r.netError == null,
        bytesWire: r.bytesWire ?? null,
        bytesDecoded: r.bytesDecoded ?? null,
        contentType: headerValue(r.responseHeaders, "content-type"),
        requestHeaders: redactHeaderLines(r.requestHeaders),
        responseHeaders: redactHeaderLines(r.responseHeaders),
        proxy: ctrl?.proxyInfo ?? null,
        redirects: (r.redirects || []).map(redactUrl),
        addressSpace: r.addressSpace ?? null,
        connectionId: conn?.id ?? null,
        reusedConnection: reused
      });
    }

    if (requests.length === 0) {
      throw new Error(filterRegex ? "No matching HTTP requests found in NetLog capture." : "No HTTP requests found in this NetLog capture.");
    }
    requests.sort((a, b) => a.start - b.start || a.id - b.id);

    const pages = new Map();
    for (const r of requests) {
      const page = pages.get(r.site) || { site: r.site, url: null, requestCount: 0, isBackground: r.isBackground };
      page.requestCount++;
      if (r.requestType === "main frame" && !page.url) page.url = r.url;
      pages.set(r.site, page);
    }

    const usedConnections = new Set(requests.map(r => r.connectionId).filter(Boolean));
    const dnsLookups = [...sources.values()]
      .filter(d => d.kind === "dns" && d.host && d.start != null)
      .map(d => ({
        host: d.host,
        start: rel(d.start),
        durationMs: diff(d.start, d.end),
        addresses: [...(d.addresses || [])],
        error: errorName(d.error)
      }))
      .sort((a, b) => a.start - b.start);

    return {
      format: "socketmap-capture/1",
      environment: buildEnvironment(constants, polledData, t0, lastTime, localAddresses),
      pages: [...pages.values()].sort((a, b) => b.requestCount - a.requestCount),
      requests,
      connections: [...connections.values()]
        .filter(c => usedConnections.has(c.id))
        .map(({ ready, ...c }) => c),
      dnsLookups,
      stats: { events: eventCount, sources: sources.size }
    };
  }

  return { setTopLevel, addEvent, finish };
}

function headerValue(lines, name) {
  const prefix = `${name.toLowerCase()}:`;
  const line = (lines || []).find(l => typeof l === "string" && l.toLowerCase().startsWith(prefix));
  return line ? line.slice(prefix.length).trim() : null;
}

function describeProxy(settings) {
  const eff = settings?.effective;
  if (!eff) return { mode: "unknown", detail: null };
  if (eff.pac_url) return { mode: "PAC script", detail: eff.pac_url };
  if (eff.auto_detect) return { mode: "Auto-detect (WPAD)", detail: null };
  if (eff.single_proxy || eff.proxy_per_scheme) {
    return { mode: "Fixed proxy", detail: JSON.stringify(eff.single_proxy || eff.proxy_per_scheme) };
  }
  if (eff.from_system) return { mode: "System settings", detail: "Chrome follows the operating system proxy settings" };
  if (Object.keys(eff).length === 0) return { mode: "Direct", detail: null };
  return { mode: "Other", detail: JSON.stringify(eff) };
}

function buildEnvironment(constants, polledData, t0, lastTime, localAddresses) {
  const info = constants.clientInfo || {};
  const dnsConfig = polledData?.hostResolverInfo?.dns_config || {};
  const secureModes = invert(constants.secureDnsMode);
  const offset = Number(constants.timeTickOffset);
  return {
    browser: [info.name, info.version].filter(Boolean).join(" ") || null,
    os: info.os_type ?? null,
    commandLine: info.command_line ?? null,
    captureMode: constants.logCaptureMode ?? null,
    captureStartedAt: Number.isFinite(offset) ? new Date(offset + t0).toISOString() : null,
    captureDurationMs: Number.isFinite(lastTime) ? lastTime - t0 : null,
    localAddresses: [...localAddresses].sort(),
    proxy: { ...describeProxy(polledData?.proxySettings), badProxies: polledData?.badProxies ?? [] },
    dns: {
      servers: (dnsConfig.nameservers || []).map(s => splitAddress(s).ip),
      search: dnsConfig.search || [],
      secureDns: dnsConfig.secure_dns_mode != null ? (secureModes[dnsConfig.secure_dns_mode] ?? String(dnsConfig.secure_dns_mode)) : null,
      dohServers: (dnsConfig.doh_config?.servers || []).map(s => s.server_template || s.template || JSON.stringify(s))
    },
    polledDataPresent: Boolean(polledData)
  };
}
