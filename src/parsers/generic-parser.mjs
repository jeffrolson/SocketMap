/**
 * SocketMap Generic Parser
 * Ingests HAR (HTTP Archive) files, OpenTelemetry/generic span traces,
 * or raw JSON intermediate representations.
 */

import { readFileSync, createReadStream, openSync, readSync, closeSync } from "node:fs";
import { createGunzip } from "node:zlib";
import { createHarReader } from "./har-stream.mjs";
import { createTraceReader } from "./trace-stream.mjs";
import { normalizeTrace, redactSensitiveData, formatBytes, formatDuration } from "../normalizer.mjs";

/**
 * Checks whether the given object is a HAR trace.
 */
export function isHarTrace(data) {
  return Boolean(data && data.log && Array.isArray(data.log.entries));
}

/**
 * Checks whether the given object is an OpenTelemetry or span-based trace.
 */
export function isSpanTrace(data) {
  return Boolean(data && Array.isArray(data.spans));
}

/**
 * Parses HAR data into canonical IR format.
 */
export function parseHar(harData, options = {}) {
  const filterRegex = options.filter ? new RegExp(options.filter, "i") : null;
  const maxEntries = options.maxEntries || 20;

  let entries = harData.log?.entries || [];
  if (filterRegex) {
    entries = entries.filter(e =>
      filterRegex.test(e.request?.url || "") || filterRegex.test(e.request?.method || "")
    );
  }

  if (entries.length === 0) {
    throw new Error("No matching requests found in HAR file.");
  }

  if (entries.length > maxEntries) {
    entries = entries.slice(0, maxEntries);
  }

  const firstEntry = entries[0];
  let primaryHost = "api.service";
  try {
    primaryHost = new URL(firstEntry.request.url).hostname;
  } catch {
    // Fallback
  }

  const title = `HAR Network Trace: ${firstEntry.request.method} ${primaryHost}`;
  const phases = [
    "Phase 01: Connection & TLS",
    "Phase 02: HTTP Request",
    "Phase 03: Response & Content"
  ];

  const participants = [
    {
      id: "client",
      label: "Browser Client",
      sublabel: harData.log.creator?.name ? `${harData.log.creator.name} User` : "Client Session",
      role: "client",
      color: "#06b6d4"
    },
    {
      id: "dns",
      label: "DNS Resolver",
      sublabel: "Name Resolution",
      role: "dns",
      color: "#8b5cf6"
    },
    {
      id: "edge",
      label: primaryHost,
      sublabel: firstEntry.serverIPAddress ? `IP: ${firstEntry.serverIPAddress}` : "Edge Proxy",
      role: "gateway",
      color: "#10b981"
    },
    {
      id: "api",
      label: "Origin Server",
      sublabel: "API Service",
      role: "service",
      color: "#f59e0b"
    }
  ];

  const messages = [];
  let msgIdx = 1;

  for (const entry of entries) {
    const req = entry.request;
    const res = entry.response;
    const timings = entry.timings || {};
    let urlObj;
    try {
      urlObj = new URL(req.url);
    } catch {
      urlObj = { pathname: req.url, hostname: primaryHost };
    }

    // DNS step
    if (timings.dns > 0) {
      messages.push({
        id: `msg-${msgIdx++}`,
        from: "client",
        to: "dns",
        label: `DNS Lookup ${urlObj.hostname}`,
        detail: `DNS lookup timing: ${formatDuration(timings.dns)}`,
        kind: "request",
        phase: 0,
        latencyMs: timings.dns,
        method: "DNS"
      });

      messages.push({
        id: `msg-${msgIdx++}`,
        from: "dns",
        to: "client",
        label: entry.serverIPAddress || "Resolved IP",
        detail: `Resolved IP: ${entry.serverIPAddress || "N/A"}`,
        kind: "return",
        phase: 0,
        latencyMs: 1,
        status: 200
      });
    }

    // Connect & TLS step
    const connectTime = (timings.connect > 0 ? timings.connect : 0) + (timings.ssl > 0 ? timings.ssl : 0);
    if (connectTime > 0) {
      messages.push({
        id: `msg-${msgIdx++}`,
        from: "client",
        to: "edge",
        label: `TCP + TLS Handshake (${formatDuration(connectTime)})`,
        detail: `Connect: ${formatDuration(timings.connect)}, SSL: ${formatDuration(timings.ssl)}`,
        kind: "request",
        phase: 0,
        latencyMs: connectTime
      });

      messages.push({
        id: `msg-${msgIdx++}`,
        from: "edge",
        to: "client",
        label: "TLS Connection Established",
        detail: `Protocol: ${entry.response.httpVersion || "HTTP/2"}`,
        kind: "return",
        phase: 0,
        latencyMs: 2,
        status: 200
      });
    }

    // Request step
    const shortPath = urlObj.pathname.length > 25
      ? urlObj.pathname.slice(0, 22) + "..."
      : urlObj.pathname;
    const reqBytes = req.bodySize > 0 ? req.bodySize : req.headersSize > 0 ? req.headersSize : 256;

    messages.push({
      id: `msg-${msgIdx++}`,
      from: "client",
      to: "edge",
      label: `${req.method} ${shortPath}`,
      detail: `URL: ${req.url}\nHeaders: ${JSON.stringify(redactSensitiveData(req.headers), null, 2)}`,
      kind: "request",
      phase: 1,
      latencyMs: timings.send > 0 ? timings.send : 5,
      method: req.method,
      bytes: reqBytes
    });

    // Proxy Pass
    messages.push({
      id: `msg-${msgIdx++}`,
      from: "edge",
      to: "api",
      label: `Upstream Handler (${req.method})`,
      detail: `Forwarding request to origin cluster`,
      kind: "request",
      phase: 1,
      latencyMs: 8
    });

    // Server Response (TTFB)
    const ttfb = timings.wait > 0 ? timings.wait : 20;
    const resSize = res.content?.size || res.bodySize || 1024;

    messages.push({
      id: `msg-${msgIdx++}`,
      from: "api",
      to: "edge",
      label: `${res.status} ${res.statusText || "OK"} (TTFB ${formatDuration(ttfb)})`,
      detail: `Status: ${res.status}\nHeaders: ${JSON.stringify(redactSensitiveData(res.headers), null, 2)}`,
      kind: "return",
      phase: 2,
      latencyMs: ttfb,
      status: res.status,
      bytes: resSize
    });

    // Client receive
    messages.push({
      id: `msg-${msgIdx++}`,
      from: "edge",
      to: "client",
      label: `Content Transferred (${formatBytes(resSize)})`,
      detail: `MIME: ${res.content?.mimeType || "text/plain"}, Receive Time: ${formatDuration(timings.receive || 10)}`,
      kind: "return",
      phase: 2,
      latencyMs: timings.receive || 10,
      status: res.status,
      bytes: resSize
    });
  }

  return normalizeTrace({
    title,
    phases,
    participants,
    messages
  });
}

/**
 * Parses generic spans (e.g. OpenTelemetry trace) into IR.
 */
export function parseSpanTrace(data) {
  const spans = data.spans || [];
  if (spans.length === 0) {
    throw new Error("No spans found in trace object");
  }

  const participantsMap = new Map();
  participantsMap.set("client", {
    id: "client",
    label: "Trace Caller",
    sublabel: "Root Invoker",
    role: "client",
    color: "#06b6d4"
  });

  const messages = [];
  const phasesSet = new Set(["Execution"]);

  spans.forEach((span, idx) => {
    const service = span.attributes?.["service.name"] || span.service || "service";
    const serviceId = service.toLowerCase().replace(/[^a-z0-9]/g, "_");

    if (!participantsMap.has(serviceId)) {
      participantsMap.set(serviceId, {
        id: serviceId,
        label: service,
        sublabel: "Span Service",
        role: "service",
        color: "#f59e0b"
      });
    }

    const durationMs = span.endTime && span.startTime
      ? Math.round((span.endTime - span.startTime) / 1000000)
      : null;

    messages.push({
      id: `span-${idx + 1}`,
      from: span.parentSpanId ? "service" : "client",
      to: serviceId,
      label: span.name || `Span ${idx + 1}`,
      detail: JSON.stringify(span.attributes || {}, null, 2),
      kind: "request",
      phase: 0,
      latencyMs: durationMs
    });
  });

  return normalizeTrace({
    title: data.title || "Span Execution Trace",
    phases: Array.from(phasesSet),
    participants: Array.from(participantsMap.values()),
    messages
  });
}

/**
 * Auto-detects trace format and parses it.
 */
export function parseGenericTrace(input, options = {}) {
  let parsed;
  if (typeof input === "string") {
    try {
      parsed = JSON.parse(input);
    } catch {
      // If it is a file path
      const content = readFileSync(input, "utf8");
      parsed = JSON.parse(content);
    }
  } else {
    parsed = input;
  }

  // 1. HAR format
  if (isHarTrace(parsed)) {
    return parseHar(parsed, options);
  }

  // 2. OpenTelemetry / Span trace
  if (isSpanTrace(parsed)) {
    return parseSpanTrace(parsed);
  }

  // 3. Native IR
  if (parsed.participants || parsed.messages) {
    return normalizeTrace(parsed);
  }

  throw new Error("Unrecognized trace format: expected HAR, OpenTelemetry spans, or SocketMap IR JSON.");
}

/**
 * Streams a HAR file from disk and returns the bounded summary used to enrich a NetLog
 * report. The file is never held in memory, so response bodies cost nothing.
 */
export async function readHarEnrichment(filePath, options = {}) {
  const reader = createHarReader(options);
  await new Promise((resolve, reject) => {
    const stream = createReadStream(filePath, { encoding: "utf8", highWaterMark: 1024 * 1024 });
    stream.on("data", chunk => reader.write(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return reader.finish();
}

function isGzip(filePath) {
  const fd = openSync(filePath, "r");
  try {
    const bytes = Buffer.alloc(2);
    readSync(fd, bytes, 0, 2, 0);
    return bytes[0] === 0x1f && bytes[1] === 0x8b;
  } finally {
    closeSync(fd);
  }
}

/**
 * Streams a DevTools Performance profile (.json or .json.gz) from disk and returns the bounded
 * summary used to enrich a NetLog report. Never held in memory, so a large profile costs little.
 */
export async function readTraceProfile(filePath) {
  const reader = createTraceReader();
  await new Promise((resolve, reject) => {
    let stream = createReadStream(filePath, { highWaterMark: 1024 * 1024 });
    stream.on("error", reject);
    if (isGzip(filePath)) {
      const gunzip = createGunzip();
      gunzip.on("error", reject);
      stream = stream.pipe(gunzip);
    }
    stream.setEncoding("utf8");
    stream.on("data", chunk => reader.write(chunk));
    stream.on("end", resolve);
    stream.on("error", reject);
  });
  return reader.finish();
}
