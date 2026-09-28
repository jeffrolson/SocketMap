/** Capture-wide, non-causal guidance derived from retained NetLog evidence. */

const SNAPSHOTS = [
  "proxySettings", "badProxies", "hostResolverInfo", "socketPoolInfo",
  "httpStreamPoolInfo", "altSvcMappings", "spdySessionInfo", "spdyStatus",
  "quicInfo", "reportingInfo", "httpCacheInfo", "serviceProviders",
  "extensionInfo", "prerenderInfo", "activeFieldTrialGroups", "dohProvidersDisabledDueToFeature"
];
const MAX_CARDS = 12;
const MAX_ERRORS = 4;
const MAX_SOURCES = 3;

function number(value) {
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}

function finiteNumber(value) {
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function entrySuffix(count) {
  return count === 1 ? "y" : "ies";
}

/**
 * Classifies DNS cache entries using the same two expiry predicates as the
 * Chromium NetLog Viewer. Values missing from a capture remain unknown.
 */
export function summarizeDnsCache(diagnostics) {
  const constants = diagnostics?.constants || {};
  const cache = diagnostics?.snapshots?.hostResolverInfo?.cache;
  const entries = Array.isArray(cache?.entries) ? cache.entries : [];
  const captureTime = finiteNumber(constants.clientInfo?.numericDate);
  const tickOffset = finiteNumber(constants.timeTickOffset);
  const cacheNetworkChanges = finiteNumber(cache?.network_changes);
  const counts = { expired: 0, current: 0, unclassified: 0, expiredByTime: 0, expiredByNetworkChange: 0 };
  const rows = entries.map((entry, index) => {
    const expiration = finiteNumber(entry?.expiration);
    const entryNetworkChanges = finiteNumber(entry?.network_changes);
    const expirationTime = expiration != null && tickOffset != null ? expiration + tickOffset : null;
    const expiredByTime = captureTime != null && expirationTime != null && captureTime > expirationTime;
    const expiredByNetworkChange = entryNetworkChanges != null && cacheNetworkChanges != null && entryNetworkChanges < cacheNetworkChanges;
    const comparable = (captureTime != null && expirationTime != null) || (entryNetworkChanges != null && cacheNetworkChanges != null);
    const label = expiredByTime || expiredByNetworkChange ? "expired" : comparable ? "current" : "unknown";
    counts[label === "unknown" ? "unclassified" : label]++;
    if (expiredByTime) counts.expiredByTime++;
    if (expiredByNetworkChange) counts.expiredByNetworkChange++;
    const date = expirationTime == null ? null : new Date(expirationTime);
    return {
      index,
      label,
      expirationDate: date && Number.isFinite(date.getTime()) ? date.toISOString() : null,
      expiredByTime,
      expiredByNetworkChange
    };
  });
  return { entries: rows, counts };
}

function ids(sources) {
  return sources.map(source => source.id).filter(id => id != null).slice(0, MAX_SOURCES);
}

function errorCodes(value, output) {
  if (!value || typeof value !== "object") return;
  for (const key of ["net_error", "protocol_error", "error_code"]) {
    const code = value[key];
    if ((typeof code === "number" || typeof code === "string") && code !== 0 && code !== "0" && code !== "") output.add(String(code));
  }
}

function knownErrors(diagnostics, sources) {
  const names = {};
  for (const [name, value] of Object.entries(diagnostics?.constants?.netError || {})) names[String(value)] = name;
  const codes = new Set();
  for (const source of sources) {
    for (const type of source.eventTypes || []) {
      errorCodes(type.firstParams, codes);
      errorCodes(type.lastParams, codes);
    }
  }
  return [...codes].sort((a, b) => Number(a) - Number(b)).slice(0, MAX_ERRORS)
    .map(code => names[code] || `unmapped error code ${code}`);
}

function expectedErrorObservations(diagnostics, sources) {
  const names = {};
  for (const [name, value] of Object.entries(diagnostics?.constants?.netError || {})) names[String(value)] = name;
  const expected = new Set();
  for (const source of sources) {
    for (const type of source.eventTypes || []) {
      const codes = new Set();
      errorCodes(type.firstParams, codes);
      errorCodes(type.lastParams, codes);
      for (const code of codes) {
        const name = names[code];
        if (name === "ERR_CACHE_MISS" || name === "ERR_ABORTED") expected.add(name);
      }
    }
  }
  return [...expected].sort();
}

function card(cards, id, title, observation, nextCheck, sourceIds, category) {
  if (cards.length < MAX_CARDS) cards.push({ id, title, observation, nextCheck, sourceIds, category });
}

/**
 * Produces recorded observations and next checks. It intentionally makes no
 * causal claim from a single capture.
 */
export function buildDiagnosticInsights(model) {
  const diagnostics = model?.diagnostics || {};
  const sources = Array.isArray(diagnostics.sources) ? diagnostics.sources : [];
  const snapshots = diagnostics.snapshots && typeof diagnostics.snapshots === "object" ? diagnostics.snapshots : {};
  const cards = [];
  const integrity = diagnostics.integrity;
  const failingSources = sources.filter(source => number(source.errorCount) > 0)
    .sort((a, b) => b.errorCount - a.errorCount || String(a.id).localeCompare(String(b.id), undefined, { numeric: true }));

  if (integrity?.complete === false || number(integrity?.discardedPartial) > 0 || number(integrity?.malformedEntries) > 0) {
    card(cards, "capture-integrity", "Capture is incomplete or discarded entries", `Recorded integrity: complete=${integrity.complete ?? "not recorded"}; discarded partial=${integrity.discardedPartial ?? 0}; malformed entries=${integrity.malformedEntries ?? 0}.`, "Repeat the capture through the end of the symptom before comparing timings.", [], "capture");
  }
  if (diagnostics.constantsLate) {
    card(cards, "constants-late", "Event names were not available at capture start", "Some events were aggregated before NetLog constants were recorded, so their numeric names need a constants-seeded reread for labels.", "Re-read this same local capture with constants seeded before event processing.", [], "capture");
  }
  if (failingSources.length) {
    const total = failingSources.reduce((sum, source) => sum + source.errorCount, 0);
    const errors = knownErrors(diagnostics, failingSources);
    const expected = expectedErrorObservations(diagnostics, failingSources);
    const qualifier = expected.length ? ` Sampled normal observations include ${expected.join(", ")}; they are not root-failure proof.` : " Error codes can include normal cache misses or cancellations, so they are not root-failure proof.";
    card(cards, "recorded-errors", "Recorded error-bearing events", `${total} error-bearing event(s) appear across ${failingSources.length} source(s)${errors.length ? `; sampled enum values: ${errors.join(", ")}` : "; no enum value was retained in the first/last samples"}.${qualifier}`, "Open the listed source IDs and inspect their recorded event samples or attach the original NetLog for replay.", ids(failingSources), "errors");
  }

  const busiest = [...sources].filter(source => number(source.eventCount) != null)
    .sort((a, b) => b.eventCount - a.eventCount || String(a.id).localeCompare(String(b.id), undefined, { numeric: true })).slice(0, MAX_SOURCES);
  if (busiest.length) {
    card(cards, "most-active-sources", "Most active recorded sources", busiest.map(source => `${source.type || "source"} ${source.id}: ${source.eventCount} events`).join("; ") + ".", "Inspect these source IDs before deciding whether their activity is relevant to the selected page.", ids(busiest), "activity");
  }

  const recorded = SNAPSHOTS.filter(key => Object.prototype.hasOwnProperty.call(snapshots, key));
  const missing = SNAPSHOTS.filter(key => !Object.prototype.hasOwnProperty.call(snapshots, key));
  card(cards, "snapshot-coverage", "Browser snapshot coverage", `Recorded categories: ${recorded.length ? recorded.join(", ") : "none"}. Not recorded: ${missing.length ? missing.join(", ") : "none"}.`, "Treat an absent category as missing capture evidence; do not use it to infer browser configuration.", [], "coverage");

  const resolver = snapshots.hostResolverInfo;
  if (resolver && typeof resolver === "object") {
    const config = resolver.dns_config;
    const cache = resolver.cache;
    const facts = [];
    if (Array.isArray(config?.nameservers)) facts.push(`${config.nameservers.length} recorded resolver address(es)`);
    if (number(cache?.capacity) != null) facts.push(`cache capacity ${cache.capacity}`);
    if (Array.isArray(cache?.entries)) facts.push(`${cache.entries.length} cache entr${cache.entries.length === 1 ? "y" : "ies"}`);
    if (facts.length) card(cards, "dns-snapshot", "Recorded DNS resolver state", facts.join("; ") + ".", "Compare resolver settings and cache entries across a repeat capture if DNS behavior is suspected.", [], "dns");
    const cacheSummary = summarizeDnsCache(diagnostics);
    if (Array.isArray(cache?.entries)) {
      const { expired, current, unclassified, expiredByTime, expiredByNetworkChange } = cacheSummary.counts;
      const causes = [];
      if (expiredByTime) causes.push(`${expiredByTime} by recorded expiry time`);
      if (expiredByNetworkChange) causes.push(`${expiredByNetworkChange} by recorded network-change count`);
      card(cards, "dns-cache-expiry", "Recorded DNS cache expiry state", `${expired} known expired, ${current} known current, and ${unclassified} unclassified cache entr${entrySuffix(cache.entries.length)}${causes.length ? `; expiry causes: ${causes.join(", ")}` : ""}.`, "Inspect the entry timestamps and network-change counts, then repeat the capture if DNS cache behavior is relevant.", [], "dns");
    }
  }

  const proxy = snapshots.proxySettings;
  const badProxies = snapshots.badProxies;
  if (proxy && typeof proxy === "object" || Array.isArray(badProxies)) {
    const facts = [];
    if (proxy && typeof proxy === "object" && Object.prototype.hasOwnProperty.call(proxy, "effective")) facts.push("effective proxy settings recorded");
    if (Array.isArray(badProxies)) facts.push(`${badProxies.length} recorded bad-proxy entr${badProxies.length === 1 ? "y" : "ies"}`);
    if (facts.length) card(cards, "proxy-snapshot", "Recorded proxy state", facts.join("; ") + ".", "Inspect the recorded proxy settings and bad-proxy entries; they describe browser state, not the cause of a failure.", [], "proxy");
  }

  const pool = snapshots.httpStreamPoolInfo || snapshots.socketPoolInfo;
  if (pool && typeof pool === "object") {
    const facts = [];
    for (const key of ["connecting_socket_count", "handed_out_socket_count", "idle_socket_count", "max_socket_count", "max_sockets_per_group"]) {
      if (number(pool[key]) != null) facts.push(`${key}=${pool[key]}`);
    }
    if (facts.length) card(cards, "pool-snapshot", "Recorded connection-pool counters", facts.join(", ") + ".", "Inspect per-group and attempt evidence before concluding that a pool limit delayed a request.", [], "sockets");
  }

  card(cards, "cpu-gap", "CPU and rendering are not established by this NetLog", "This capture records browser network activity; it does not measure JavaScript execution, main-thread contention, layout, or rendering completion.", "Pair a repeat with a browser performance trace if CPU or rendering time is a candidate.", [], "gap");
  card(cards, "wire-gap", "Wire retransmissions are not established by this NetLog", "Socket timing and byte events do not identify packet loss or retransmission on the wire.", "Collect packet or transport telemetry for the same time window if transport loss is a candidate.", [], "gap");
  card(cards, "server-gap", "Server work is not established by this NetLog", "A response wait interval records browser-observed timing but not application, database, or upstream server work.", "Correlate a repeat capture with server-side request tracing using a shared timestamp or request identifier.", [], "gap");
  return cards;
}

/** A bounded, copyable evidence section for the AI handoff. */
export function buildDiagnosticEvidenceText(model) {
  const diagnostics = model?.diagnostics || {};
  const cards = buildDiagnosticInsights(model);
  const lines = ["CAPTURE-WIDE DIAGNOSTIC EVIDENCE", `Events: ${diagnostics.events ?? "not recorded"}; sources: ${Array.isArray(diagnostics.sources) ? diagnostics.sources.length : "not recorded"}.`];
  for (const insight of cards.slice(0, MAX_CARDS)) {
    lines.push(`- ${insight.title}: ${insight.observation} Next check: ${insight.nextCheck}${insight.sourceIds.length ? ` Source IDs: ${insight.sourceIds.join(", ")}.` : ""}`);
  }
  return lines.join("\n");
}
