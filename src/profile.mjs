/**
 * Performance profile enrichment: places a DevTools Performance profile (already reduced by
 * trace-stream) on the NetLog's timeline. A profile's clock is not the NetLog's, so the two
 * are aligned from the requests they both recorded (method plus URL, paired in time order).
 * A URL alone is weak evidence: an earlier or later page visit can fetch the same URL. A
 * request placement is accepted only when its inferred offset agrees with Chrome's shared
 * monotonic clock and the profile navigation falls in the capture's observed window. If no
 * robust request match exists, clock evidence can place the profile band but never attaches
 * profile details to an individual request.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "./redact.mjs";

const CLOCK_AGREEMENT_MS = 1000;
const MIN_REQUEST_PAIRS = 2;
const keyOf = (method, url) => {
  if (typeof method !== "string" || !method.trim() || typeof url !== "string" || !url.trim()) return null;
  return `${method.trim().toUpperCase()} ${redactUrl(url.split("#")[0])}`;
};

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

const hostOf = (url) => { try { return new URL(url).host; } catch { return null; } };
const finite = (value) => typeof value === "number" && Number.isFinite(value);

const secs = (value) => value == null ? "not recorded" : `${(value / 1000).toFixed(2)} s`;
const ms = (value) => value == null ? "not recorded" : `${Math.round(value)} ms`;
const fileOf = (url) => (String(url || "").split("?")[0].split("/").filter(Boolean).slice(-1)[0]) || url || "inline script";

/** Returns the enrichment, or null when the file was not a usable profile. */
export function joinProfile(model, trace) {
  if (!trace?.recognized || !trace.page) return null;
  const netRequests = Array.isArray(model?.requests) ? model.requests : [];
  const traceRequests = Array.isArray(trace.requests) ? trace.requests : [];

  const netByKey = new Map();
  for (const request of netRequests.filter(request => finite(request?.start)).sort((a, b) => a.start - b.start)) {
    const key = keyOf(request.method, request.url);
    if (!key) continue;
    if (!netByKey.has(key)) netByKey.set(key, []);
    netByKey.get(key).push(request);
  }
  const traceByKey = new Map();
  for (const request of traceRequests.filter(request => finite(request?.tsMs))) {
    const key = keyOf(request.method, request.url);
    if (!key) continue;
    if (!traceByKey.has(key)) traceByKey.set(key, []);
    traceByKey.get(key).push(request);
  }
  const pairs = [];
  for (const [key, list] of traceByKey) {
    const partners = netByKey.get(key) || [];
    for (let i = 0; i < Math.min(list.length, partners.length); i++) pairs.push({ key, net: partners[i], trace: list[i], unique: list.length === 1 && partners.length === 1 });
  }
  const unique = pairs.filter(p => p.unique);

  // NetLog requests are normalized to the capture's first TimeTicks value, while trace
  // timestamps retain Chrome's TimeTicks value. This independent evidence rejects an
  // otherwise convincing URL match from a different recording.
  const first = model?.diagnostics?.firstTime;
  const last = model?.diagnostics?.lastTime;
  const nav = trace.page.navTsMs;
  const host = hostOf(trace.page.url);
  const captureSpan = finite(first) && finite(last) && last >= first ? last - first : null;
  const navInCapture = captureSpan != null && finite(nav) && nav - first >= -CLOCK_AGREEMENT_MS && nav - first <= captureSpan + CLOCK_AGREEMENT_MS;
  const sameSite = host != null && netRequests.some(r => hostOf(r.url) === host);
  const clockOffset = finite(first) ? -first : null;
  const requestOffsets = unique.map(p => p.net.start - p.trace.tsMs);
  const inferredOffset = median(requestOffsets);
  const clockAgreementMs = inferredOffset != null && clockOffset != null ? Math.abs(inferredOffset - clockOffset) : null;
  // A request receives profile details only when it is an unambiguous method+URL match and
  // its own timestamp agrees with the independently recorded browser clock. Redaction can
  // collapse distinct signed URLs, so duplicate keys deliberately never qualify here.
  let kept = clockOffset == null ? [] : unique.filter(p => Math.abs((p.net.start - p.trace.tsMs) - clockOffset) <= CLOCK_AGREEMENT_MS);
  let offset = inferredOffset;
  const robustRequests = inferredOffset != null && kept.length >= MIN_REQUEST_PAIRS && clockAgreementMs != null && clockAgreementMs <= CLOCK_AGREEMENT_MS && navInCapture;
  let method = null;
  let aligned = false;
  let reason = "no shared clock evidence";
  const contradictsClock = unique.length > 0 && clockAgreementMs != null && clockAgreementMs > CLOCK_AGREEMENT_MS;
  if (robustRequests) {
    method = "requests";
    aligned = true;
    reason = "shared requests agree with the capture clock";
  } else if (!finite(first) || !finite(last) || last < first) {
    reason = "capture clock range is not recorded";
  } else if (contradictsClock) {
    reason = "matching URLs disagree with the capture clock";
  } else if (navInCapture && sameSite && clockOffset != null) {
    // This is consistent with a shared clock, but cannot prove which individual requests
    // correspond, so `perRequest` remains empty.
    offset = clockOffset;
    kept = [];
    method = "clock";
    aligned = true;
    reason = "profile navigation is inside the capture on Chrome's shared clock";
  } else if (pairs.length) {
    reason = "shared requests are too few or ambiguous";
  } else if (!navInCapture) {
    reason = "profile navigation is outside the capture window";
  } else if (!sameSite) {
    reason = "profile page host is absent from the capture";
  }
  const deviations = aligned && method === "requests" ? kept.map(p => Math.abs(p.net.start - p.trace.tsMs - offset)) : [];
  const toNet = (traceMs) => traceMs + offset;

  const perRequest = new Map();
  if (method === "requests") for (const p of kept) perRequest.set(p.net.id, { stack: p.trace.stack, renderBlocking: p.trace.renderBlocking, resourceType: p.trace.resourceType, priority: p.trace.priority, viaServiceWorker: p.trace.viaServiceWorker === true, fromCache: p.trace.fromCache === true });

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
      medianSpreadMs: deviations.length ? median(deviations) : null,
      clockAgreementMs,
      reason
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
  lines.push(alignment.aligned ? (alignment.method === "clock" ? "Placed on the network timeline by Chrome's shared clock. No robust shared-request match exists, so no profile detail is attached to an individual request." : `Placed on the network timeline using ${alignment.matched} shared requests that agree with the capture clock (${alignment.within50} agree within 50 ms).`) : `Not placed on the network timeline: ${alignment.reason || "the recordings lack shared timing evidence"}. Page code cannot be lined up with individual requests.`);
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
