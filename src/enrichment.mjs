/**
 * HAR enrichment: joins a DevTools HAR (already reduced by har-stream) to a NetLog capture
 * model. Requests match on method plus redacted URL, pairing repeated URLs by the nearest
 * start time on the shared wall clock. Nothing is guessed: an entry with no partner stays
 * unmatched and is explained, and any value the HAR did not give is null.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "./redact.mjs";

const TOLERANCE_MS = 10000;
const MAX_HAR_ONLY = 60;

const keyOf = (method, url) => `${String(method || "GET").toUpperCase()} ${redactUrl(String(url || "").split("#")[0])}`;

function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)];
}

function reasonFor(entry) {
  if (entry.status != null && entry.status >= 300 && entry.status < 400) return "redirect step";
  if (entry.cache) return "cache";
  if (entry.viaServiceWorker) return "service worker";
  return "not in the NetLog";
}

const bytesText = (value) => value == null ? "not recorded" : value >= 1048576 ? `${(value / 1048576).toFixed(1)} MB` : value >= 1024 ? `${Math.round(value / 1024)} KB` : `${value} B`;
const secondsText = (value) => value == null ? "not recorded" : `${(value / 1000).toFixed(2)} s`;

/** Returns the enrichment for a capture, or null when the file was not a HAR. */
export function joinHar(model, har) {
  if (!har?.recognized) return null;
  const requests = Array.isArray(model?.requests) ? model.requests : [];
  const entries = Array.isArray(har.entries) ? har.entries : [];
  const t0 = Date.parse(model?.environment?.captureStartedAt);
  const clock = Number.isFinite(t0);

  const candidates = new Map();
  for (const request of [...requests].sort((a, b) => (a.start ?? 0) - (b.start ?? 0))) {
    const key = keyOf(request.method, request.url);
    if (!candidates.has(key)) candidates.set(key, []);
    candidates.get(key).push(request);
  }

  const perRequest = new Map();
  const deltas = [];
  const harOnly = [];
  const ordered = clock ? entries.map((entry, index) => ({ entry, index })).sort((a, b) => (a.entry.startedMs ?? 0) - (b.entry.startedMs ?? 0)) : entries.map((entry, index) => ({ entry, index }));
  for (const { entry } of ordered) {
    const list = (candidates.get(keyOf(entry.method, entry.url)) || []).filter(request => !perRequest.has(request.id));
    let match = null;
    if (list.length) {
      if (clock && entry.startedMs != null) {
        let best = Infinity;
        for (const request of list) {
          const delta = Math.abs(entry.startedMs - (t0 + (request.start ?? 0)));
          if (delta < best) { best = delta; match = request; }
        }
        if (best > TOLERANCE_MS) match = null;
        else deltas.push(entry.startedMs - (t0 + (match.start ?? 0)));
      } else match = list[0];
    }
    if (match) perRequest.set(match.id, entry);
    else harOnly.push({ entry, reason: reasonFor(entry) });
  }

  const pageRequests = requests.filter(request => !request.isBackground);
  const types = new Map();
  const initiators = { parser: 0, script: 0, other: 0, none: 0 };
  const requesters = new Map();
  const cacheAnswers = { memory: 0, disk: 0, serviceWorker: 0, other: 0, network: 0 };
  for (const entry of entries) {
    const type = entry.resourceType || "unknown";
    const row = types.get(type) || { type, count: 0, transferBytes: 0, contentBytes: 0 };
    row.count++;
    row.transferBytes += entry.transferSize ?? 0;
    row.contentBytes += entry.contentSize ?? 0;
    types.set(type, row);
    const initiator = entry.initiator;
    if (!initiator) initiators.none++;
    else if (initiator.type === "parser") initiators.parser++;
    else if (initiator.type === "script") initiators.script++;
    else initiators.other++;
    if (initiator) {
      const kind = initiator.type === "script" ? "script" : initiator.type === "parser" ? "parser" : "other";
      const id = kind === "script" ? `script:${initiator.url || "inline"}` : kind === "parser" ? "parser" : "other";
      const row2 = requesters.get(id) || { kind, url: kind === "script" ? initiator.url : null, fn: kind === "script" ? initiator.fn : null, count: 0, transferBytes: 0 };
      row2.count++;
      row2.transferBytes += entry.transferSize ?? 0;
      requesters.set(id, row2);
    }
    if (entry.cache === "memory") cacheAnswers.memory++;
    else if (entry.cache === "disk") cacheAnswers.disk++;
    else if (entry.cache) cacheAnswers.other++;
    else if (entry.viaServiceWorker) cacheAnswers.serviceWorker++;
    else cacheAnswers.network++;
  }

  const milestones = [];
  if (clock) {
    for (const page of har.pages || []) {
      if (page.startedMs == null || (page.onLoad == null && page.onContentLoad == null)) continue;
      milestones.push({
        id: page.id,
        startedAt: page.startedMs - t0,
        domContentLoadedAt: page.onContentLoad == null ? null : page.startedMs + page.onContentLoad - t0,
        loadAt: page.onLoad == null ? null : page.startedMs + page.onLoad - t0
      });
    }
  }

  return {
    source: { entryCount: har.entryCount ?? entries.length, kept: entries.length, omitted: har.omitted ?? 0, creator: har.creator || null, pages: (har.pages || []).length, integrity: har.integrity || null },
    alignment: {
      method: clock ? "clock" : "order",
      matched: perRequest.size,
      harOnly: harOnly.length,
      netlogOnly: pageRequests.filter(request => !perRequest.has(request.id)).length,
      medianDeltaMs: clock ? median(deltas) : null,
      within50: deltas.filter(d => Math.abs(d) <= 50).length,
      within500: deltas.filter(d => Math.abs(d) <= 500).length,
      toleranceMs: TOLERANCE_MS
    },
    perRequest,
    harOnly: harOnly.slice(0, MAX_HAR_ONLY),
    harOnlyReasons: harOnly.reduce((sum, item) => (sum[item.reason] = (sum[item.reason] || 0) + 1, sum), {}),
    types: [...types.values()].sort((a, b) => b.transferBytes - a.transferBytes || b.count - a.count),
    initiators,
    requesters: [...requesters.values()].sort((a, b) => b.count - a.count || b.transferBytes - a.transferBytes).slice(0, 8),
    cacheAnswers,
    milestones
  };
}

/** A short plain-text section for the AI handoff. */
export function harEvidenceText(enrichment) {
  if (!enrichment) return "";
  const { alignment, types, initiators, requesters, cacheAnswers, milestones, harOnlyReasons, source } = enrichment;
  const lines = ["HAR ENRICHMENT (a DevTools HAR read alongside this NetLog; requests match by method and URL, nearest in time)"];
  lines.push(`Matched ${alignment.matched} of ${source.entryCount} HAR entries to NetLog requests${alignment.method === "clock" ? ` on the shared clock (median start difference ${alignment.medianDeltaMs == null ? "not recorded" : Math.round(alignment.medianDeltaMs) + " ms"}; within 50 ms: ${alignment.within50})` : " by order, because the capture recorded no wall clock"}.`);
  const reasons = Object.entries(harOnlyReasons);
  if (reasons.length) lines.push(`HAR entries with no NetLog request: ${reasons.map(([reason, n]) => `${n} ${reason}`).join(", ")}.`);
  if (types.length) lines.push(`Resource types (count, transferred): ${types.slice(0, 8).map(t => `${t.type} ${t.count} (${bytesText(t.transferBytes)})`).join("; ")}.`);
  lines.push(`Requested by: HTML parser ${initiators.parser}, script ${initiators.script}, other ${initiators.other}, not recorded ${initiators.none}.`);
  const scripts = requesters.filter(r => r.kind === "script").slice(0, 4);
  if (scripts.length) lines.push(`Scripts that started the most requests: ${scripts.map(r => `${(r.url || "inline script").split("?")[0]} (${r.count})`).join("; ")}.`);
  lines.push(`Answered without the network log: memory cache ${cacheAnswers.memory}, disk cache ${cacheAnswers.disk}, service worker ${cacheAnswers.serviceWorker}.`);
  const page = milestones[0];
  if (page) lines.push(`Load milestones from the HAR: DOMContentLoaded at ${secondsText(page.domContentLoadedAt == null ? null : page.domContentLoadedAt - page.startedAt)}, load at ${secondsText(page.loadAt == null ? null : page.loadAt - page.startedAt)} after navigation start. Paint, LCP and layout shift are not in a HAR.`);
  return lines.join("\n");
}

/** Attaches the enrichment to the capture model so every downstream view can read it. */
export function attachHar(model, har) {
  const enrichment = joinHar(model, har);
  if (enrichment) model.enrichment = enrichment;
  return enrichment;
}
