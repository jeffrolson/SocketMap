/**
 * Pure NetLog comparison model. It compares recorded network evidence only;
 * rendering and browser APIs deliberately live elsewhere.
 */

import { analyzeCapture } from "./analysis.mjs";
import { createEvidenceSanitizer, redactCapturedText } from "./redact.mjs";

const METRICS = [
  ["observed-span", "Observed request span", "ms"],
  ["median-duration", "Median completed request duration", "ms"],
  ["median-server-wait", "Median server wait", "ms"],
  ["request-count", "Request count", "count"],
  ["failed-count", "Known failed requests", "count"],
  ["wire-bytes", "Known wire bytes", "bytes"]
];
const DIAGNOSTIC_SNAPSHOT_KEYS = [
  "proxySettings", "badProxies", "hostResolverInfo", "dohProvidersDisabledDueToFeature",
  "socketPoolInfo", "httpStreamPoolInfo", "altSvcMappings", "spdySessionInfo", "spdyStatus",
  "quicInfo", "reportingInfo", "httpCacheInfo", "serviceProviders", "extensionInfo",
  "prerenderInfo", "activeFieldTrialGroups"
];

function median(values) {
  const sorted = values.filter(value => value != null).sort((a, b) => a - b);
  if (!sorted.length) return null;
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
}

function canonicalUrl(url) {
  if (typeof url !== "string" || !url) return null;
  return url.split("#", 1)[0] || null;
}

function pairable(request) {
  const url = canonicalUrl(request.url);
  return typeof request.method === "string" && request.method.length > 0 && url ? { method: request.method, url } : null;
}

function completionCoverage(requests) {
  if (!requests.length) return 0;
  return requests.filter(request => request.endRecorded === true).length / requests.length;
}

function outcomeKnown(request) {
  return request.status != null || Boolean(request.netError);
}

function failed(request) {
  return Boolean(request.netError) || (request.status != null && request.status >= 400);
}

function metricValues(requests) {
  const completed = requests.filter(request => request.endRecorded === true);
  const durationCoverage = completionCoverage(requests);
  const waitValues = requests.filter(request => request.timing?.wait != null).map(request => request.timing.wait);
  const wire = requests.filter(request => request.bytesWire != null);
  const knownOutcomes = requests.filter(outcomeKnown);
  let earliestStart = null;
  let latestEnd = null;
  for (const request of requests) {
    if (earliestStart == null || request.start < earliestStart) earliestStart = request.start;
    if (latestEnd == null || request.end > latestEnd) latestEnd = request.end;
  }
  const span = durationCoverage === 1 && earliestStart != null && latestEnd != null ? latestEnd - earliestStart : null;
  return {
    "observed-span": { value: span, coverage: durationCoverage },
    "median-duration": { value: median(completed.map(request => request.durationMs)), coverage: durationCoverage },
    "median-server-wait": { value: median(waitValues), coverage: requests.length ? waitValues.length / requests.length : 0 },
    "request-count": { value: requests.length, coverage: 1 },
    "failed-count": { value: knownOutcomes.length ? knownOutcomes.filter(failed).length : null, coverage: requests.length ? knownOutcomes.length / requests.length : 0 },
    "wire-bytes": { value: wire.length ? wire.reduce((sum, request) => sum + request.bytesWire, 0) : null, coverage: requests.length ? wire.length / requests.length : 0 }
  };
}

function makeMetrics(requestsA, requestsB) {
  const valuesA = metricValues(requestsA);
  const valuesB = metricValues(requestsB);
  return METRICS.map(([key, label, unit]) => {
    const a = valuesA[key];
    const b = valuesB[key];
    const delta = a.value != null && b.value != null ? b.value - a.value : null;
    return {
      key,
      label,
      unit,
      a: a.value,
      b: b.value,
      delta,
      percent: delta != null && a.value !== 0 ? (delta / a.value) * 100 : null,
      coverageA: a.coverage,
      coverageB: b.coverage
    };
  });
}

function pairRequests(requestsA, requestsB) {
  const grouped = new Map();
  const unpairableA = [];
  const unpairableB = [];
  const add = (side, request) => {
    const identity = pairable(request);
    if (!identity) {
      (side === "a" ? unpairableA : unpairableB).push(request);
      return;
    }
    const key = `${identity.method}\n${identity.url}`;
    const group = grouped.get(key) || { ...identity, a: [], b: [] };
    group[side].push(request);
    grouped.set(key, group);
  };
  requestsA.forEach(request => add("a", request));
  requestsB.forEach(request => add("b", request));

  const pairs = [];
  let redactedDuplicate = false;
  for (const group of grouped.values()) {
    group.a.sort((left, right) => left.start - right.start || left.id - right.id);
    group.b.sort((left, right) => left.start - right.start || left.id - right.id);
    if ((group.a.length > 1 || group.b.length > 1) && group.url.includes("[REDACTED]")) redactedDuplicate = true;
    const length = Math.max(group.a.length, group.b.length);
    for (let index = 0; index < length; index++) {
      const a = group.a[index] || null;
      const b = group.b[index] || null;
      const durationDeltaMs = a?.endRecorded === true && b?.endRecorded === true ? b.durationMs - a.durationMs : null;
      const waitDeltaMs = a?.timing?.wait != null && b?.timing?.wait != null ? b.timing.wait - a.timing.wait : null;
      const timingChanged = a && b && Object.keys({ ...(a.timing || {}), ...(b.timing || {}) })
        .some(key => (a.timing || {})[key] !== (b.timing || {})[key]);
      const recordedChanged = a && b && (
        a.status !== b.status || a.netError !== b.netError || a.protocol !== b.protocol ||
        a.reusedConnection !== b.reusedConnection || a.bytesWire !== b.bytesWire ||
        a.bytesDecoded !== b.bytesDecoded || a.proxy !== b.proxy || a.endRecorded !== b.endRecorded
      );
      pairs.push({
        key: `${group.method} ${group.url}#${index + 1}`,
        method: group.method,
        url: group.url,
        occurrence: index + 1,
        a,
        b,
        change: a && b ? "matched" : a ? "only-a" : "only-b",
        durationDeltaMs,
        waitDeltaMs,
        changed: Boolean(a && b && ((durationDeltaMs != null && durationDeltaMs !== 0) || (waitDeltaMs != null && waitDeltaMs !== 0) || timingChanged || recordedChanged))
      });
    }
  }
  for (const [side, requests] of [["a", unpairableA], ["b", unpairableB]]) {
    for (const request of requests) {
      pairs.push({
        key: `unpaired-${side}-${request.id}`,
        method: request.method ?? null,
        url: canonicalUrl(request.url),
        occurrence: 1,
        a: side === "a" ? request : null,
        b: side === "b" ? request : null,
        change: side === "a" ? "only-a" : "only-b",
        durationDeltaMs: null,
        waitDeltaMs: null,
        changed: false
      });
    }
  }
  pairs.sort((left, right) => left.key.localeCompare(right.key));
  return { pairs, redactedDuplicate, unpairableA: unpairableA.length, unpairableB: unpairableB.length };
}

function safeValue(value) {
  if (value == null) return null;
  if (Array.isArray(value)) return value.map(safeValue).filter(value => value != null).join(", ") || null;
  if (typeof value === "object") return null;
  return typeof value === "string" ? redactCapturedText(value) : String(value);
}

function safeEnvironment(value) {
  return createEvidenceSanitizer()(value);
}

function environmentRows(a, b) {
  const rows = [
    ["Browser", a.browser, b.browser],
    ["Browser channel", a.browserInfo?.channel, b.browserInfo?.channel],
    ["Browser build", a.browserInfo?.build, b.browserInfo?.build],
    ["Browser official build", a.browserInfo?.official, b.browserInfo?.official],
    ["Operating system", a.os, b.os],
    ["Capture mode", a.captureMode, b.captureMode],
    ["Capture started", a.captureStartedAt, b.captureStartedAt],
    ["Local addresses", a.localAddresses, b.localAddresses],
    ["DNS server addresses", a.dns?.serverAddresses, b.dns?.serverAddresses],
    ["DNS search domains", a.dns?.search, b.dns?.search],
    ["Secure DNS", a.dns?.secureDns, b.dns?.secureDns],
    ["DoH servers", a.dns?.dohServers, b.dns?.dohServers],
    ["DNS timeout seconds", a.dns?.timeoutSeconds, b.dns?.timeoutSeconds],
    ["DNS attempts", a.dns?.attempts, b.dns?.attempts],
    ["DNS rotate", a.dns?.rotate, b.dns?.rotate],
    ["Proxy mode", a.proxy?.mode, b.proxy?.mode],
    ["PAC script", a.proxy?.pacUrl, b.proxy?.pacUrl],
    ["Fixed proxy servers", a.proxy?.fixedServers, b.proxy?.fixedServers]
  ];
  return rows.map(([label, before, after]) => {
    const safeA = safeValue(before);
    const safeB = safeValue(after);
    return { label, a: safeA, b: safeB, changed: safeA !== safeB };
  });
}

function sameValue(a, b) {
  const normalize = value => {
    if (Array.isArray(value)) return value.map(normalize);
    if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map(key => [key, normalize(value[key])]));
    return value;
  };
  return JSON.stringify(normalize(a)) === JSON.stringify(normalize(b));
}

function diagnosticFamilies(diagnostics) {
  if (!Array.isArray(diagnostics?.sources)) return null;
  const families = new Map();
  for (const source of diagnostics.sources) {
    const type = typeof source?.type === "string" && source.type ? source.type : "Unknown source type";
    const family = families.get(type) || { sources: 0, events: 0, errors: 0 };
    family.sources++;
    if (Number.isFinite(source.eventCount)) family.events += source.eventCount;
    if (Number.isFinite(source.errorCount)) family.errors += source.errorCount;
    families.set(type, family);
  }
  return families;
}

function compareDiagnostics(a, b) {
  if (!a || !b) return null;
  const sanitize = createEvidenceSanitizer();
  const snapshotsA = a.snapshots && typeof a.snapshots === "object" ? a.snapshots : {};
  const snapshotsB = b.snapshots && typeof b.snapshots === "object" ? b.snapshots : {};
  const snapshots = DIAGNOSTIC_SNAPSHOT_KEYS.map(key => {
    const presentA = Object.prototype.hasOwnProperty.call(snapshotsA, key);
    const presentB = Object.prototype.hasOwnProperty.call(snapshotsB, key);
    const valueA = presentA ? sanitize(snapshotsA[key]) : null;
    const valueB = presentB ? sanitize(snapshotsB[key]) : null;
    return { key, a: valueA, b: valueB, presentA, presentB, changed: presentA !== presentB || !sameValue(valueA, valueB) };
  });
  const familiesA = diagnosticFamilies(a);
  const familiesB = diagnosticFamilies(b);
  const names = new Set([...(familiesA?.keys() || []), ...(familiesB?.keys() || [])]);
  const families = [...names].sort().map(type => {
    const before = familiesA?.get(type) || null;
    const after = familiesB?.get(type) || null;
    const row = {
      type,
      aSources: before?.sources ?? null, bSources: after?.sources ?? null,
      aEvents: before?.events ?? null, bEvents: after?.events ?? null,
      aErrors: before?.errors ?? null, bErrors: after?.errors ?? null
    };
    return { ...row, changed: row.aSources !== row.bSources || row.aEvents !== row.bEvents || row.aErrors !== row.bErrors };
  });
  const totals = diagnostics => Array.isArray(diagnostics?.sources) ? {
    sources: diagnostics.sources.length,
    events: Number.isFinite(diagnostics.events) ? diagnostics.events : null,
    errors: diagnostics.sources.reduce((sum, source) => sum + (Number.isFinite(source.errorCount) ? source.errorCount : 0), 0)
  } : { sources: null, events: null, errors: null };
  return { snapshots, families, totalsA: totals(a), totalsB: totals(b) };
}

function select(model, site, source) {
  const analysis = analyzeCapture(model, { site: site || undefined });
  return {
    source: { name: typeof source?.name === "string" ? redactCapturedText(source.name) : null, bytes: Number.isFinite(source?.bytes) ? source.bytes : null },
    page: analysis.page,
    requests: analysis.pageRequests,
    environment: safeEnvironment(model.environment),
    analysis
  };
}

/** Compares two NetLog capture models without mutating either input. */
export function compareCaptures(modelA, modelB, { siteA, siteB, sourceA, sourceB } = {}) {
  const selectedA = select(modelA, siteA, sourceA);
  const selectedB = select(modelB, siteB, sourceB);
  const paired = pairRequests(selectedA.requests, selectedB.requests);
  const counts = {
    matched: paired.pairs.filter(pair => pair.change === "matched").length,
    onlyA: paired.pairs.filter(pair => pair.change === "only-a").length,
    onlyB: paired.pairs.filter(pair => pair.change === "only-b").length,
    changed: paired.pairs.filter(pair => pair.change === "matched" && pair.changed).length
  };
  const warnings = [];
  if (selectedA.page.site !== selectedB.page.site || selectedA.page.url !== selectedB.page.url) warnings.push("The selected sites or page URLs differ, so this is not a like-for-like page comparison.");
  if (completionCoverage(selectedA.requests) < 1 || completionCoverage(selectedB.requests) < 1) warnings.push("At least one request lacks a recorded end event. Completion span and incomplete request durations are suppressed.");
  if (paired.redactedDuplicate || paired.unpairableA || paired.unpairableB) warnings.push("Some requests could not be paired exactly because a method or URL was missing, or repeated redacted URLs are ambiguous.");
  warnings.push("A two-capture comparison shows differences, not cause. Confirm a hypothesis with a controlled next test.");
  return {
    a: { source: selectedA.source, page: selectedA.page, requests: selectedA.requests, environment: selectedA.environment },
    b: { source: selectedB.source, page: selectedB.page, requests: selectedB.requests, environment: selectedB.environment },
    metrics: makeMetrics(selectedA.requests, selectedB.requests),
    pairs: paired.pairs,
    counts,
    environment: environmentRows(selectedA.environment, selectedB.environment),
    diagnostics: compareDiagnostics(modelA?.diagnostics, modelB?.diagnostics),
    warnings
  };
}
