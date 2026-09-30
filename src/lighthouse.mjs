/**
 * Lighthouse enrichment: reads a Lighthouse JSON report (from the command line, PageSpeed
 * Insights or DevTools "Save as JSON") and joins its findings to a NetLog capture.
 *
 * A Lighthouse run is a separate LAB load of the page, usually with simulated throttling, so its
 * numbers are estimates from another load and are labeled as such; they are never presented as
 * what happened in the capture. The reader keeps a bounded allowlist: scores, the core metrics,
 * failing audits with the URLs and sizes they name, and script and main-thread time. Screenshots,
 * page snippets and node details, translations and the audit prose are dropped.
 *
 * Handles classic audits (unused-javascript, render-blocking-resources, ...) and Lighthouse 12+
 * insight audits (render-blocking-insight, cache-insight, ...). Anything absent is null.
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "./redact.mjs";

const METRICS = [["fcp", "first-contentful-paint", "First contentful paint"], ["lcp", "largest-contentful-paint", "Largest contentful paint"], ["tbt", "total-blocking-time", "Total blocking time"], ["cls", "cumulative-layout-shift", "Cumulative layout shift"], ["si", "speed-index", "Speed Index"], ["tti", "interactive", "Time to interactive"]];
const MAX_AUDITS = 12;
const MAX_ITEMS = 6;

const text = (value, max = 140) => (typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const score = (value) => (typeof value === "number" && value >= 0 && value <= 1 ? Math.round(value * 100) / 100 : null);
const url = (value) => (typeof value === "string" && /^https?:/i.test(value) ? redactUrl(value.split("#")[0]).slice(0, 600) : null);
const round = (value) => (num(value) == null ? null : Math.round(value * 10) / 10);

export function scoreLevel(value) {
  if (value == null) return "unknown";
  return value >= 0.9 ? "good" : value >= 0.5 ? "fair" : "poor";
}

/** Returns { recognized, data } for a parsed Lighthouse report. Never throws. */
export function readLighthouse(input) {
  if (!input || typeof input !== "object" || Array.isArray(input) || typeof input.lighthouseVersion !== "string" || !input.audits || typeof input.audits !== "object") return { recognized: false, data: null };
  const audits = input.audits;
  const settings = input.configSettings || {};
  const throttling = settings.throttling || {};
  const fetched = typeof input.fetchTime === "string" ? Date.parse(input.fetchTime) : NaN;

  const metrics = {};
  for (const [key, id, label] of METRICS) {
    const a = audits[id];
    metrics[key] = a && num(a.numericValue) != null ? { label, value: round(a.numericValue), unit: a.numericUnit === "unitless" ? "" : "ms", score: score(a.score) } : null;
  }

  const findings = [];
  for (const [id, a] of Object.entries(audits)) {
    if (findings.length >= MAX_AUDITS * 3) break;
    if (!a || typeof a !== "object" || a.score == null || a.score >= 0.9 || a.scoreDisplayMode === "informative" || a.scoreDisplayMode === "notApplicable" || a.scoreDisplayMode === "manual") continue;
    if (METRICS.some(m => m[1] === id)) continue;
    const d = a.details && typeof a.details === "object" ? a.details : null;
    const raw = Array.isArray(d?.items) ? d.items : [];
    const items = raw.map(item => {
      const u = url(item?.url);
      if (!u) return null;
      return { url: u, wastedBytes: round(item.wastedBytes), totalBytes: round(item.totalBytes), wastedMs: round(item.wastedMs), cacheLifetimeMs: round(item.cacheLifetimeMs) };
    }).filter(Boolean);
    if (!items.length && !raw.length && !num(a.numericValue)) continue;
    findings.push({
      id: text(id, 80), title: text(a.title, 120), score: score(a.score), displayValue: text(a.displayValue, 80),
      savingsMs: round(d?.overallSavingsMs ?? (a.scoreDisplayMode === "metricSavings" ? a.numericValue : null)), savingsBytes: round(d?.overallSavingsBytes),
      itemCount: raw.length, items: items.slice(0, MAX_ITEMS)
    });
  }
  findings.sort((x, y) => (x.score ?? 1) - (y.score ?? 1) || (y.savingsMs ?? 0) - (x.savingsMs ?? 0));

  const boot = Array.isArray(audits["bootup-time"]?.details?.items) ? audits["bootup-time"].details.items : [];
  const work = Array.isArray(audits["mainthread-work-breakdown"]?.details?.items) ? audits["mainthread-work-breakdown"].details.items : [];
  const longTasks = Array.isArray(audits["long-tasks"]?.details?.items) ? audits["long-tasks"].details.items : [];
  const requests = Array.isArray(audits["network-requests"]?.details?.items) ? audits["network-requests"].details.items : [];

  const data = {
    version: text(input.lighthouseVersion, 20),
    url: url(input.finalDisplayedUrl || input.finalUrl || input.requestedUrl),
    fetchedAt: Number.isFinite(fetched) ? new Date(fetched).toISOString() : null,
    formFactor: ["mobile", "desktop"].includes(settings.formFactor) ? settings.formFactor : null,
    throttlingMethod: ["simulate", "devtools", "provided"].includes(settings.throttlingMethod) ? settings.throttlingMethod : null,
    throttling: { rttMs: round(throttling.rttMs), throughputKbps: round(throttling.throughputKbps), cpuSlowdown: round(throttling.cpuSlowdownMultiplier) },
    warnings: (Array.isArray(input.runWarnings) ? input.runWarnings : []).slice(0, 5).map(w => text(typeof w === "string" ? w : "", 200)).filter(Boolean),
    categories: Object.values(input.categories || {}).slice(0, 6).map(c => ({ id: text(c?.id, 40), title: text(c?.title, 60), score: score(c?.score) })).filter(c => c.id),
    metrics,
    findings: findings.slice(0, MAX_AUDITS),
    scripts: boot.slice(0, 8).map(item => ({ url: url(item?.url), totalMs: round(item?.total), scriptingMs: round(item?.scripting), parseMs: round(item?.scriptParseCompile) })).filter(item => item.url),
    mainThread: work.slice(0, 10).map(item => ({ label: text(item?.groupLabel || item?.group, 40), ms: round(item?.duration) })).filter(item => item.label && item.ms != null),
    longTasks: { count: longTasks.length, longestMs: longTasks.length ? round(Math.max(...longTasks.map(t => num(t?.duration) ?? 0))) : null },
    totalBytes: num(audits["total-byte-weight"]?.numericValue) == null ? null : Math.round(audits["total-byte-weight"].numericValue),
    domElements: num(audits["dom-size"]?.numericValue) == null ? null : Math.round(audits["dom-size"].numericValue),
    requestCount: requests.length || null
  };
  return { recognized: true, data };
}

/** Joins the report to a capture: which capture requests Lighthouse named, and why. */
export function joinLighthouse(model, data) {
  if (!data) return null;
  const byUrl = new Map();
  for (const request of model?.requests || []) {
    const key = redactUrl(String(request.url || "").split("#")[0]);
    if (!byUrl.has(key)) byUrl.set(key, []);
    byUrl.get(key).push(request);
  }
  // Asset URLs often carry a per-load hash or version in the query. When no request has the exact URL, a request
  // with the same address minus the query matches only if it is the only one, and is marked as similar.
  const byPath = new Map();
  for (const [key, list] of byUrl) {
    const path = key.split("?")[0];
    if (!byPath.has(path)) byPath.set(path, []);
    byPath.get(path).push(...list);
  }
  const perRequest = new Map();
  const named = new Set();
  const matchedUrls = new Set();
  for (const finding of data.findings) {
    for (const item of finding.items) {
      let matches = byUrl.get(item.url) || [];
      let similar = false;
      if (!matches.length) { const candidates = byPath.get(item.url.split("?")[0]) || []; if (candidates.length === 1) { matches = candidates; similar = true; } }
      for (const request of matches) {
        if (!perRequest.has(request.id)) perRequest.set(request.id, []);
        perRequest.get(request.id).push({ id: finding.id, title: finding.title, wastedBytes: item.wastedBytes, totalBytes: item.totalBytes, cacheLifetimeMs: item.cacheLifetimeMs, wastedMs: item.wastedMs, similar });
        named.add(request.id);
        matchedUrls.add(item.url);
      }
    }
  }
  const namedUrls = new Set(data.findings.flatMap(f => f.items.map(i => i.url)));
  const captured = Date.parse(model?.environment?.captureStartedAt);
  const fetched = data.fetchedAt ? Date.parse(data.fetchedAt) : NaN;
  const pageUrl = data.url;
  const captureHosts = new Set((model?.requests || []).map(r => r.host).filter(Boolean));
  let sameSite = null;
  try { sameSite = pageUrl ? captureHosts.has(new URL(pageUrl).host) : null; } catch { sameSite = null; }
  return {
    source: data, perRequest,
    join: { requestsNamed: named.size, urlsNamed: namedUrls.size, urlsInCapture: matchedUrls.size },
    gapMinutes: Number.isFinite(captured) && Number.isFinite(fetched) ? Math.round((fetched - captured) / 60000) : null,
    sameSite
  };
}

const kb = (bytes) => (bytes == null ? "not recorded" : bytes >= 1048576 ? `${(bytes / 1048576).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`);
const ms = (value) => (value == null ? "not recorded" : value >= 1000 ? `${(value / 1000).toFixed(2)} s` : `${Math.round(value)} ms`);

/** A short plain-text section for the AI handoff. */
export function lighthouseEvidenceText(lh) {
  if (!lh) return "";
  const d = lh.source;
  const lines = [`LIGHTHOUSE (a separate lab load of the page, ${d.formFactor || "form factor not recorded"}, ${d.throttlingMethod === "simulate" ? "simulated throttling: modeled estimates" : d.throttlingMethod ? `${d.throttlingMethod} throttling` : "throttling not recorded"}; not the load in this capture; Lighthouse ${d.version || "version not recorded"})`];
  lines.push(`Scores: ${d.categories.map(c => `${c.title || c.id} ${c.score == null ? "not recorded" : Math.round(c.score * 100)}`).join(", ") || "not recorded"}.`);
  lines.push(`Metrics: ${Object.values(d.metrics).filter(Boolean).map(m => `${m.label} ${m.unit ? ms(m.value) : m.value}`).join("; ") || "not recorded"}.`);
  for (const f of d.findings.slice(0, 6)) lines.push(`- ${f.title}${f.displayValue ? ` (${f.displayValue})` : ""}: score ${f.score == null ? "n/a" : Math.round(f.score * 100)}${f.savingsMs ? `, est. ${ms(f.savingsMs)}` : ""}${f.savingsBytes ? `, ${kb(f.savingsBytes)}` : ""}; ${f.itemCount} item${f.itemCount === 1 ? "" : "s"}${f.items[0] ? `, e.g. ${f.items[0].url.split("?")[0]}` : ""}.`);
  if (d.scripts.length) lines.push(`Script time (lab): ${d.scripts.slice(0, 4).map(s => `${s.url.split("?")[0].split("/").filter(Boolean).slice(-1)[0] || s.url} ${ms(s.totalMs)}`).join("; ")}.`);
  lines.push(`Joined to this capture: ${lh.join.urlsInCapture} of ${lh.join.urlsNamed} URLs Lighthouse named also appear in the capture${lh.gapMinutes == null ? "" : `; the run was ${Math.abs(lh.gapMinutes)} minutes ${lh.gapMinutes >= 0 ? "after" : "before"} the capture`}. Lab numbers are estimates and will differ from a real load.`);
  return lines.join("\n");
}

/** Attaches the Lighthouse result to the capture model so every downstream view can read it. */
export function attachLighthouse(model, data) {
  const lighthouse = joinLighthouse(model, data);
  if (lighthouse) model.lighthouse = lighthouse;
  return lighthouse;
}
