/**
 * Streaming, bounded diagnostic index for Chromium NetLog captures.
 *
 * It intentionally retains summaries and first/last sanitized parameters, never
 * the raw event stream. It has no Node APIs so the viewer can run it offline.
 */

import { createEvidenceSanitizer } from "../redact.mjs";

const MAX_BINS = 512;
const BYTE_EVENTS = {
  SOCKET_BYTES_SENT: "sentBytes",
  UDP_BYTES_SENT: "sentBytes",
  SOCKET_BYTES_RECEIVED: "receivedBytes",
  UDP_BYTES_RECEIVED: "receivedBytes",
  ENTRY_READ_DATA: "diskReadBytes",
  ENTRY_WRITE_DATA: "diskWriteBytes"
};

function invert(values) {
  const result = {};
  for (const [name, value] of Object.entries(values || {})) result[value] = name;
  return result;
}

function validTime(value) {
  if (value == null || value === "") return null;
  const time = Number(value);
  return Number.isFinite(time) ? time : null;
}

function nonzeroError(params) {
  for (const key of ["net_error", "protocol_error", "error_code"]) {
    const value = params?.[key];
    if (value != null && value !== 0 && value !== "0" && value !== "") return true;
  }
  return false;
}

function byteCount(name, params, sourceType, eventPhase, phaseEnd) {
  if (!(name in BYTE_EVENTS)) return null;
  if ((name === "ENTRY_READ_DATA" || name === "ENTRY_WRITE_DATA") &&
      (sourceType !== "DISK_CACHE_ENTRY" || eventPhase !== phaseEnd)) return null;
  const value = name === "ENTRY_READ_DATA" || name === "ENTRY_WRITE_DATA"
    ? params?.bytes_copied
    : params?.byte_count;
  if (value == null || value === "") return null;
  const bytes = Number(value);
  return Number.isFinite(bytes) ? bytes : null;
}

function visitDependencies(value, found, seen = new Set()) {
  if (!value || typeof value !== "object" || seen.has(value)) return;
  seen.add(value);
  if (Object.prototype.hasOwnProperty.call(value, "source_dependency")) {
    const dependency = value.source_dependency;
    if (dependency && typeof dependency === "object" && dependency.id != null) found.add(dependency.id);
  }
  if (Array.isArray(value)) {
    for (const item of value) visitDependencies(item, found, seen);
  } else {
    for (const nested of Object.values(value)) visitDependencies(nested, found, seen);
  }
}

function sourceLabel(type, id, params) {
  for (const key of ["url", "hostname", "host", "group_id", "address"]) {
    if (typeof params?.[key] === "string" && params[key]) return params[key];
  }
  return `${type} #${id}`;
}

function sortByName(rows) {
  return rows.sort((a, b) => String(a.name ?? a.type).localeCompare(String(b.name ?? b.type)));
}

function compareIds(a, b) {
  if (typeof a === "number" && typeof b === "number") return a - b;
  return String(a).localeCompare(String(b), undefined, { numeric: true });
}

/** Creates an incremental evidence collector compatible with netlog-stream. */
export function createNetLogEvidence() {
  const sanitize = createEvidenceSanitizer();
  let constants = null;
  let eventNames = {};
  let sourceNames = {};
  let phaseBegin = 1;
  let phaseEnd = 2;
  let eventsBeforeConstants = false;
  let events = 0;
  let firstTime = null;
  let lastTime = null;
  let binWidth = 1;
  let sentSupported = false;
  let receivedSupported = false;
  let diskReadSupported = false;
  let diskWriteSupported = false;
  let sentComplete = true;
  let receivedComplete = true;
  let diskReadComplete = true;
  let diskWriteComplete = true;
  const sources = new Map();
  const eventTypes = new Map();
  const bins = new Map();
  const active = {
    socketAlive: new Set(),
    socketInUse: new Set(),
    request: new Set(),
    dns: new Set()
  };
  const activeCounts = { openSockets: 0, inUseSockets: 0, activeRequests: 0, activeDns: 0 };
  const topLevel = {};
  let integrity = null;
  let snapshots = {};
  const warnings = [];

  function markSupport() {
    const known = new Set(Object.values(eventNames));
    sentSupported ||= known.has("SOCKET_BYTES_SENT") || known.has("UDP_BYTES_SENT");
    receivedSupported ||= known.has("SOCKET_BYTES_RECEIVED") || known.has("UDP_BYTES_RECEIVED");
    diskReadSupported ||= known.has("ENTRY_READ_DATA");
    diskWriteSupported ||= known.has("ENTRY_WRITE_DATA");
  }

  function markEventSupport(name) {
    sentSupported ||= name === "SOCKET_BYTES_SENT" || name === "UDP_BYTES_SENT";
    receivedSupported ||= name === "SOCKET_BYTES_RECEIVED" || name === "UDP_BYTES_RECEIVED";
    diskReadSupported ||= name === "ENTRY_READ_DATA";
    diskWriteSupported ||= name === "ENTRY_WRITE_DATA";
  }

  function rebucket() {
    const old = [...bins.values()];
    bins.clear();
    for (const bin of old) {
      const start = Math.floor(bin.start / binWidth) * binWidth;
      const existing = bins.get(start) || emptyBin(start);
      existing.events += bin.events;
      existing.errors += bin.errors;
      existing.sentBytes += bin.sentBytes;
      existing.receivedBytes += bin.receivedBytes;
      existing.diskReadBytes += bin.diskReadBytes;
      existing.diskWriteBytes += bin.diskWriteBytes;
      for (const key of ["openSockets", "inUseSockets", "activeRequests", "activeDns"]) {
        if (bin[key] != null && (existing._stateTimes[key] == null || bin._stateTimes[key] >= existing._stateTimes[key])) {
          existing[key] = bin[key];
          existing._stateTimes[key] = bin._stateTimes[key];
        }
      }
      bins.set(start, existing);
    }
  }

  function emptyBin(start) {
    return {
      start, end: start + binWidth, events: 0, errors: 0,
      sentBytes: 0, receivedBytes: 0, diskReadBytes: 0, diskWriteBytes: 0,
      openSockets: null, inUseSockets: null, activeRequests: null, activeDns: null,
      _stateTimes: {}
    };
  }

  function binAt(time) {
    while (bins.size >= MAX_BINS && !bins.has(Math.floor(time / binWidth) * binWidth)) {
      binWidth *= 2;
      rebucket();
    }
    const start = Math.floor(time / binWidth) * binWidth;
    let bin = bins.get(start);
    if (!bin) {
      bin = emptyBin(start);
      bins.set(start, bin);
    }
    return bin;
  }

  function sourceFor(id, type, params, time) {
    const key = String(id);
    let source = sources.get(key);
    if (!source) {
      source = { id, type, label: sourceLabel(type, id, params), firstTime: time, lastTime: time, eventCount: 0, errorCount: 0, dependencies: new Set(), eventTypes: new Map() };
      sources.set(key, source);
    }
    source.type = source.type || type;
    if (time != null) {
      source.firstTime = source.firstTime == null ? time : Math.min(source.firstTime, time);
      source.lastTime = source.lastTime == null ? time : Math.max(source.lastTime, time);
    }
    return source;
  }

  function updateActive(set, countKey, id, phase, bin, time) {
    if (phase === phaseBegin && !set.has(id)) {
      set.add(id);
      activeCounts[countKey]++;
    } else if (phase === phaseEnd && set.delete(id)) {
      activeCounts[countKey]--;
    } else {
      return;
    }
    bin[countKey] = activeCounts[countKey];
    bin._stateTimes[countKey] = time;
  }

  function addEvent(event) {
    if (!constants) {
      // Captures normally put constants first, but malformed/older streams may
      // not. Keep aggregating numeric names instead of retaining raw events.
      eventsBeforeConstants = true;
    }
    events++;
    const name = eventNames[event.type] ?? String(event.type);
    markEventSupport(name);
    const sourceType = sourceNames[event.source?.type] ?? String(event.source?.type ?? "UNKNOWN");
    const id = event.source?.id ?? null;
    const time = validTime(event.time);
    const rawParams = event.params && typeof event.params === "object" ? event.params : {};
    const params = sanitize(rawParams);
    if (time != null) {
      firstTime = firstTime == null ? time : Math.min(firstTime, time);
      lastTime = lastTime == null ? time : Math.max(lastTime, time);
    }
    const source = sourceFor(id, sourceType, params, time);
    source.eventCount++;
    const error = nonzeroError(rawParams);
    if (error) source.errorCount++;
    const dependencies = new Set();
    visitDependencies(rawParams, dependencies);
    for (const dependency of dependencies) source.dependencies.add(dependency);

    let type = source.eventTypes.get(name);
    if (!type) {
      type = { name, count: 0, firstTime: time, lastTime: time, beginCount: 0, endCount: 0, firstParams: params, lastParams: params };
      source.eventTypes.set(name, type);
    }
    type.count++;
    if (time != null) {
      type.firstTime = type.firstTime == null ? time : Math.min(type.firstTime, time);
      type.lastTime = type.lastTime == null ? time : Math.max(type.lastTime, time);
    }
    if (event.phase === phaseBegin) type.beginCount++;
    if (event.phase === phaseEnd) type.endCount++;
    type.lastParams = params;
    eventTypes.set(name, (eventTypes.get(name) || 0) + 1);

    if (time == null) return;
    const bin = binAt(time);
    bin.events++;
    if (error) bin.errors++;
    const bytes = byteCount(name, rawParams, sourceType, event.phase, phaseEnd);
    if (name === "SOCKET_BYTES_SENT" || name === "UDP_BYTES_SENT") sentComplete &&= bytes != null;
    if (name === "SOCKET_BYTES_RECEIVED" || name === "UDP_BYTES_RECEIVED") receivedComplete &&= bytes != null;
    if (name === "ENTRY_READ_DATA" && sourceType === "DISK_CACHE_ENTRY" && event.phase === phaseEnd) diskReadComplete &&= bytes != null;
    if (name === "ENTRY_WRITE_DATA" && sourceType === "DISK_CACHE_ENTRY" && event.phase === phaseEnd) diskWriteComplete &&= bytes != null;
    if (bytes != null) bin[BYTE_EVENTS[name]] += bytes;
    if (sourceType === "SOCKET" && name === "SOCKET_ALIVE") updateActive(active.socketAlive, "openSockets", id, event.phase, bin, time);
    if (sourceType === "SOCKET" && name === "SOCKET_IN_USE") updateActive(active.socketInUse, "inUseSockets", id, event.phase, bin, time);
    if (sourceType === "SOCKET" && name === "SSL_CONNECT" && event.phase === phaseEnd) updateActive(active.socketInUse, "inUseSockets", id, phaseEnd, bin, time);
    if (sourceType === "URL_REQUEST" && name === "REQUEST_ALIVE") updateActive(active.request, "activeRequests", id, event.phase, bin, time);
    if (sourceType === "HOST_RESOLVER_IMPL_JOB" && name === "HOST_RESOLVER_IMPL_JOB") updateActive(active.dns, "activeDns", id, event.phase, bin, time);
  }

  function setTopLevel(key, value) {
    if (key === "constants") {
      constants = sanitize(value || {});
      eventNames = invert(value?.logEventTypes);
      sourceNames = invert(value?.logSourceType);
      phaseBegin = value?.logEventPhase?.PHASE_BEGIN ?? 1;
      phaseEnd = value?.logEventPhase?.PHASE_END ?? 2;
      markSupport();
      return;
    }
    if (key === "polledData") {
      snapshots = sanitize(value || {});
      return;
    }
    if (key === "captureIntegrity") {
      integrity = sanitize(value);
      return;
    }
    topLevel[key] = sanitize(value);
  }

  function finish() {
    if (integrity && integrity.complete === false) warnings.push("The capture ended before its JSON document was complete; diagnostics include only fully recorded entries.");
    if (integrity?.malformedEntries) warnings.push(`${integrity.malformedEntries} malformed capture entries were discarded.`);
    if (eventsBeforeConstants) warnings.push("Some events arrived before constants; their event and source names remain numeric, and decoded timeline series may require a second pass.");
    if (!constants) {
      constants = {};
    }
    const timeline = [...bins.values()].sort((a, b) => a.start - b.start).map(({ _stateTimes, ...bin }) => ({
      ...bin,
      sentBytes: sentSupported && sentComplete ? bin.sentBytes : null,
      receivedBytes: receivedSupported && receivedComplete ? bin.receivedBytes : null,
      diskReadBytes: diskReadSupported && diskReadComplete ? bin.diskReadBytes : null,
      diskWriteBytes: diskWriteSupported && diskWriteComplete ? bin.diskWriteBytes : null
    }));
    const resultSources = [...sources.values()].map(source => ({
      id: source.id, type: source.type, label: source.label,
      firstTime: source.firstTime, lastTime: source.lastTime,
      eventCount: source.eventCount, errorCount: source.errorCount,
      dependencies: [...source.dependencies].sort(compareIds),
      eventTypes: sortByName([...source.eventTypes.values()].map(type => ({ ...type })))
    })).sort((a, b) => compareIds(a.id, b.id));
    return {
      events, firstTime, lastTime, constantsLate: eventsBeforeConstants, sources: resultSources,
      eventTypes: sortByName([...eventTypes].map(([name, count]) => ({ name, count }))),
      timeline, snapshots, constants, topLevel, integrity, warnings
    };
  }

  return { setTopLevel, addEvent, finish };
}
