/**
 * Streaming HAR reader for enriching a NetLog report.
 *
 * A HAR from DevTools can hold every response body, so it is never parsed whole: each
 * entry is parsed on its own, reduced to a small whitelist of fields, and dropped. Bodies,
 * headers, cookies, post data and page titles are never kept. URLs are redacted.
 *
 * Understands Chrome's DevTools export (creator "WebInspector"): _initiator, _resourceType,
 * _priority, _fromCache, _transferSize, _fetchedViaServiceWorker and timings._workerStart.
 * Anything not present is null, never a default.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl, redactHeaderLines } from "../redact.mjs";

const MAX_FIELD = 200;

const text = (value, max = MAX_FIELD) => (typeof value === "string" && value ? value.slice(0, max) : null);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const size = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
const duration = (value) => (typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null);
const safeUrl = (value, max = 600) => (typeof value === "string" && value ? redactUrl(value.split("#")[0]).slice(0, max) : null);

function readInitiator(raw) {
  if (!raw || typeof raw !== "object") return null;
  const type = text(raw.type, 32);
  if (!type) return null;
  if (type === "parser") {
    const line = num(raw.lineNumber);
    return { type, url: safeUrl(raw.url), line: line == null ? null : line + 1 };
  }
  if (type === "script") {
    const frames = Array.isArray(raw.stack?.callFrames) ? raw.stack.callFrames : [];
    const top = frames.find(frame => frame && frame.url) || frames[0];
    if (!top) return { type };
    const line = num(top.lineNumber);
    const result = { type, fn: text(top.functionName, 60), url: safeUrl(top.url), line: line == null ? null : line + 1, frames: frames.length };
    if (raw.stack?.parent) result.async = true;
    return result;
  }
  return { type };
}

const MAX_HEADERS = 80;
const MAX_HEADER_LINE = 500;

/** Response headers as "name: value" lines with credentials masked. Only kept when the HAR is the main input. */
function readResponseHeaders(response) {
  const list = Array.isArray(response?.headers) ? response.headers : [];
  const lines = [];
  for (const header of list.slice(0, MAX_HEADERS)) {
    if (!header || typeof header.name !== "string" || typeof header.value !== "string") continue;
    lines.push(`${header.name}: ${header.value}`.slice(0, MAX_HEADER_LINE));
  }
  return redactHeaderLines(lines);
}

/**
 * Reduces one raw HAR entry to the small set of fields SocketMap uses, or null.
 * keepHeaders: also keep the response header lines (credentials masked); off when the HAR only enriches a NetLog.
 */
export function summarizeHarEntry(raw, { keepHeaders = false } = {}) {
  if (!raw || typeof raw !== "object") return null;
  const request = raw.request || {};
  const response = raw.response || {};
  const timings = raw.timings || {};
  const started = typeof raw.startedDateTime === "string" ? Date.parse(raw.startedDateTime) : NaN;
  const worker = num(timings._workerStart);
  const version = text(response.httpVersion, 16);
  const cache = text(raw._fromCache, 16);
  const summary = {
    pageref: text(raw.pageref, 40),
    method: text(request.method, 16),
    url: safeUrl(request.url, 8000),
    startedMs: Number.isFinite(started) ? started : null,
    timeMs: duration(raw.time),
    status: num(response.status),
    httpVersion: version ? version.toLowerCase() : null,
    resourceType: text(raw._resourceType, 32),
    priority: text(raw._priority, 16),
    mimeType: text(response.content?.mimeType, 100),
    contentSize: size(response.content?.size),
    transferSize: size(response._transferSize),
    cache,
    viaServiceWorker: response._fetchedViaServiceWorker === true || (worker != null && worker >= 0),
    serviceWorkerSource: text(response._serviceWorkerResponseSource, 40),
    serverIp: text(raw.serverIPAddress, 64),
    connectionId: text(String(raw._connectionId ?? ""), 32),
    redirectUrl: safeUrl(response.redirectURL),
    initiator: readInitiator(raw._initiator),
    timings: {
      blocked: duration(timings.blocked), dns: duration(timings.dns), connect: duration(timings.connect),
      ssl: duration(timings.ssl), send: duration(timings.send), wait: duration(timings.wait), receive: duration(timings.receive)
    }
  };
  if (keepHeaders) summary.responseHeaders = readResponseHeaders(response);
  return summary;
}

function summarizePage(raw) {
  if (!raw || typeof raw !== "object") return null;
  const started = typeof raw.startedDateTime === "string" ? Date.parse(raw.startedDateTime) : NaN;
  return {
    id: text(raw.id, 40),
    startedMs: Number.isFinite(started) ? started : null,
    onContentLoad: duration(raw.pageTimings?.onContentLoad),
    onLoad: duration(raw.pageTimings?.onLoad)
  };
}

/**
 * Incremental tokenizer for { "log": { "creator", "browser", "pages": [], "entries": [] } }.
 * Feed it text chunks of any size; it emits each entry, page and creator object as it completes.
 */
export function createHarTokenizer({ onEntry, onPage, onMeta, onEntriesStart } = {}) {
  const QUOTE = 34, BACKSLASH = 92, OPEN_OBJ = 123, CLOSE_OBJ = 125, OPEN_ARR = 91, CLOSE_ARR = 93, COLON = 58, COMMA = 44;
  let depth = 0;
  let inString = false;
  let escaped = false;
  let rootKey = "";
  let logKey = "";
  let inLog = false;
  let mode = null;
  let awaiting = false;
  let skipValue = false;
  let readingKey = false;
  let keyBuf = "";
  let capturing = false;
  let captureKind = null;
  let captureName = "";
  let captureDepth = 0;
  let captureBuf = "";
  let malformed = 0;
  let rootStarted = false;
  let rootClosed = false;

  function finishCapture(source) {
    const kind = captureKind;
    const name = captureName;
    capturing = false;
    captureKind = null;
    captureName = "";
    let value;
    try { value = JSON.parse(source); } catch { malformed++; return; }
    if (kind === "entry") onEntry?.(value);
    else if (kind === "page") onPage?.(value);
    else onMeta?.(name, value);
  }

  const atLogLevel = () => depth === 1 || (depth === 2 && inLog);

  function write(chunk) {
    let captureStart = capturing ? 0 : -1;
    let keyStart = readingKey ? 0 : -1;
    for (let i = 0; i < chunk.length; i++) {
      const c = chunk.charCodeAt(i);
      if (inString) {
        if (escaped) escaped = false;
        else if (c === BACKSLASH) escaped = true;
        else if (c === QUOTE) {
          inString = false;
          if (readingKey) {
            keyBuf += chunk.slice(keyStart, i);
            let key = "";
            try { key = JSON.parse(`"${keyBuf}"`); } catch { malformed++; }
            if (depth === 1) rootKey = key; else if (depth === 2) logKey = key;
            readingKey = false;
            keyStart = -1;
          }
          if (skipValue) { skipValue = false; awaiting = false; }
        }
        continue;
      }
      if (c === QUOTE) {
        inString = true;
        if (!capturing && atLogLevel()) {
          if (awaiting) skipValue = true;
          else { readingKey = true; keyBuf = ""; keyStart = i + 1; }
        }
        continue;
      }
      if (c === COLON && !capturing && atLogLevel()) { awaiting = true; continue; }
      if (c === COMMA && !capturing && atLogLevel()) { awaiting = false; continue; }
      if (c === OPEN_OBJ || c === OPEN_ARR) {
        if (depth === 0 && c === OPEN_OBJ) rootStarted = true;
        if (!capturing) {
          if (depth === 1 && awaiting && rootKey === "log" && c === OPEN_OBJ) { inLog = true; awaiting = false; }
          else if (depth === 2 && inLog && awaiting && c === OPEN_ARR && (logKey === "entries" || logKey === "pages")) {
            mode = logKey;
            if (mode === "entries") onEntriesStart?.();
          } else if (depth === 2 && inLog && awaiting && c === OPEN_OBJ && (logKey === "creator" || logKey === "browser")) {
            capturing = true; captureKind = "meta"; captureName = logKey; captureDepth = 2; captureBuf = ""; captureStart = i;
          } else if (depth === 3 && mode && c === OPEN_OBJ) {
            capturing = true; captureKind = mode === "entries" ? "entry" : "page"; captureDepth = 3; captureBuf = ""; captureStart = i;
          }
        }
        depth++;
        continue;
      }
      if (c === CLOSE_OBJ || c === CLOSE_ARR) {
        depth--;
        if (capturing && depth === captureDepth) {
          finishCapture(captureBuf + chunk.slice(captureStart, i + 1));
          captureBuf = "";
          captureStart = -1;
          if (depth === 2) awaiting = false;
        } else if (!capturing) {
          if (depth === 2 && inLog) { if (mode && c === CLOSE_ARR) mode = null; awaiting = false; }
          else if (depth === 1) { inLog = false; awaiting = false; }
        }
        if (rootStarted && depth === 0) rootClosed = true;
      }
    }
    if (capturing && captureStart >= 0) captureBuf += chunk.slice(captureStart);
    if (readingKey && keyStart >= 0) keyBuf += chunk.slice(keyStart);
  }

  function end() {
    const integrity = {
      complete: rootStarted && rootClosed && depth === 0 && !inString && !capturing && !readingKey,
      discardedPartial: capturing || inString || readingKey,
      malformedEntries: malformed
    };
    capturing = false;
    captureBuf = "";
    return integrity;
  }

  return { write, end };
}

/** Incremental reader: write() text chunks, then finish() for the bounded summary. */
export function createHarReader({ maxEntries = 20000, keepHeaders = false } = {}) {
  const entries = [];
  const pages = [];
  const meta = {};
  let entryCount = 0;
  let sawEntries = false;
  const tokenizer = createHarTokenizer({
    onEntriesStart: () => { sawEntries = true; },
    onEntry: (raw) => {
      entryCount++;
      if (entries.length >= maxEntries) return;
      const summary = summarizeHarEntry(raw, { keepHeaders });
      if (summary) entries.push(summary);
    },
    onPage: (raw) => { const page = summarizePage(raw); if (page) pages.push(page); },
    onMeta: (name, value) => { meta[name] = { name: text(value?.name, 60), version: text(value?.version, 40) }; }
  });
  return {
    write: (chunk) => tokenizer.write(chunk),
    finish: () => {
      const integrity = tokenizer.end();
      return {
        recognized: sawEntries,
        entries,
        pages,
        creator: meta.creator || null,
        browser: meta.browser || null,
        entryCount,
        omitted: Math.max(0, entryCount - entries.length),
        integrity
      };
    }
  };
}
