/**
 * Streaming reader for a Chrome DevTools Performance profile (the Trace Event Format).
 *
 * A profile can be hundreds of megabytes, so it is never parsed whole: each event is parsed
 * on its own and only what SocketMap uses is kept, for the page's main thread only. Kept
 * data is bounded. Screenshots, source text, command lines and DOM node names are never kept;
 * URLs are redacted. Anything the profile did not record is null, never a default.
 *
 * Reads both shapes DevTools writes: { "traceEvents": [...], "metadata": {...} } and a bare
 * array of events. Times in a trace are microseconds on the browser's monotonic clock; here
 * they are milliseconds.
 *
 * No Node APIs: runs in the browser viewer as well.
 */

import { redactUrl } from "../redact.mjs";

const MAX_TASKS = 400000;
const MAX_WORK = 200000;
const MAX_REQUESTS = 5000;
const MAX_SMALL = 2000;
const LONG_TASK_MS = 50;

const SCRIPT_EVENTS = new Set(["EvaluateScript", "FunctionCall", "v8.compile", "v8.compileModule"]);
const WORK_EVENTS = { Layout: "layout", UpdateLayoutTree: "layout", Paint: "paint", PrePaint: "paint", Commit: "paint", ParseHTML: "parse" };

const ms = (us) => us / 1000;
const text = (value, max = 200) => (typeof value === "string" && value ? value.slice(0, max) : null);
const num = (value) => (typeof value === "number" && Number.isFinite(value) ? value : null);
const url = (value, max = 600) => (typeof value === "string" && value ? redactUrl(value.split("#")[0]).slice(0, max) : null);

/** Incremental tokenizer: emits every trace event and the metadata object as they complete. */
export function createTraceTokenizer({ onEvent, onMetadata } = {}) {
  const QUOTE = 34, BACKSLASH = 92, OPEN_OBJ = 123, CLOSE_OBJ = 125, OPEN_ARR = 91, CLOSE_ARR = 93, COLON = 58, COMMA = 44;
  let depth = 0, inString = false, escaped = false;
  let objectForm = false, rootKey = "", awaiting = false, skipValue = false;
  let inEvents = false, readingKey = false, keyBuf = "";
  let capturing = false, captureKind = null, captureDepth = 0, captureBuf = "";
  let malformed = 0, rootStarted = false, rootClosed = false, sawEvents = false;

  function finishCapture(source) {
    const kind = captureKind;
    capturing = false;
    captureKind = null;
    let value;
    try { value = JSON.parse(source); } catch { malformed++; return; }
    if (kind === "event") onEvent?.(value);
    else onMetadata?.(value);
  }

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
            try { rootKey = JSON.parse(`"${keyBuf}"`); } catch { malformed++; rootKey = ""; }
            readingKey = false;
            keyStart = -1;
          }
          if (skipValue) { skipValue = false; awaiting = false; }
        }
        continue;
      }
      if (c === QUOTE) {
        inString = true;
        if (!capturing && objectForm && depth === 1 && !inEvents) {
          if (awaiting) skipValue = true;
          else { readingKey = true; keyBuf = ""; keyStart = i + 1; }
        }
        continue;
      }
      if (c === COLON && !capturing && objectForm && depth === 1) { awaiting = true; continue; }
      if (c === COMMA && !capturing && objectForm && depth === 1 && !inEvents) { awaiting = false; continue; }
      if (c === OPEN_OBJ || c === OPEN_ARR) {
        if (depth === 0) { rootStarted = true; objectForm = c === OPEN_OBJ; if (c === OPEN_ARR) { inEvents = true; sawEvents = true; } }
        if (!capturing) {
          if (objectForm && depth === 1 && awaiting && c === OPEN_ARR && rootKey === "traceEvents") { inEvents = true; sawEvents = true; }
          else if (objectForm && depth === 1 && awaiting && c === OPEN_OBJ && rootKey === "metadata") {
            capturing = true; captureKind = "metadata"; captureDepth = 1; captureBuf = ""; captureStart = i;
          } else if (inEvents && c === OPEN_OBJ && depth === (objectForm ? 2 : 1)) {
            capturing = true; captureKind = "event"; captureDepth = depth; captureBuf = ""; captureStart = i;
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
          if (objectForm && depth === 1) awaiting = false;
        } else if (!capturing) {
          if (inEvents && objectForm && depth === 1 && c === CLOSE_ARR) { inEvents = false; awaiting = false; }
          else if (objectForm && depth === 1) awaiting = false;
        }
        if (rootStarted && depth === 0) rootClosed = true;
      }
    }
    if (capturing && captureStart >= 0) captureBuf += chunk.slice(captureStart);
    if (readingKey && keyStart >= 0) keyBuf += chunk.slice(keyStart);
  }

  function end() {
    return {
      complete: rootStarted && rootClosed && depth === 0 && !inString && !capturing && !readingKey,
      discardedPartial: capturing || inString || readingKey,
      malformedEntries: malformed,
      recognized: sawEvents
    };
  }
  return { write, end, get recognized() { return sawEvents; } };
}

function union(intervals) {
  if (!intervals.length) return 0;
  intervals.sort((a, b) => a[0] - b[0]);
  let total = 0;
  let [start, stop] = intervals[0];
  for (let i = 1; i < intervals.length; i++) {
    const [s, e] = intervals[i];
    if (s <= stop) { if (e > stop) stop = e; }
    else { total += stop - start; start = s; stop = e; }
  }
  return total + (stop - start);
}

/** Incremental reader: write() text chunks, then finish() for the bounded page-code summary. */
export function createTraceReader() {
  const threadNames = new Map();
  const perThread = new Map();
  const navs = [];
  const marks = { fp: [], fcp: [], lcp: [], shifts: [], dcl: [], load: [] };
  const requests = new Map();
  const meta = {};
  let eventCount = 0;
  let firstTs = Infinity;
  let lastTs = -Infinity;
  const key = (e) => `${e.pid}/${e.tid}`;
  const buffers = (e) => {
    const k = key(e);
    let b = perThread.get(k);
    if (!b) { b = { pid: e.pid, tid: e.tid, tasks: [], scripts: [], work: [] }; perThread.set(k, b); }
    return b;
  };
  const isMain = (e) => threadNames.get(key(e)) === "CrRendererMain";

  function onEvent(e) {
    if (!e || typeof e !== "object") return;
    eventCount++;
    const ts = num(e.ts);
    if (ts != null) { if (ts < firstTs) firstTs = ts; if (ts > lastTs) lastTs = ts; }
    const name = e.name;
    if (e.ph === "M") {
      if (name === "thread_name" && e.args?.name) threadNames.set(key(e), String(e.args.name).slice(0, 60));
      return;
    }
    if (ts == null) return;
    const data = e.args?.data;
    switch (name) {
      case "navigationStart":
        if (navs.length < MAX_SMALL && data?.isOutermostMainFrame && data?.isLoadingMainFrame) navs.push({ pid: e.pid, tid: e.tid, ts, frame: text(e.args?.frame ?? data.frame, 60), url: url(data.documentLoaderURL) });
        return;
      case "firstPaint": if (marks.fp.length < MAX_SMALL) marks.fp.push({ pid: e.pid, tid: e.tid, ts, frame: e.args?.frame ?? null }); return;
      case "firstContentfulPaint": if (marks.fcp.length < MAX_SMALL) marks.fcp.push({ pid: e.pid, tid: e.tid, ts, frame: e.args?.frame ?? null }); return;
      case "largestContentfulPaint::Candidate": if (marks.lcp.length < MAX_SMALL) marks.lcp.push({ pid: e.pid, tid: e.tid, ts, frame: e.args?.frame ?? null, size: num(data?.size), type: text(data?.type, 20) }); return;
      case "LayoutShift": if (marks.shifts.length < MAX_SMALL) marks.shifts.push({ pid: e.pid, tid: e.tid, ts, score: num(data?.score) ?? num(data?.weighted_score_delta), recentInput: data?.had_recent_input === true, mainFrame: data?.is_main_frame !== false }); return;
      case "domContentLoadedEventEnd": if (marks.dcl.length < MAX_SMALL) marks.dcl.push({ pid: e.pid, tid: e.tid, ts, frame: e.args?.frame ?? null }); return;
      case "loadEventEnd": if (marks.load.length < MAX_SMALL) marks.load.push({ pid: e.pid, tid: e.tid, ts, frame: e.args?.frame ?? null }); return;
      case "ResourceSendRequest":
        if (data?.requestId && requests.size < MAX_REQUESTS) {
          const frames = Array.isArray(data.stackTrace) ? data.stackTrace : [];
          const top = frames.find(f => f && f.url) || frames[0];
          const line = num(top?.lineNumber);
          requests.set(String(data.requestId), {
            pid: e.pid, tsMs: ms(ts), url: url(data.url, 8000), method: text(data.requestMethod, 16), priority: text(data.priority, 16),
            resourceType: text(data.resourceType, 32), renderBlocking: text(data.renderBlocking, 32),
            stack: top ? { fn: text(top.functionName, 60), url: url(top.url), line: line == null ? null : line + 1 } : null
          });
        }
        return;
      case "ResourceReceiveResponse": {
        const r = data?.requestId ? requests.get(String(data.requestId)) : null;
        if (r) Object.assign(r, { status: num(data.statusCode), mimeType: text(data.mimeType, 100), fromCache: data.fromCache === true, viaServiceWorker: data.fromServiceWorker === true, protocol: text(data.protocol, 16) });
        return;
      }
      default:
    }
    if (e.ph !== "X" || !isMain(e)) return;
    const dur = num(e.dur);
    if (dur == null) return;
    if (name === "RunTask") {
      const b = buffers(e);
      if (b.tasks.length < MAX_TASKS * 2) b.tasks.push(ts, dur);
    } else if (SCRIPT_EVENTS.has(name)) {
      const b = buffers(e);
      if (b.scripts.length < MAX_WORK) b.scripts.push({ ts, dur, type: name, url: url(data?.url) || url(e.args?.fileName), fn: text(data?.functionName, 60) });
    } else if (WORK_EVENTS[name]) {
      const b = buffers(e);
      if (b.work.length < MAX_WORK) b.work.push({ ts, dur, kind: WORK_EVENTS[name] });
    }
  }

  const tokenizer = createTraceTokenizer({
    onEvent,
    onMetadata: (m) => {
      if (!m || typeof m !== "object") return;
      meta.clockDomain = text(m["clock-domain"], 40);
      meta.cores = num(m["cpu-num-cores"]);
      meta.efficientCores = num(m["cpu-num-efficient-cores"]);
      const memory = Number(m["physical-memory"]);
      meta.memoryMb = Number.isFinite(memory) && memory > 0 ? memory : null;
      meta.capturedAt = text(m["trace-capture-datetime"], 40);
      meta.userAgent = text(m["user-agent"], 200);
      meta.inVm = m["cpu-running-in-vm"] === 1 ? true : m["cpu-running-in-vm"] === 0 ? false : null;
    }
  });

  function finish() {
    const integrity = tokenizer.end();
    const base = { recognized: tokenizer.recognized && eventCount > 0, eventCount, integrity, environment: { clockDomain: meta.clockDomain ?? null, cores: meta.cores ?? null, efficientCores: meta.efficientCores ?? null, memoryGb: meta.memoryMb == null ? null : Math.round(meta.memoryMb / 1024 * 10) / 10, capturedAt: meta.capturedAt ?? null, userAgent: meta.userAgent ?? null, inVm: meta.inVm ?? null } };
    if (!base.recognized) return { ...base, page: null };
    // The page is the outermost main frame's most recent navigation to a web document. Blank tabs,
    // chrome:// pages and extension pages navigate too (often after the page loads) and are not the page.
    const nav = [...navs].reverse().find(n => n.url && /^https?:/i.test(n.url)) || null;
    if (!nav) return { ...base, page: null };
    const sameThread = (x) => x.pid === nav.pid && x.tid === nav.tid;
    const after = (x) => x.ts >= nav.ts;
    const b = perThread.get(`${nav.pid}/${nav.tid}`) || { tasks: [], scripts: [], work: [] };
    const navMs = ms(nav.ts);
    // Only events that name the page's own frame count: other frames and frameless events are not the page.
    const lastOf = (list) => list.filter(x => sameThread(x) && after(x) && x.frame && (!nav.frame || x.frame === nav.frame)).sort((a, b2) => a.ts - b2.ts);
    const fcp = lastOf(marks.fcp)[0] || null;
    const fp = lastOf(marks.fp)[0] || null;
    const lcpList = lastOf(marks.lcp);
    const lcp = lcpList.length ? lcpList[lcpList.length - 1] : null;
    const load = lastOf(marks.load).at(-1) || null;
    // The page's DOMContentLoaded is the last one at or before its load event.
    const dclList = lastOf(marks.dcl).filter(x => !load || x.ts <= load.ts);
    const dcl = dclList.at(-1) || null;
    const shifts = marks.shifts.filter(s => s.pid === nav.pid && s.ts >= nav.ts && s.mainFrame && !s.recentInput && s.score != null);

    // Tasks on the page's main thread.
    const tasks = [];
    for (let i = 0; i < b.tasks.length; i += 2) if (b.tasks[i] >= nav.ts) tasks.push([b.tasks[i], b.tasks[i + 1]]);
    tasks.sort((x, y) => x[0] - y[0]);
    const lastEnd = tasks.length ? Math.max(...tasks.map(([t, d]) => t + d)) : nav.ts;
    const windowEnd = Math.max(load ? load.ts : nav.ts, lcp ? lcp.ts : nav.ts, Math.min(lastEnd, nav.ts + 60_000_000));
    const spanMs = ms(windowEnd - nav.ts);
    const inWindow = tasks.filter(([t]) => t <= windowEnd);
    const busyMs = ms(inWindow.reduce((sum, [, d]) => sum + d, 0));
    // Busy time up to the page's own load, the moment people wait for.
    const loadEnd = Math.max(load ? load.ts : nav.ts, lcp ? lcp.ts : nav.ts, fcp ? fcp.ts : nav.ts);
    const loadWindowMs = ms(loadEnd - nav.ts);
    const loadBusyMs = ms(tasks.filter(([t]) => t <= loadEnd).reduce((sum, [t, d]) => sum + Math.min(d, Math.max(0, loadEnd - t)), 0));
    const scriptsSorted = b.scripts.filter(s => s.ts >= nav.ts).sort((x, y) => x.ts - y.ts);
    const workSorted = b.work.filter(s => s.ts >= nav.ts).sort((x, y) => x.ts - y.ts);

    const within = (list, from, to) => list.filter(x => x.ts < to && x.ts + x.dur > from);
    const longTasks = inWindow.filter(([, d]) => ms(d) >= LONG_TASK_MS).map(([t, d]) => {
      const scripts = within(scriptsSorted, t, t + d);
      const byUrl = new Map();
      for (const s of scripts) { const k = s.url || "inline or unknown script"; (byUrl.get(k) || byUrl.set(k, []).get(k)).push([Math.max(s.ts, t), Math.min(s.ts + s.dur, t + d)]); }
      const top = [...byUrl].map(([u, iv]) => ({ url: u, ms: ms(union(iv)) })).sort((x, y) => y.ms - x.ms).slice(0, 3);
      const kinds = {};
      for (const kind of ["layout", "paint", "parse"]) kinds[kind] = ms(union(within(workSorted, t, t + d).filter(w => w.kind === kind).map(w => [Math.max(w.ts, t), Math.min(w.ts + w.dur, t + d)])));
      return { startMs: ms(t - nav.ts), durMs: ms(d), scriptMs: ms(union(scripts.map(s => [Math.max(s.ts, t), Math.min(s.ts + s.dur, t + d)]))), top, layoutMs: kinds.layout, paintMs: kinds.paint, parseMs: kinds.parse };
    });
    const blockingMs = longTasks.reduce((sum, t) => sum + Math.max(0, t.durMs - LONG_TASK_MS), 0);

    // Activity bins for the waterfall band.
    const binMs = Math.max(20, Math.ceil(spanMs / 300 / 10) * 10);
    const bins = new Array(Math.max(1, Math.ceil(spanMs / binMs))).fill(0);
    for (const [t, d] of inWindow) {
      let s = ms(t - nav.ts);
      const e2 = s + ms(d);
      while (s < e2) {
        const idx = Math.min(bins.length - 1, Math.floor(s / binMs));
        const stop = Math.min(e2, (idx + 1) * binMs);
        bins[idx] += (stop - s) / binMs;
        s = stop;
        if (idx === bins.length - 1 && stop >= e2) break;
      }
    }

    // Scripts by time on the main thread (union, so nested calls are not counted twice).
    const perScript = new Map();
    for (const s of scriptsSorted) {
      if (s.ts > windowEnd) continue;
      const k = s.url || "inline or unknown script";
      const row = perScript.get(k) || { url: k, all: [], compile: [], calls: 0 };
      row.all.push([s.ts, s.ts + s.dur]);
      if (s.type.startsWith("v8.compile")) row.compile.push([s.ts, s.ts + s.dur]);
      if (s.type === "FunctionCall") row.calls++;
      perScript.set(k, row);
    }
    const scripts = [...perScript.values()].map(r => ({ url: r.url, totalMs: ms(union(r.all)), compileMs: ms(union(r.compile)), calls: r.calls })).sort((x, y) => y.totalMs - x.totalMs).slice(0, 30);

    const kindTotal = (kind) => ms(union(workSorted.filter(w => w.kind === kind && w.ts <= windowEnd).map(w => [w.ts, w.ts + w.dur])));
    const scriptingMs = ms(union(scriptsSorted.filter(s => s.ts <= windowEnd).map(s => [s.ts, s.ts + s.dur])));
    const layoutMs = kindTotal("layout");
    const paintMs = kindTotal("paint");
    const parseMs = kindTotal("parse");

    const reqs = [...requests.values()].filter(r => r.pid === nav.pid).sort((x, y) => x.tsMs - y.tsMs);
    return {
      ...base,
      page: { url: nav.url, navTsMs: navMs, spanMs, frame: nav.frame },
      metrics: {
        firstPaintMs: fp ? ms(fp.ts - nav.ts) : null,
        fcpMs: fcp ? ms(fcp.ts - nav.ts) : null,
        lcpMs: lcp ? ms(lcp.ts - nav.ts) : null,
        lcpType: lcp?.type ?? null,
        lcpSize: lcp?.size ?? null,
        domContentLoadedMs: dcl ? ms(dcl.ts - nav.ts) : null,
        loadMs: load ? ms(load.ts - nav.ts) : null,
        layoutShiftScore: shifts.length ? shifts.reduce((sum, s) => sum + s.score, 0) : (marks.shifts.length ? 0 : null),
        layoutShifts: shifts.length
      },
      mainThread: {
        taskCount: inWindow.length,
        busyMs,
        busyFraction: spanMs > 0 ? Math.min(1, busyMs / spanMs) : null,
        loadWindowMs,
        loadBusyMs,
        loadBusyFraction: loadWindowMs > 0 ? Math.min(1, loadBusyMs / loadWindowMs) : null,
        longTasks: longTasks.slice(0, 60),
        longTaskCount: longTasks.length,
        blockingMs,
        longestMs: inWindow.length ? ms(Math.max(...inWindow.map(([, d]) => d))) : null,
        binMs,
        bins: bins.map(v => Math.round(Math.min(1, v) * 100) / 100),
        breakdown: { scriptingMs, layoutMs, paintMs, parseMs, otherMs: Math.max(0, busyMs - scriptingMs - layoutMs - paintMs - parseMs) }
      },
      scripts,
      requests: reqs
    };
  }

  return { write: (chunk) => tokenizer.write(chunk), finish };
}
