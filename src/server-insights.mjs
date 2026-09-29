/**
 * Server-reported evidence from response headers already recorded in a capture:
 * Server-Timing, CDN and cache headers, other timing-like headers, and request IDs.
 *
 * Everything here is what a server said about itself, not something the browser
 * measured. Server-Timing metrics can overlap or nest, so they are never added
 * together. An absent header is null, never zero.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

const MAX_METRICS = 50;
const MAX_DESC = 120;
const MAX_VALUE = 120;

const ID_HEADERS = new Set([
  "request-id", "client-request-id", "x-request-id", "x-correlation-id", "x-correlationid",
  "sprequestguid", "x-ms-request-id", "x-azure-ref", "cf-ray", "x-amz-cf-id"
]);

// Names that look like a timing, matched loosely on purpose. Values are shown raw:
// what a site means by them is the site's own business.
const TIMING_NAME = /(duration|latency|elapsed|processing|response-?time|service-?time|runtime)/i;
const TIMING_VALUE = /^\d+(\.\d+)?\s*(ms|s|us|µs)?$/i;

const PROVIDERS = [
  ["Cloudflare", h => h["cf-ray"] != null ? "cf-ray" : h["cf-cache-status"] != null ? "cf-cache-status" : /cloudflare/i.test(h.server || "") ? "server" : null],
  ["Amazon CloudFront", h => h["x-amz-cf-id"] != null ? "x-amz-cf-id" : h["x-amz-cf-pop"] != null ? "x-amz-cf-pop" : /cloudfront/i.test(h.via || "") ? "via" : null],
  ["Azure Front Door or CDN", h => h["x-azure-ref"] != null ? "x-azure-ref" : null],
  ["Microsoft edge network", h => h["x-msedge-ref"] != null ? "x-msedge-ref" : null],
  ["Fastly", h => h["x-fastly-request-id"] != null ? "x-fastly-request-id" : /^cache-/i.test(h["x-served-by"] || "") ? "x-served-by" : null],
  ["Akamai", h => /akamai/i.test(h.server || "") ? "server" : Object.keys(h).some(name => name.startsWith("x-akamai-")) ? "x-akamai-*" : null],
  ["Varnish", h => /varnish/i.test(h.via || "") ? "via" : null]
];

export function isRequestIdHeader(name) {
  return ID_HEADERS.has(String(name || "").toLowerCase());
}

function splitTop(text, separator) {
  const parts = [];
  let current = "";
  let quoted = false;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (quoted && ch === "\\") { current += ch; escaped = true; continue; }
    if (ch === '"') quoted = !quoted;
    if (ch === separator && !quoted) { parts.push(current); current = ""; continue; }
    current += ch;
  }
  parts.push(current);
  return parts;
}

function unquote(value) {
  const text = value.trim();
  return text.startsWith('"') && text.endsWith('"') && text.length >= 2 ? text.slice(1, -1).replace(/\\(.)/g, "$1") : text;
}

/** Parses one Server-Timing header value into { name, dur, desc } metrics. */
export function parseServerTiming(value) {
  const metrics = [];
  for (const raw of splitTop(String(value ?? ""), ",")) {
    if (metrics.length >= MAX_METRICS) break;
    const [head, ...params] = splitTop(raw, ";");
    const name = head.trim().slice(0, 64);
    if (!name) continue;
    let dur = null;
    let desc = null;
    for (const param of params) {
      const eq = param.indexOf("=");
      if (eq < 0) continue;
      const key = param.slice(0, eq).trim().toLowerCase();
      const text = unquote(param.slice(eq + 1));
      if (key === "dur" && /^(\d+(\.\d*)?|\.\d+)$/.test(text)) dur = Number(text);
      if (key === "desc") desc = text.slice(0, MAX_DESC);
    }
    metrics.push({ name, dur, desc });
  }
  return metrics;
}

function cacheState(header, value) {
  const text = String(value);
  const hit = header === "cf-cache-status" ? /hit|revalidated|stale/i.test(text) : /\bhit\b|_hit\b|hit from/i.test(text);
  const miss = /miss|bypass|dynamic|expired/i.test(text);
  if (hit && miss) return "mixed";
  if (hit) return "hit";
  if (miss) return "miss";
  return "other";
}

/** What one response's headers say about the server, or null when they say nothing. */
export function inspectResponse(request) {
  const lines = request?.responseHeaders;
  if (!Array.isArray(lines) || !lines.length) return null;
  const headers = {};
  const metrics = [];
  const ids = [];
  const timingHeaders = [];
  for (const line of lines) {
    const colon = typeof line === "string" ? line.indexOf(":") : -1;
    if (colon <= 0) continue;
    const name = line.slice(0, colon).trim();
    const lower = name.toLowerCase();
    const value = line.slice(colon + 1).trim().slice(0, MAX_VALUE * 4);
    if (headers[lower] == null) headers[lower] = value;
    if (lower === "server-timing") {
      for (const metric of parseServerTiming(value)) if (metrics.length < MAX_METRICS) metrics.push(metric);
    } else if (ID_HEADERS.has(lower)) {
      ids.push({ name, value: value.slice(0, MAX_VALUE) });
    } else if (TIMING_NAME.test(lower) && TIMING_VALUE.test(value)) {
      timingHeaders.push({ name, value });
    }
  }
  let cache = null;
  for (const header of ["cf-cache-status", "x-cache"]) {
    if (headers[header] != null) { cache = { header, value: headers[header].slice(0, MAX_VALUE), state: cacheState(header, headers[header]) }; break; }
  }
  let provider = null;
  for (const [name, test] of PROVIDERS) {
    const header = test(headers);
    if (header) { provider = { name, header }; break; }
  }
  const age = headers.age != null && /^\d+$/.test(headers.age) ? Number(headers.age) : null;
  const timed = metrics.filter(metric => metric.dur != null);
  const largest = timed.length ? timed.reduce((best, metric) => metric.dur > best.dur ? metric : best) : null;
  if (!metrics.length && !cache && !provider && !ids.length && !timingHeaders.length && age == null) return null;
  return {
    id: request.id,
    metrics,
    largest: largest ? { name: largest.name, dur: largest.dur } : null,
    cache,
    age,
    via: headers.via ? headers.via.slice(0, MAX_VALUE) : null,
    provider,
    ids,
    timingHeaders
  };
}

function pathOf(url) {
  try { return new URL(url).pathname || "/"; } catch { return String(url || "").split("?")[0]; }
}

/** Page-level rollup of server-reported evidence across the given requests. */
export function buildServerInsights(requests) {
  const list = Array.isArray(requests) ? requests : [];
  const answered = list.filter(r => Array.isArray(r?.responseHeaders) && r.responseHeaders.length);
  const perRequest = new Map();
  const cache = { hit: 0, miss: 0, mixed: 0, other: 0, none: 0, withHeaders: 0 };
  const providers = new Map();
  const leaderboard = [];
  const timingHeaders = [];
  const idRows = [];
  let withTiming = 0;
  for (const r of answered) {
    const info = inspectResponse(r);
    if (!info) continue;
    perRequest.set(r.id, info);
    const waitMs = r.timing?.wait ?? null;
    const path = pathOf(r.url);
    if (info.metrics.length) withTiming++;
    for (const metric of info.metrics) {
      if (metric.dur != null) leaderboard.push({ id: r.id, host: r.host, path, url: r.url, name: metric.name, dur: metric.dur, desc: metric.desc, waitMs });
    }
    if (info.cache) { cache[info.cache.state]++; cache.withHeaders++; }
    if (info.provider) {
      const entry = providers.get(info.provider.name) || { name: info.provider.name, header: info.provider.header, count: 0, hosts: new Set() };
      entry.count++;
      if (r.host) entry.hosts.add(r.host);
      providers.set(info.provider.name, entry);
    }
    for (const header of info.timingHeaders) timingHeaders.push({ id: r.id, host: r.host, name: header.name, value: header.value });
    if (info.ids.length) idRows.push({ id: r.id, host: r.host, path, waitMs, ids: info.ids });
  }
  cache.none = answered.length - cache.withHeaders;
  leaderboard.sort((a, b) => b.dur - a.dur || (b.waitMs ?? 0) - (a.waitMs ?? 0));
  idRows.sort((a, b) => (b.waitMs ?? -1) - (a.waitMs ?? -1));
  const providerList = [...providers.values()].sort((a, b) => b.count - a.count)
    .map(entry => ({ name: entry.name, header: entry.header, count: entry.count, hosts: [...entry.hosts].sort().slice(0, 5) }));
  const uniqueTiming = [];
  const seen = new Set();
  for (const header of timingHeaders) {
    const key = `${header.host}|${header.name.toLowerCase()}|${header.value}`;
    if (!seen.has(key)) { seen.add(key); uniqueTiming.push(header); }
  }
  const top = leaderboard.slice(0, 8);
  return {
    answered: answered.length,
    withTiming,
    cache,
    providers: providerList,
    leaderboard: top,
    largest: top[0] || null,
    timingHeaders: uniqueTiming.slice(0, 8),
    ids: idRows.slice(0, 6),
    perRequest,
    hasAnything: perRequest.size > 0
  };
}

const ms = (value) => `${Math.round(value * 10) / 10} ms`;

/** A short plain-text section for the AI handoff. */
export function serverInsightsText(insights) {
  const lines = ["SERVER-REPORTED TIMING AND CACHE HEADERS (reported by the servers in response headers, not measured by the browser)"];
  if (!insights?.hasAnything) {
    lines.push("No response carried Server-Timing, CDN or cache headers, timing-like headers, or request IDs. Waiting time cannot be split into server work and network delay from this capture.");
    return lines.join("\n");
  }
  lines.push(`Server-Timing: present on ${insights.withTiming} of ${insights.answered} responses. Metrics can overlap and are not added together; names and meanings are the site's own.`);
  for (const row of insights.leaderboard.slice(0, 5)) {
    lines.push(`- ${row.name} ${ms(row.dur)}${row.waitMs != null ? ` (wait ${ms(row.waitMs)})` : ""} on ${row.host || "unknown host"}${row.path}`);
  }
  const { cache } = insights;
  if (cache.withHeaders) lines.push(`Cache or CDN headers: ${cache.withHeaders} of ${insights.answered} responses (hit ${cache.hit}, miss ${cache.miss}, mixed ${cache.mixed}, other ${cache.other}). These are the CDN's own claims.`);
  if (insights.providers.length) lines.push(`Headers suggest: ${insights.providers.map(p => `${p.name} (${p.header}, ${p.count})`).join("; ")}. This is inferred from header names.`);
  if (insights.timingHeaders.length) lines.push(`Other timing-like headers, unit and meaning defined by the site: ${insights.timingHeaders.slice(0, 5).map(h => `${h.name}=${h.value} (${h.host})`).join("; ")}.`);
  if (insights.ids.length) lines.push(`Request IDs for the server team: ${insights.ids.slice(0, 3).map(row => `${row.path}${row.waitMs != null ? ` (wait ${ms(row.waitMs)})` : ""}: ${row.ids.slice(0, 2).map(i => `${i.name}=${i.value}`).join(", ")}`).join("; ")}.`);
  return lines.join("\n");
}
