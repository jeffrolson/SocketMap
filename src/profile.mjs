/**
 * Performance profile enrichment: places a DevTools Performance profile (already reduced by
 * trace-stream) on the NetLog's timeline. A profile's clock is not the NetLog's, so the two
 * are aligned from the requests they both recorded (method plus URL, paired in time order):
 * the median difference in start time is the offset. Nothing is assumed about the clocks.
 * If no request is shared, the two files may still share Chrome's monotonic clock (true when
 * recorded in one browser session, shown on a real pair); that is used only when the profile's
 * navigation falls inside the capture's time span and its page host appears in the capture.
 * Otherwise nothing is placed and the profile's own findings stand alone.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "./redact.mjs";

const OUTLIER_MS = 5000;
const keyOf = (method, url) => `${String(method || "GET").toUpperCase()} ${redactUrl(String(url || "").split("#")[0])}`;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };

const secs = (value) => value == null ? "not recorded" : `${(value / 1000).toFixed(2)} s`;
const ms = (value) => value == null ? "not recorded" : `${Math.round(value)} ms`;
const fileOf = (url) => (String(url || "").split("?")[0].split("/").filter(Boolean).slice(-1)[0]) || url || "inline script";

/** Returns the enrichment, or null when the file was not a usable profile. */
export function joinProfile(model, trace) {
  if (!trace?.recognized || !trace.page) return null;
  const netRequests = Array.isArray(model?.requests) ? model.requests : [];
  const traceRequests = Array.isArray(trace.requests) ? trace.requests : [];

  const netByKey = new Map();
  for (const request of [...netRequests].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) {
    const key = keyOf(request.method, request.url);
    if (!netByKey.has(key)) netByKey.set(key, []);
    netByKey.get(key).push(request);
  }
  const traceByKey = new Map();
  for (const request of traceRequests) {
    const key = keyOf(request.method, request.url);
    if (!traceByKey.has(key)) traceByKey.set(key, []);
    traceByKey.get(key).push(request);
  }
  const pairs = [];
  for (const [key, list] of traceByKey) {
    const partners = netByKey.get(key) || [];
    for (let i = 0; i < Math.min(list.length, partners.length); i++) pairs.push({ net: partners[i], trace: list[i], unique: list.length === 1 && partners.length === 1 });
  }
  const unique = pairs.filter(p => p.unique);
  const basis = unique.length >= 3 ? unique : pairs;
  let offset = median(basis.map(p => (p.net.start ?? 0) - p.trace.tsMs));
  let kept = pairs;
  if (offset != null) {
    kept = pairs.filter(p => Math.abs((p.net.start ?? 0) - p.trace.tsMs - offset) <= OUTLIER_MS);
    offset = median(kept.map(p => (p.net.start ?? 0) - p.trace.tsMs));
  }
  let method = "requests";
  let aligned = offset != null && kept.length > 0;
  if (!aligned) {
    // Fallback: the shared browser clock. NetLog event times and trace timestamps are both Chrome ticks.
    const first = model?.diagnostics?.firstTime;
    const last = model?.diagnostics?.lastTime;
    const nav = trace.page.navTsMs;
    const host = hostOf(trace.page.url);
    const inSpan = typeof first === "number" && typeof last === "number" && typeof nav === "number" && nav >= first - 1000 && nav <= last + 1000;
    const sameSite = host != null && netRequests.some(r => hostOf(r.url) === host);
    if (inSpan && sameSite) { offset = -first; kept = []; aligned = true; method = "clock"; }
  }
  const deviations = kept.map(p => Math.abs((p.net.start ?? 0) - p.trace.tsMs - offset));
  const toNet = (traceMs) => traceMs + offset;

  const perRequest = new Map();
  for (const p of kept) perRequest.set(p.net.id, { stack: p.trace.stack, renderBlocking: p.trace.renderBlocking, resourceType: p.trace.resourceType, priority: p.trace.priority, viaServiceWorker: p.trace.viaServiceWorker === true, fromCache: p.trace.fromCache === true });

  const startAt = aligned ? toNet(trace.page.navTsMs) : null;
  const rel = (value) => (aligned && value != null ? startAt + value : null);
  const m = trace.metrics || {};
  const milestones = aligned ? [
    ["DOMContentLoaded", m.domContentLoadedMs], ["First contentful paint", m.fcpMs], ["Largest contentful paint", m.lcpMs], ["Load", m.loadMs]
  ].filter(([, at]) => at != null).map(([label, at]) => ({ label, atMs: rel(at) })).sort((a, b) => a.atMs - b.atMs) : [];

  const thread = trace.mainThread || { longTasks: [], bins: [], binMs: 20 };
  return {
    source: { eventCount: trace.eventCount ?? null, integrity: trace.integrity || null, capturedAt: trace.environment?.capturedAt ?? null },
    alignment: {
      aligned,
      method,
      matched: kept.length,
      traceRequests: traceRequests.length,
      offsetMs: aligned ? offset : null,
      within50: deviations.filter(d => d <= 50).length,
      within500: deviations.filter(d => d <= 500).length,
      medianSpreadMs: aligned ? median(deviations) : null
    },
    page: { url: trace.page.url, startAt, spanMs: trace.page.spanMs ?? null },
    metrics: m,
    milestones,
    mainThread: { ...thread, longTasks: (thread.longTasks || []).map(t => ({ ...t, atMs: rel(t.startMs) })), bandStartAt: startAt },
    scripts: trace.scripts || [],
    environment: trace.environment || {},
    perRequest
  };
}

/** A short plain-text section for the AI handoff. */
export function profileEvidenceText(profile) {
  if (!profile) return "";
  const { metrics: m, mainThread: t, scripts, environment: env, alignment } = profile;
  const lines = ["PERFORMANCE PROFILE (a DevTools Performance recording read alongside this NetLog; it describes what the page's code and rendering did, and does not prove a cause)"];
  lines.push(alignment.aligned ? (alignment.method === "clock" ? "Placed on the network timeline by the browser's shared clock (no request was recorded by both files; the profile's start falls inside the capture and its site appears in it)." : `Placed on the network timeline using ${alignment.matched} requests both files recorded (${alignment.within50} agree within 50 ms).`) : "Not placed on the network timeline: no request was recorded by both files and the two files do not share a clock, so page code cannot be lined up with individual requests.");
  lines.push(`Milestones after navigation start: first contentful paint ${secs(m.fcpMs)}, largest contentful paint ${secs(m.lcpMs)}${m.lcpType ? ` (${m.lcpType})` : ""}, DOMContentLoaded ${secs(m.domContentLoadedMs)}, load ${secs(m.loadMs)}; layout shift score ${m.layoutShiftScore == null ? "not recorded" : m.layoutShiftScore.toFixed(3)}. Responsiveness (INP) needs interaction and is not in a load profile.`);
  lines.push(`Main thread: busy ${ms(t.loadBusyMs)} of the first ${secs(t.loadWindowMs)} (until load); ${t.longTaskCount} long task(s) over 50 ms, ${ms(t.blockingMs)} beyond that threshold; longest ${ms(t.longestMs)}.`);
  for (const task of (t.longTasks || []).slice(0, 5)) lines.push(`- long task ${ms(task.durMs)} at +${secs(task.startMs)}: ${task.top.length ? task.top.map(s => `${fileOf(s.url)} ${ms(s.ms)}`).join(", ") : "no script recorded"}${task.layoutMs > 5 ? `, layout ${ms(task.layoutMs)}` : ""}`);
  if (scripts.length) lines.push(`Scripts by main-thread time: ${scripts.slice(0, 5).map(s => `${fileOf(s.url)} ${ms(s.totalMs)}`).join("; ")}.`);
  if (env.cores != null || env.memoryGb != null) lines.push(`Machine: ${env.cores ?? "unknown"} cores${env.memoryGb != null ? `, ${env.memoryGb} GB memory` : ""}. Load on the machine is not recorded.`);
  return lines.join("\n");
}

/** Attaches the profile to the capture model so every downstream view can read it. */
export function attachProfile(model, trace) {
  const profile = joinProfile(model, trace);
  if (profile) model.profile = profile;
  return profile;
}
