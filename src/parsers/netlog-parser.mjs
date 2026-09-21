/**
 * SocketMap Resilient Chromium NetLog Parser
 * Implements a streaming chunked parser for chrome://net-export/ JSON files.
 * Streams events without loading massive (100MB-500MB+) files entirely into memory.
 */

import { createReadStream } from "node:fs";
import { redactSensitiveData, formatBytes, formatDuration } from "../normalizer.mjs";

/**
 * Streamingly parses a NetLog JSON file and emits events.
 */
export async function streamNetLogEvents(filePath, onEvent) {
  return new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 64 * 1024 });

    let inString = false;
    let escaped = false;
    let currentKey = "";
    let parsingKey = false;
    let depth = 0; // overall JSON nesting depth

    // Constants capture state
    let capturingConstants = false;
    let constantsDepth = 0;
    let constantsBuf = "";
    let constants = null;

    // Events array capture state
    let insideEventsArray = false;
    let capturingEvent = false;
    let eventDepth = 0;
    let eventBuf = "";

    stream.on("data", (chunk) => {
      for (let i = 0; i < chunk.length; i++) {
        const char = chunk[i];

        if (inString) {
          if (escaped) {
            escaped = false;
            if (capturingConstants) constantsBuf += char;
            if (capturingEvent) eventBuf += char;
            if (parsingKey) currentKey += char;
          } else if (char === "\\") {
            escaped = true;
            if (capturingConstants) constantsBuf += char;
            if (capturingEvent) eventBuf += char;
            if (parsingKey) currentKey += char;
          } else if (char === '"') {
            inString = false;
            parsingKey = false;
            if (capturingConstants) constantsBuf += char;
            if (capturingEvent) eventBuf += char;
          } else {
            if (capturingConstants) constantsBuf += char;
            if (capturingEvent) eventBuf += char;
            if (parsingKey) currentKey += char;
          }
          continue;
        }

        if (char === '"') {
          inString = true;
          if (capturingConstants) constantsBuf += char;
          if (capturingEvent) eventBuf += char;

          // If at top-level object and not inside arrays/sub-objects
          if (depth === 1 && !insideEventsArray && !capturingConstants) {
            parsingKey = true;
            currentKey = "";
          }
          continue;
        }

        if (capturingConstants) {
          constantsBuf += char;
          if (char === "{") {
            constantsDepth++;
          } else if (char === "}") {
            constantsDepth--;
            if (constantsDepth === 0) {
              capturingConstants = false;
              depth = 1;
              try {
                constants = JSON.parse(constantsBuf);
              } catch {
                // Ignore malformed constants
              }
              constantsBuf = "";
            }
          }
          continue;
        }

        if (insideEventsArray) {
          if (capturingEvent) {
            eventBuf += char;
            if (char === "{") {
              eventDepth++;
            } else if (char === "}") {
              eventDepth--;
              if (eventDepth === 0) {
                capturingEvent = false;
                try {
                  const ev = JSON.parse(eventBuf);
                  onEvent(ev, constants);
                } catch {
                  // Ignore malformed event
                }
                eventBuf = "";
              }
            }
            continue;
          }

          if (char === "{") {
            capturingEvent = true;
            eventDepth = 1;
            eventBuf = "{";
            continue;
          }

          if (char === "]") {
            insideEventsArray = false;
            depth = 1;
            continue;
          }

          continue;
        }

        // Structural delimiters outside strings
        if (char === "{") {
          depth++;
          if (currentKey === "constants" && depth === 2) {
            capturingConstants = true;
            constantsDepth = 1;
            constantsBuf = "{";
            currentKey = "";
          }
        } else if (char === "}") {
          depth--;
        } else if (char === "[") {
          if (currentKey === "events" && depth === 1) {
            insideEventsArray = true;
            currentKey = "";
          }
        }
      }
    });

    stream.on("end", () => {
      resolve(constants);
    });

    stream.on("error", (err) => {
      reject(err);
    });
  });
}

/**
 * Builds inverse lookup maps from Chromium NetLog constants.
 */
function resolveNetLogConstants(constants) {
  const eventTypes = {};
  const sourceTypes = {};

  if (constants && typeof constants === "object") {
    if (constants.logEventTypes) {
      for (const [name, id] of Object.entries(constants.logEventTypes)) {
        eventTypes[id] = name;
      }
    }
    if (constants.logSourceType) {
      for (const [name, id] of Object.entries(constants.logSourceType)) {
        sourceTypes[id] = name;
      }
    }
  }

  return { eventTypes, sourceTypes };
}

/**
 * Parses a Chromium NetLog file and correlates DNS, TCP/TLS, and HTTP transactions.
 */
export async function parseNetLog(filePath, options = {}) {
  const filterRegex = options.filter ? new RegExp(options.filter, "i") : null;
  const maxRequests = options.maxRequests || 20;

  let eventTypeLookup = {};
  let sourceTypeLookup = {};

  // Raw collected events in case constants were parsed mid-stream
  const collectedEvents = [];

  const streamConstants = await streamNetLogEvents(filePath, (event, constants) => {
    collectedEvents.push(event);
    if (constants && Object.keys(eventTypeLookup).length === 0) {
      const resolved = resolveNetLogConstants(constants);
      eventTypeLookup = resolved.eventTypes;
      sourceTypeLookup = resolved.sourceTypes;
    }
  });

  if (streamConstants && Object.keys(eventTypeLookup).length === 0) {
    const resolved = resolveNetLogConstants(streamConstants);
    eventTypeLookup = resolved.eventTypes;
    sourceTypeLookup = resolved.sourceTypes;
  }

  // Aggregation maps
  const urlRequests = new Map(); // source.id -> RequestAggregator
  const dnsJobs = new Map();     // source.id -> DNSAggregator
  const connectJobs = new Map(); // source.id -> ConnectAggregator

  for (const event of collectedEvents) {
    const typeName = eventTypeLookup[event.type] || event.type;
    const sourceTypeName = sourceTypeLookup[event.source?.type] || event.source?.type;
    const sourceId = event.source?.id;
    const time = Number(event.time);
    const params = event.params || {};

    // 1. DNS Resolution: HOST_RESOLVER_IMPL_JOB or HOST_RESOLVER_MANAGER_JOB
    if (sourceTypeName === "HOST_RESOLVER_IMPL_JOB" || sourceTypeName === "HOST_RESOLVER_MANAGER_JOB" ||
        String(typeName).includes("HOST_RESOLVER")) {
      if (!dnsJobs.has(sourceId)) {
        dnsJobs.set(sourceId, {
          id: sourceId,
          host: null,
          startTime: time,
          endTime: time,
          addressList: [],
          latencyMs: 0
        });
      }
      const dns = dnsJobs.get(sourceId);
      if (params.host) dns.host = params.host;
      if (params.address_list) dns.addressList = params.address_list;
      if (event.phase === 1) {
        dns.endTime = time;
        dns.latencyMs = Math.max(0, dns.endTime - dns.startTime);
      }
    }

    // 2. Handshake: CONNECT_JOB / SSL_CONNECT_JOB / TRANSPORT_CONNECT_JOB
    if (sourceTypeName === "CONNECT_JOB" || sourceTypeName === "SSL_CONNECT_JOB" ||
        sourceTypeName === "TRANSPORT_CONNECT_JOB" || String(typeName).includes("CONNECT")) {
      if (!connectJobs.has(sourceId)) {
        connectJobs.set(sourceId, {
          id: sourceId,
          startTime: time,
          endTime: time,
          tlsVersion: null,
          cipherSuite: null,
          alpn: null,
          latencyMs: 0
        });
      }
      const conn = connectJobs.get(sourceId);
      if (params.tls_version) conn.tlsVersion = params.tls_version;
      if (params.cipher_suite) conn.cipherSuite = params.cipher_suite;
      if (params.alpn) conn.alpn = params.alpn;
      if (event.phase === 1) {
        conn.endTime = time;
        conn.latencyMs = Math.max(0, conn.endTime - conn.startTime);
      }
    }

    // 3. HTTP Request & Transaction
    if (sourceTypeName === "URL_REQUEST" || String(typeName).includes("URL_REQUEST") ||
        String(typeName).includes("HTTP_TRANSACTION")) {
      if (!urlRequests.has(sourceId)) {
        urlRequests.set(sourceId, {
          id: sourceId,
          url: null,
          method: "GET",
          startTime: time,
          sendTime: null,
          headersReceivedTime: null,
          endTime: time,
          statusCode: null,
          statusText: null,
          requestHeaders: [],
          responseHeaders: [],
          bytesRead: 0,
          dnsId: null,
          connectId: null
        });
      }

      const req = urlRequests.get(sourceId);

      if (params.url) req.url = params.url;
      if (params.method) req.method = params.method;

      if (params.source_dependency) {
        const depId = params.source_dependency.id;
        if (dnsJobs.has(depId)) req.dnsId = depId;
        if (connectJobs.has(depId)) req.connectId = depId;
      }

      // Headers sent
      if (String(typeName).includes("SEND_REQUEST_HEADERS") || String(typeName).includes("HTTP_TRANSACTION_SEND_REQUEST")) {
        req.sendTime = time;
        if (params.headers) {
          req.requestHeaders = redactSensitiveData(params.headers);
        }
      }

      // Headers received
      if (String(typeName).includes("READ_RESPONSE_HEADERS") || String(typeName).includes("HTTP_TRANSACTION_READ_RESPONSE_HEADERS")) {
        req.headersReceivedTime = time;
        if (params.headers) {
          req.responseHeaders = redactSensitiveData(params.headers);
        }
        if (params.line) {
          const m = params.line.match(/HTTP\/[0-9.]+\s+(\d+)\s*(.*)/i);
          if (m) {
            req.statusCode = parseInt(m[1], 10);
            req.statusText = m[2].trim();
          }
        }
      }

      // Bytes transferred
      if (params.byte_count) {
        req.bytesRead += params.byte_count;
      }

      if (event.phase === 1 && String(typeName) === "URL_REQUEST_START_JOB") {
        req.endTime = time;
      }
      if (event.phase === 1 && sourceTypeName === "URL_REQUEST") {
        req.endTime = time;
      }
    }
  }

  // Filter and prioritize requests
  let requests = Array.from(urlRequests.values()).filter(r => r.url);

  if (filterRegex) {
    requests = requests.filter(r => filterRegex.test(r.url) || filterRegex.test(r.method));
  }

  // Sort chronologically
  requests.sort((a, b) => a.startTime - b.startTime);

  if (requests.length === 0) {
    throw new Error("No matching HTTP requests found in NetLog trace.");
  }

  // Limit request count if too many
  if (requests.length > maxRequests) {
    requests = requests.slice(0, maxRequests);
  }

  // Generate intermediate representation from correlated requests
  return convertNetLogToIR(requests, dnsJobs, connectJobs);
}

/**
 * Converts correlated NetLog requests into the canonical IR.
 */
function convertNetLogToIR(requests, dnsJobs, connectJobs) {
  const firstReq = requests[0];
  let primaryHost = "api.service";
  try {
    primaryHost = new URL(firstReq.url).hostname;
  } catch {
    // Keep fallback
  }

  const title = `Chromium NetLog Trace: ${firstReq.method} ${firstReq.url.length > 40 ? firstReq.url.slice(0, 40) + "..." : firstReq.url}`;

  const phases = [
    "Phase 01: Connection & Resolution",
    "Phase 02: Request Dispatch",
    "Phase 03: Response Streaming"
  ];

  const participants = [
    {
      id: "client",
      label: "Browser Client",
      sublabel: "Chrome NetLog",
      role: "client",
      color: "#06b6d4"
    },
    {
      id: "dns",
      label: "DNS Resolver",
      sublabel: "Host Resolver",
      role: "dns",
      color: "#8b5cf6"
    },
    {
      id: "edge",
      label: primaryHost,
      sublabel: "TLS Gateway",
      role: "gateway",
      color: "#10b981"
    },
    {
      id: "origin",
      label: "Origin Server",
      sublabel: "Application",
      role: "service",
      color: "#f59e0b"
    }
  ];

  const messages = [];
  let msgIdx = 1;

  for (const req of requests) {
    let urlObj;
    try {
      urlObj = new URL(req.url);
    } catch {
      urlObj = { pathname: req.url, hostname: primaryHost };
    }

    // DNS step if available (either explicitly linked or fallback to any DNS job matching hostname)
    let dns = req.dnsId ? dnsJobs.get(req.dnsId) : null;
    if (!dns) {
      for (const d of dnsJobs.values()) {
        if (d.host === urlObj.hostname || d.host === primaryHost) {
          dns = d;
          break;
        }
      }
    }

    if (dns && dns.latencyMs > 0) {
      messages.push({
        id: `msg-${msgIdx++}`,
        from: "client",
        to: "dns",
        label: `DNS Resolve ${dns.host || urlObj.hostname} (${formatDuration(dns.latencyMs)})`,
        detail: `DNS query for ${dns.host || urlObj.hostname}`,
        kind: "request",
        phase: 0,
        latencyMs: dns.latencyMs,
        method: "DNS"
      });

      const resolvedIp = dns.addressList?.[0] || "Resolved IP";
      messages.push({
        id: `msg-${msgIdx++}`,
        from: "dns",
        to: "client",
        label: `${resolvedIp}`,
        detail: `Addresses: ${dns.addressList.join(", ") || resolvedIp}`,
        kind: "return",
        phase: 0,
        latencyMs: 2,
        status: 200
      });
    }

    // Handshake step if available (either explicitly linked or fallback to any connect job)
    let conn = req.connectId ? connectJobs.get(req.connectId) : null;
    if (!conn && connectJobs.size > 0) {
      conn = Array.from(connectJobs.values())[0];
    }

    if (conn && conn.latencyMs > 0) {
      messages.push({
        id: `msg-${msgIdx++}`,
        from: "client",
        to: "edge",
        label: `TCP / TLS Handshake (${formatDuration(conn.latencyMs)})`,
        detail: `TLS: ${conn.tlsVersion || "1.3"}, ALPN: ${conn.alpn || "h2"}`,
        kind: "request",
        phase: 0,
        latencyMs: conn.latencyMs
      });

      messages.push({
        id: `msg-${msgIdx++}`,
        from: "edge",
        to: "client",
        label: `Connection Ready (${conn.alpn || "h2"})`,
        detail: `Cipher: ${conn.cipherSuite || "TLS_AES_128_GCM_SHA256"}`,
        kind: "return",
        phase: 0,
        latencyMs: 3,
        status: 200
      });
    }

    // HTTP Request
    const pathStr = urlObj.pathname + (urlObj.search || "");
    const shortPath = pathStr.length > 28 ? pathStr.slice(0, 25) + "..." : pathStr;
    const reqLatency = req.sendTime && req.headersReceivedTime
      ? Math.max(1, req.headersReceivedTime - req.sendTime)
      : 25;

    messages.push({
      id: `msg-${msgIdx++}`,
      from: "client",
      to: "edge",
      label: `${req.method} ${shortPath}`,
      detail: `URL: ${req.url}\nHeaders: ${JSON.stringify(req.requestHeaders, null, 2)}`,
      kind: "request",
      phase: 1,
      latencyMs: reqLatency,
      method: req.method,
      bytes: req.bytesRead || 512
    });

    // Proxy to Origin
    messages.push({
      id: `msg-${msgIdx++}`,
      from: "edge",
      to: "origin",
      label: `Route Handler (${req.method})`,
      detail: `Forwarding upstream request to origin cluster`,
      kind: "request",
      phase: 1,
      latencyMs: 12
    });

    // Origin processing / response
    const status = req.statusCode || 200;
    messages.push({
      id: `msg-${msgIdx++}`,
      from: "origin",
      to: "edge",
      label: `${status} ${req.statusText || "OK"} (TTFB ${formatDuration(reqLatency)})`,
      detail: `Response Headers: ${JSON.stringify(req.responseHeaders, null, 2)}`,
      kind: "return",
      phase: 2,
      latencyMs: reqLatency,
      status,
      bytes: req.bytesRead
    });

    // Stream to client
    messages.push({
      id: `msg-${msgIdx++}`,
      from: "edge",
      to: "client",
      label: `Stream Complete (${formatBytes(req.bytesRead || 2048)})`,
      detail: `Total Transfer: ${formatBytes(req.bytesRead || 2048)}, Duration: ${formatDuration(req.endTime - req.startTime)}`,
      kind: "return",
      phase: 2,
      latencyMs: Math.max(2, (req.endTime - req.startTime) - reqLatency),
      status,
      bytes: req.bytesRead
    });
  }

  return {
    title,
    timestamp: new Date().toISOString(),
    summary: {
      totalRequests: requests.length,
      primaryHost,
      sampleDuration: formatDuration(requests[requests.length - 1].endTime - requests[0].startTime)
    },
    phases,
    participants,
    messages
  };
}
